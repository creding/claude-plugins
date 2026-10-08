#!/usr/bin/env node
// Deterministic frame renderer for a motion-studio scene (see ../SKILL.md, "Render contract").
// The scene page must define: window.W, window.H, window.FPS, window.DUR, window.ready (Promise),
// window.renderFrame(t, sub, frameIndex), and optionally window.EVENTS / window.CAPTIONS.
//
// Usage (run from anywhere; SCENE defaults to ./src/index.html):
//   node render.mjs stills 0.5,3,8 [sub]       -> out/stills/t_XX.XX.png
//   node render.mjs determinism 4.2            -> renders one frame twice, fails if bytes differ
//   node render.mjs events                     -> out/events.json   (cue times for the audio script)
//   node render.mjs captions                   -> out/captions.srt  (from window.CAPTIONS)
//   node render.mjs safezones [step]           -> fails if any text or image (logo) enters platform UI zones
//   node render.mjs video [workers] [sub]      -> PNG frames in $FRAMES_DIR, encoded to $OUT_VIDEO
// Env: SCENE=path/to/index.html  OUT=out-dir  QUERY="format=16x9&x=1"  FRAMES_DIR  OUT_VIDEO  FROM_FRAME
// Needs: npm i playwright && npx playwright install chromium ; ffmpeg on PATH.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

// Playwright resolves from the project you run in (the skill folder has no node_modules).
let chromium;
try { ({ chromium } = createRequire(path.join(process.cwd(), 'x.js'))('playwright')); }
catch { console.error('Playwright not found here. In the project folder run: npm i -D playwright && npx playwright install chromium'); process.exit(1); }

const [mode = 'video', a1 = '', a2 = ''] = process.argv.slice(2);
const scene = path.resolve(process.env.SCENE || 'src/index.html');
const out = path.resolve(process.env.OUT || 'out');
mkdirSync(path.join(out, 'stills'), { recursive: true });
const url = pathToFileURL(scene).href + '?render=1' + (process.env.QUERY ? '&' + process.env.QUERY : '');

