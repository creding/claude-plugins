#!/usr/bin/env node
// nanobanana — generate images with Google's Gemini image models ("Nano Banana").
// Zero dependencies: uses Node's built-in fetch (Node 18+). No npm install required,
// so it runs from any repo.
//
// Usage:
//   node generate-image.mjs "a photorealistic metal roof at golden hour" \
//     [--model gemini-3.1-flash-image] [--aspect 16:9] [--size 2K] \
//     [--n 1] [--out ./nanobanana-images] [--name my-image]
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
    else if (a.startsWith("--")) fail(`unknown flag: ${a}`);
    else promptParts.push(a);
  }
  opts.prompt = promptParts.join(" ").trim();
  return opts;
}

function printHelp() {
  console.log(`nanobanana — generate images with Gemini image models

Usage:
  node generate-image.mjs "<prompt>" [options]

Options:
  --model <id>    ${MODELS.join(", ")}
                  (default: ${DEFAULT_MODEL})
  --aspect <r>    ${VALID_ASPECTS.join(", ")}
  --size <s>      ${VALID_SIZES.join(", ")}
  --n <count>     number of variations (default: 1)
  --out <dir>     output directory (default: ./nanobanana-images)
  --name <base>   base filename (default: derived from prompt)
  -h, --help      show this help

API key: $GEMINI_API_KEY, then $GOOGLE_GENERATIVE_AI_API_KEY,
         then ~/.config/nanobanana/key`);
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

async function generateOnce(apiKey, opts, useImageConfig) {
  const body = {
    contents: [{ parts: [{ text: opts.prompt }] }],
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
    signal: AbortSignal.timeout(120000),
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
    err.body = json;
    throw err;
  }
  return json;
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

  const apiKey = await resolveApiKey();
  await mkdir(opts.out, { recursive: true });
  const base = opts.name || slugify(opts.prompt);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const written = [];
  for (let i = 0; i < opts.n; i++) {
    let json;
    try {
      json = await generateOnce(apiKey, opts, true);
    } catch (e) {
      // Graceful fallback: some models/versions reject imageConfig. Retry once
      // with the aspect ratio folded into the prompt text instead.
      if (e.status === 400 && (opts.aspect || opts.size)) {
        console.error(
          `nanobanana: imageConfig rejected (${e.message}); retrying with aspect/size in the prompt`,
        );
        const hint = [opts.aspect && `aspect ratio ${opts.aspect}`, opts.size && `${opts.size} resolution`]
          .filter(Boolean)
          .join(", ");
        const retryOpts = { ...opts, prompt: `${opts.prompt} (${hint})` };
        json = await generateOnce(apiKey, retryOpts, false);
      } else {
        fail(`API error (${e.status || "network"}): ${e.message}`);
      }
    }
    const img = extractImage(json);
    if (!img) fail(extractText(json) || "no image returned by the model");
    const suffix = opts.n > 1 ? `-${i + 1}` : "";
    const file = path.resolve(opts.out, `${base}-${stamp}${suffix}.${extForMime(img.mime)}`);
    await writeFile(file, Buffer.from(img.data, "base64"));
    written.push(file);
    console.error(`✓ ${path.basename(file)} (${img.mime})`);
  }

  // Machine-readable tail: one absolute path per line for the caller to read.
  for (const f of written) console.log(f);
}

main().catch((e) => fail(e?.message || String(e)));
