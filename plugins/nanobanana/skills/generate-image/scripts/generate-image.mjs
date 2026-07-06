#!/usr/bin/env node
// nanobanana — generate & edit images with Google's Gemini image models ("Nano Banana").
// Zero dependencies: uses Node's built-in fetch (Node 18+). No npm install required,
// so it runs from any repo.
//
// Text-to-image:
//   node generate-image.mjs "a photorealistic metal roof at golden hour" --aspect 16:9 --size 2K
//
// Image-to-image / rendering from source photo(s):
//   node generate-image.mjs "add a large composite deck where the marked lines show" \
//     --image ./house.jpg --image ./markup.jpg \
//     --model gemini-3-pro-image --perspective photoreal,topdown,drawing,angled
//
// API key resolution (first hit wins):
//   1. $GEMINI_API_KEY
//   2. $GOOGLE_GENERATIVE_AI_API_KEY
//   3. ~/.config/nanobanana/key   (file containing just the key)

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const MODELS = [
  "gemini-3.1-flash-image", // generalist workhorse (default)
  "gemini-3-pro-image", // premium, most complex visual tasks
  "gemini-3.1-flash-lite-image", // fastest / cheapest (1K max)
  "gemini-2.5-flash-image", // legacy "Nano Banana"
];
const DEFAULT_MODEL = process.env.GEMINI_IMAGE_MODEL || MODELS[0];
const VALID_ASPECTS = ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const VALID_SIZES = ["512px", "1K", "2K", "4K"];
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Architect-style perspective presets. Each appends a viewpoint/style instruction to the
// user's prompt so a single request yields a coherent set of renderings of the same scene.
const PERSPECTIVES = {
  photoreal:
    "Produce a photorealistic architectural visualization. Keep the existing house, " +
    "surroundings, and camera viewpoint from the source photo, and realistically integrate " +
    "the requested changes with matching lighting, shadows, materials, scale, and perspective.",
  topdown:
    "Produce a top-down bird's-eye aerial plan view, as if seen from directly above, clearly " +
    "showing the layout, footprint, and proportions of the new structure in relation to the " +
    "house and yard.",
  drawing:
    "Produce a clean architectural presentation drawing: precise CAD/hand-drawn-style line work " +
    "with light shading and simple annotations on a white background, like an architect's " +
    "concept sketch.",
  angled:
    "Produce a three-quarter, eye-level perspective rendering of the finished result, viewed " +
    "from a front corner to convey depth and how the new structure connects to the house.",
};
const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