const browser = await chromium.launch();
let pagesOpened = 0;
async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('[pageerror]', e.message); process.exitCode = 1; });
  if (pagesOpened++ === 0) page.on('console', m => { if (['warning', 'error'].includes(m.type())) console.warn('[scene]', m.text()); });
  await page.addInitScript(TRACK_BOXES);
  await page.goto(url);
  try { await page.evaluate(() => window.ready); }
  catch (e) { console.error('scene failed to get ready:', e.message.split('\n')[0]); await browser.close(); process.exit(1); }
  const meta = await page.evaluate(() => { const c = document.querySelector('canvas'); return { W: window.W ?? c.width, H: window.H ?? c.height, FPS: window.FPS ?? 30, DUR: window.DUR }; });
  await page.setViewportSize({ width: meta.W, height: meta.H });
  return { page, canvas: await page.$('canvas'), meta };
}
async function grab({ page, canvas }, t, sub, idx) {
  await page.evaluate(([t, sub, idx]) => window.renderFrame(t, sub, idx), [t, sub, idx]);
  return canvas.screenshot({ type: 'png' });
}
// Records the on-screen box of every fillText/strokeText and every image drawn onto the visible canvas
// (offscreen canvases are skipped; their pixels arrive via drawImage(canvas), which is not an image).
const TRACK_BOXES = () => {
  const P = CanvasRenderingContext2D.prototype, rec = (ctx, kind, label, x0, y0, x1, y1) => {
    if (!window.__trackBoxes || !ctx.canvas.isConnected || ctx.globalAlpha < 0.05) return;
    const m = ctx.getTransform(), pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    window.__boxes.push({ kind, label, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
  };
  for (const fn of ['fillText', 'strokeText']) { const orig = P[fn]; P[fn] = function (text, x, y, ...rest) {
    if (String(text).trim()) { const k = this.measureText(text); rec(this, 'text', String(text), x - k.actualBoundingBoxLeft, y - k.actualBoundingBoxAscent, x + k.actualBoundingBoxRight, y + k.actualBoundingBoxDescent); }
    return orig.call(this, text, x, y, ...rest); }; }
  const di = P.drawImage; P.drawImage = function (img, ...a) {
    if (!(img instanceof HTMLCanvasElement) && !(typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas)) {
      const [dx, dy, dw, dh] = a.length >= 8 ? a.slice(4, 8) : a.length >= 4 ? a.slice(0, 4) : [a[0], a[1], img.width, img.height];
      rec(this, 'image', (img.src || 'image').split('/').pop(), dx, dy, dx + dw, dy + dh);
    }
    return di.call(this, img, ...a); };
};
// Words drawn one at a time (kinetic captions) become one line: same baseline band, small horizontal gap.
function mergeLines(boxes) {
  const same = (a, b) => a.label === b.label && Math.abs(a.box[0] - b.box[0]) < 12 && Math.abs(a.box[1] - b.box[1]) < 12;
  const uniq = boxes.filter((b, i) => !boxes.slice(0, i).some(o => same(o, b)));          // shadow + fill passes of one word
  const text = uniq.filter(b => b.kind === 'text').sort((a, b) => a.box[0] - b.box[0]), out = uniq.filter(b => b.kind !== 'text');
  for (const b of text) {
    const h = b.box[3] - b.box[1];
    const line = out.find(o => { if (o.kind !== 'text') return false; const oh = o.box[3] - o.box[1], ov = Math.min(o.box[3], b.box[3]) - Math.max(o.box[1], b.box[1]), gap = b.box[0] - o.box[2];
      return ov > 0.6 * Math.min(h, oh) && Math.abs(h - oh) < 0.5 * Math.max(h, oh) && gap > -0.2 * h && gap < 0.9 * h; });
    if (line) { line.label += ' ' + b.label; line.box = [Math.min(line.box[0], b.box[0]), Math.min(line.box[1], b.box[1]), Math.max(line.box[2], b.box[2]), Math.max(line.box[3], b.box[3])]; }
    else out.push({ ...b, box: [...b.box] });
  }
  return out;
}
// Platform UI zones. Vertical defaults are a conservative union of TikTok / Reels / Shorts organic UI
// (top bar ~15%, caption+username block ~25%, side rails ~10%); 'warn' adds the extra bottom band ads use.
// A scene can override with window.SAFE_ZONES = [{ name, x0, y0, x1, y1, level }].
function defaultZones(W, H) {
  if (H / W > 1.5) return [
    { name: 'top bar', x0: 0, y0: 0, x1: W, y1: 0.15 * H, level: 'fail' },
    { name: 'bottom captions/username', x0: 0, y0: 0.75 * H, x1: W, y1: H, level: 'fail' },
    { name: 'left edge', x0: 0, y0: 0, x1: 0.10 * W, y1: H, level: 'fail' },
    { name: 'right rail (like/share)', x0: 0.90 * W, y0: 0, x1: W, y1: H, level: 'fail' },
    { name: 'ad CTA band', x0: 0, y0: 0.65 * H, x1: W, y1: 0.75 * H, level: 'warn' } ];
  const m = 0.05;   // title-safe for 16:9 and 1:1
  return [{ name: 'title-safe margin', x0: 0, y0: 0, x1: W, y1: m * H, level: 'fail' }, { name: 'title-safe margin', x0: 0, y0: (1 - m) * H, x1: W, y1: H, level: 'fail' },
          { name: 'title-safe margin', x0: 0, y0: 0, x1: m * W, y1: H, level: 'fail' }, { name: 'title-safe margin', x0: (1 - m) * W, y0: 0, x1: W, y1: H, level: 'fail' }];
}

const fmt = t => `t_${t.toFixed(2).padStart(5, '0')}.png`;

if (mode === 'stills') {
  const p = await openPage(), sub = Number(a2 || 5);
  for (const t of a1.split(',').map(Number)) { const f = path.join(out, 'stills', fmt(t)); writeFileSync(f, await grab(p, t, sub, Math.round(t * p.meta.FPS))); console.log(f); }
} else if (mode === 'determinism') {
  // Same page re-render (catches carried state) AND a second fresh page (what parallel video workers do).
  const p = await openPage(), q = await openPage(), t = Number(a1 || 1), i = Math.round(t * p.meta.FPS);
  const a = await grab(p, t, 5, i); await grab(p, t + 3, 5, i + 90); const b = await grab(p, t, 5, i); const c = await grab(q, t, 5, i);
  if (Buffer.compare(a, b) === 0 && Buffer.compare(a, c) === 0) console.log(`deterministic: frame at ${t}s identical across re-renders and pages (${a.length} bytes)`);
  else { console.error(`NOT deterministic at ${t}s (${Buffer.compare(a, b) ? 'same page differs: carried state' : 'pages differ: load-order, font or async state'}); look for wall-clock time, Math.random(), state kept between frames, or assets still loading`); process.exitCode = 1; }
} else if (mode === 'events') {
  const p = await openPage(); const ev = await p.page.evaluate(() => window.EVENTS || {});
  writeFileSync(path.join(out, 'events.json'), JSON.stringify(ev, null, 1)); console.log(path.join(out, 'events.json'));
} else if (mode === 'captions') {
  const p = await openPage(); const caps = await p.page.evaluate(() => window.CAPTIONS || []);
  const ts = s => { const ms = Math.round(s * 1000); return new Date(ms).toISOString().slice(11, 23).replace('.', ','); };
  const srt = caps.map((c, i) => `${i + 1}\n${ts(c.t0)} --> ${ts(c.t1)}\n${c.text}\n`).join('\n');
  writeFileSync(path.join(out, 'captions.srt'), srt); console.log(`${caps.length} captions -> ${path.join(out, 'captions.srt')}`);
} else if (mode === 'safezones') {
  const p = await openPage(), step = Number(a1 || 1 / 6), { W, H, DUR } = p.meta;
  const zones = (await p.page.evaluate(() => window.SAFE_ZONES)) || defaultZones(W, H), hits = new Map(), tol = 4;
  for (let t = 0; t < DUR; t += step) {
    const boxes = await p.page.evaluate(t => { window.__boxes = []; window.__trackBoxes = true; window.renderFrame(t, 1, Math.round(t * window.FPS)); window.__trackBoxes = false; return window.__boxes; }, t);
    for (const b of mergeLines(boxes)) {
      const [x0, y0, x1, y1] = b.box;
      const offFrame = x0 < -tol || y0 < -tol || x1 > W + tol || y1 > H + tol;
      for (const z of offFrame ? [{ name: 'off frame', level: 'fail' }] : zones.filter(z => x0 < z.x1 - tol && x1 > z.x0 + tol && y0 < z.y1 - tol && y1 > z.y0 + tol)) {
        const key = `${z.level}|${z.name}|${b.kind}|${b.label.replace(/\d/g, '#')}`, segs = hits.get(key) || [], last = segs[segs.length - 1];
        if (last && t - last.to <= step * 1.5) last.to = t; else segs.push({ ...z, kind: b.kind, label: b.label, from: t, to: t, box: b.box });
        hits.set(key, segs);
      }
    }
  }
  const MIN_FAIL = 0.3;   // seconds; shorter crossings are transitions (slide-ins, exits)
  const rows = [...hits.values()].flat().map(h => h.level === 'fail' && h.to - h.from + step < MIN_FAIL ? { ...h, level: 'warn', name: h.name + ' (brief)' } : h).sort((a, b) => a.from - b.from);
  for (const h of rows) console.log(`${h.level === 'fail' ? 'FAIL' : 'warn'}  ${h.from.toFixed(2)}-${h.to.toFixed(2)}s  ${h.kind} "${h.label.slice(0, 40)}" in ${h.name}  [box ${h.box.map(Math.round).join(',')}]`);
  const fails = rows.filter(h => h.level === 'fail').length;
  console.log(fails ? `${fails} safe-zone failure(s) across ${(DUR / step) | 0} sampled frames` : `safe zones clear across ${(DUR / step) | 0} sampled frames (${rows.length} warnings)`);
  if (fails) process.exitCode = 1;
} else if (mode === 'video') {
  const workers = Number(a1 || Math.max(2, Math.min(8, os.cpus().length - 4))), sub = Number(a2 || 5);
  const frames = process.env.FRAMES_DIR || path.join(out, 'frames');
  const from = Number(process.env.FROM_FRAME || 0);              // >0: re-render only frames from here, keep the rest
  if (!from) rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const pages = await Promise.all(Array.from({ length: workers }, openPage));
  const { FPS, DUR } = pages[0].meta; const n = Math.round(DUR * FPS);
  let next = from, done = 0; const t0 = Date.now();
  await Promise.all(pages.map(async p => {
    while (next < n) { const i = next++; writeFileSync(path.join(frames, `f_${String(i).padStart(5, '0')}.png`), await grab(p, i / FPS, sub, i));
      if (++done % 60 === 0) console.log(`frame ${from + done}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`); }
  }));
  const have = readdirSync(frames).filter(f => f.endsWith('.png')).length;
  if (have !== n) { console.error(`expected ${n} frames, found ${have}`); process.exitCode = 1; }
  const target = process.env.OUT_VIDEO || path.join(out, 'video-silent.mp4');
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f_%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', target], { stdio: 'inherit' });
  console.log(r.status === 0 ? `wrote ${target} (${n} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s)` : 'ffmpeg failed');
  if (r.status !== 0) process.exitCode = 1;
} else { console.error(`unknown mode "${mode}"`); process.exitCode = 1; }
await browser.close();