function fail(msg) {
  console.error(`nanobanana: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    prompt: "",
    model: DEFAULT_MODEL,
    aspect: undefined,
    size: undefined,
    n: 1,
    out: "./nanobanana-images",
    name: undefined,
    images: [],
    perspectives: [],
  };
  const promptParts = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else if (a === "--model") opts.model = argv[++i];
    else if (a === "--aspect") opts.aspect = argv[++i];
    else if (a === "--size") opts.size = argv[++i];
    else if (a === "--n") opts.n = parseInt(argv[++i], 10);
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--name") opts.name = argv[++i];
    else if (a === "--image") opts.images.push(argv[++i]);
    else if (a === "--perspective" || a === "--perspectives") {
      const val = argv[++i] || "";
      opts.perspectives.push(...val.split(",").map((s) => s.trim()).filter(Boolean));
    } else if (a.startsWith("--")) fail(`unknown flag: ${a}`);
    else promptParts.push(a);
  }
  opts.prompt = promptParts.join(" ").trim();
  return opts;
}

function printHelp() {
  console.log(`nanobanana — generate & edit images with Gemini image models

Usage:
  node generate-image.mjs "<prompt>" [options]

Options:
  --image <path>      source image to edit/reference (repeatable, up to 14).
                      Enables image-to-image rendering. Any writing/markings in the
                      image are read and followed by the model.
  --perspective <list>  comma-separated set to render the same scene multiple ways:
                      ${Object.keys(PERSPECTIVES).join(", ")}, or "all"
  --model <id>        ${MODELS.join(", ")}
                      (default: ${DEFAULT_MODEL}; use gemini-3-pro-image for renderings)
  --aspect <r>        ${VALID_ASPECTS.join(", ")}
  --size <s>          ${VALID_SIZES.join(", ")}
  --n <count>         variations per perspective (default: 1)
  --out <dir>         output directory (default: ./nanobanana-images)
  --name <base>       base filename (default: derived from prompt)
  -h, --help          show this help

API key: $GEMINI_API_KEY, then $GOOGLE_GENERATIVE_AI_API_KEY, then ~/.config/nanobanana/key`);
}

async function resolveApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY)
    return process.env.GOOGLE_GENERATIVE_AI_API_KEY.trim();
  const keyFile = path.join(homedir(), ".config", "nanobanana", "key");
  if (existsSync(keyFile)) {
    const k = (await readFile(keyFile, "utf8")).trim();
    if (k) return k;
  }
  fail(
    "no API key found. Set GEMINI_API_KEY in your shell (export GEMINI_API_KEY=...),\n" +
      "  or write it to ~/.config/nanobanana/key",
  );
}

function slugify(s) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "image"
  );
}

function extForMime(mime) {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

// Read source images from disk into Gemini inlineData parts.
async function loadImageParts(paths) {
  const parts = [];
  for (const p of paths) {
    const abs = path.resolve(p);
    if (!existsSync(abs)) fail(`source image not found: ${p}`);
    const ext = path.extname(abs).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) fail(`unsupported source image type '${ext}' (${p}). Use jpg, png, webp, gif, heic.`);
    const buf = await readFile(abs);
    parts.push({ inlineData: { mimeType: mime, data: buf.toString("base64") } });
  }
  return parts;
}

// Pull the first inline image out of a generateContent response.
function extractImage(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    const inline = p.inlineData || p.inline_data;
    if (inline?.data) {
      return { data: inline.data, mime: inline.mimeType || inline.mime_type || "image/png" };
    }
  }
  return null;
}

// Collect any text the model returned (used to surface refusals / safety blocks).
function extractText(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text).filter(Boolean).join(" ").trim();
  if (text) return text;
  const block = json?.promptFeedback?.blockReason || json?.candidates?.[0]?.finishReason;
  return block ? `model returned no image (${block})` : "";
}

async function generateOnce(apiKey, opts, promptText, imageParts, useImageConfig) {
  // Source images come first, then the text instruction — the order Gemini expects.
  const parts = [...imageParts, { text: promptText }];
  const body = {
    contents: [{ parts }],
    generationConfig: { responseModalities: ["IMAGE"] },
  };
  if (useImageConfig && (opts.aspect || opts.size)) {
    body.generationConfig.imageConfig = {};
    if (opts.aspect) body.generationConfig.imageConfig.aspectRatio = opts.aspect;
    if (opts.size) body.generationConfig.imageConfig.imageSize = opts.size;
  }
  const url = `${API_BASE}/${encodeURIComponent(opts.model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok) {
    const apiMsg = json?.error?.message || text.slice(0, 300);
    const err = new Error(apiMsg);
    err.status = res.status;
    throw err;
  }
  return json;
}

// One generation (with the imageConfig-rejection fallback), returns the saved file path.
async function renderOne(apiKey, opts, promptText, imageParts, base, label, stamp, idx) {
  let json;
  try {
    json = await generateOnce(apiKey, opts, promptText, imageParts, true);
  } catch (e) {
    if (e.status === 400 && (opts.aspect || opts.size)) {
      const hint = [opts.aspect && `aspect ratio ${opts.aspect}`, opts.size && `${opts.size} resolution`]
        .filter(Boolean)
        .join(", ");
      console.error(`nanobanana: imageConfig rejected (${e.message}); retrying with it in the prompt`);
      json = await generateOnce(apiKey, opts, `${promptText} (${hint})`, imageParts, false);
    } else {
      fail(`API error (${e.status || "network"}): ${e.message}`);
    }
  }
  const img = extractImage(json);
  if (!img) fail(extractText(json) || "no image returned by the model");
  const parts = [base, label, idx].filter((s) => s !== "" && s != null);
  const file = path.resolve(opts.out, `${parts.join("-")}-${stamp}.${extForMime(img.mime)}`);
  await writeFile(file, Buffer.from(img.data, "base64"));
  console.error(`✓ ${path.basename(file)} (${img.mime})`);
  return file;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.prompt) {
    printHelp();
    fail("a prompt is required");
  }
  if (!MODELS.includes(opts.model))
    console.error(`nanobanana: warning — '${opts.model}' is not a known model id; sending anyway`);
  if (opts.aspect && !VALID_ASPECTS.includes(opts.aspect))
    fail(`invalid --aspect '${opts.aspect}'. Valid: ${VALID_ASPECTS.join(", ")}`);
  if (opts.size && !VALID_SIZES.includes(opts.size))
    fail(`invalid --size '${opts.size}'. Valid: ${VALID_SIZES.join(", ")}`);
  if (!Number.isInteger(opts.n) || opts.n < 1) fail("--n must be a positive integer");

  // Resolve the perspective set.
  let perspectives = opts.perspectives;
  if (perspectives.includes("all")) perspectives = Object.keys(PERSPECTIVES);
  for (const p of perspectives)
    if (!PERSPECTIVES[p])
      fail(`unknown --perspective '${p}'. Valid: ${Object.keys(PERSPECTIVES).join(", ")}, all`);

  const apiKey = await resolveApiKey();
  const imageParts = await loadImageParts(opts.images);
  if (opts.images.length) console.error(`nanobanana: using ${opts.images.length} source image(s)`);
  await mkdir(opts.out, { recursive: true });
  const base = opts.name || slugify(opts.prompt);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  // Build the job list: one entry per (perspective × variation).
  const jobs = [];
  const labels = perspectives.length ? perspectives : [""];
  for (const label of labels) {
    const promptText = label ? `${opts.prompt}\n\n${PERSPECTIVES[label]}` : opts.prompt;
    for (let i = 0; i < opts.n; i++) {
      const idx = opts.n > 1 ? String(i + 1) : "";
      jobs.push({ promptText, label, idx });
    }
  }

  const written = [];
  for (const job of jobs) {
    written.push(await renderOne(apiKey, opts, job.promptText, imageParts, base, job.label, stamp, job.idx));
  }

  // Machine-readable tail: one absolute path per line for the caller to read.
  for (const f of written) console.log(f);
}

main().catch((e) => fail(e?.message || String(e)));
