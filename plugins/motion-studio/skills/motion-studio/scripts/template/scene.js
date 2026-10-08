// motion-studio starter scene. Copy this folder to <project>/src and replace the demo beats.
// Contract (render.mjs depends on it): every frame is a pure function of t. No Date.now(), no Math.random(),
// no state carried between frames. One TIMELINE object owns every beat, caption and sound cue.
'use strict';

// ---------- format ----------
const FORMATS = { '9x16': [1080, 1920], '16x9': [1920, 1080], '1x1': [1080, 1080] };
const Q = new URLSearchParams(location.search);
const [W, H] = FORMATS[Q.get('format') || '9x16'];
const FPS = 30;
const canvas = document.getElementById('c'); canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d');

// ---------- tokens (pull these from the brand before drawing anything) ----------
const TOK = {
  ground: '#F4F1EA', ink: '#1B1E26', accent: '#C2412D', muted: '#8A8F98',   // muted = lines only (2.9:1 on ground; text needs 4.5:1)
  display: '"Helvetica Neue", Helvetica, Arial', text: '"Helvetica Neue", Helvetica, Arial',
  grid: Math.round(Math.min(W, H) / 24),            // spacing unit; positions snap to multiples of it
  fonts: [['Helvetica Neue', [400, 600, 700]]],      // families the film needs; rendering refuses to start if one is missing
};

// ---------- timeline: the single source of truth ----------
// Each beat: id, [t0, t1], what it teaches, on-screen words (<= 8 per line, <= 2 lines), sound cue at the key action.
const TIMELINE = {
  dur: 9,
  beats: [
    { id: 'question', t0: 0.0, t1: 3.0, teaches: 'the thing people get wrong', words: ['One dot.', 'Why does it matter?'], cue: { name: 'pop', at: 0.35 } },
    { id: 'model',    t0: 3.0, t1: 6.0, teaches: 'the dot becomes a measured bar', words: ['It grows with every week.'], cue: { name: 'rise', at: 3.4 } },
    { id: 'payoff',   t0: 6.0, t1: 9.0, teaches: 'the opening image, read correctly', words: ['Same dot.', 'Now you can read it.'], cue: { name: 'resolve', at: 6.5 } },
  ],
};
TIMELINE.beats.forEach(b => b.words.forEach(l => { if (l.split(/\s+/).length > 8) console.warn(`caption over 8 words in "${b.id}": ${l}`); }));
if (TIMELINE.beats.some(b => b.words.length > 2)) console.warn('a beat has more than two caption lines');
TIMELINE.beats.forEach(b => { const n = b.words.join(' ').split(/\s+/).length, need = 0.3 * n + 0.5;           // read time
  if (b.t1 - b.t0 < need) console.warn(`"${b.id}" is on screen ${(b.t1 - b.t0).toFixed(2)}s; ${n} words need ${need.toFixed(2)}s`); });
const CUTS = [0, TIMELINE.dur];                       // add hard-cut times here; motion blur never blends across them

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, p) => a + (b - a) * p;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const settle = p => 1 - Math.pow(1 - p, 4);            // decelerate into place, no overshoot (explainer default)
const inOut = p => p < .5 ? 8 * p ** 4 : 1 - Math.pow(-2 * p + 2, 4) / 2;
const punch = p => { const c = 1.7; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; }; // overshoot, social hooks only
// Closed-form damped spring 0 -> 1: still a pure function of time, so any frame renders without simulating the ones before it.
// Presets: snappy UI 320/30, default containers/camera 170/26, heavy type & logos 120/24, playful (visible overshoot) 220/14.
function spring(t, k = 170, d = 26) {
  if (t <= 0) return 0; const w0 = Math.sqrt(k), z = d / (2 * w0);
  if (z < 1) { const wd = w0 * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t)); }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}
// A value that changes target several times: one spring per change, summed. keys = [[time, value], ...] sorted by time.
function track(t, keys, k = 170, d = 26) { let v = keys[0][1]; for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], k, d); return v; }
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const beat = id => TIMELINE.beats.find(b => b.id === id);

// ---------- state: one pure function of t ----------
function stateAt(t) {
  const m = beat('model'), p = beat('payoff');
  const grow = spring(t - (m.t0 + 0.2), 120, 24);                                  // heavy: the object gains mass
  return {
    t,
    // ONE object across all beats: a dot that becomes a bar, then is read with a label.
    dotX: W / 2, dotY: H * 0.68,                                                     // below the caption block, above the bottom UI zone
    barH: track(t, [[0, 0], [m.t0 + 0.2, H * 0.14], [m.t0 + 1.4, H * 0.22]], 170, 26),  // two target changes, one continuous motion
    barW: lerp(TOK.grid * 1.2, TOK.grid * 3, clamp(grow)),
    label: settle(seg(t, p.t0 + 0.3, p.t0 + 0.9)),
    cam: { z: lerp(1.15, 1, inOut(seg(t, 0, 1.2))) * lerp(1, 1.06, inOut(seg(t, p.t0, p.t1))) },
  };
}

// ---------- drawing ----------
function drawScene(t) {
  const s = stateAt(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = TOK.ground; ctx.fillRect(0, 0, W, H);
  applyCamera(s);
  // baseline axis appears with the model beat
  const ax = settle(seg(t, 3.0, 3.6));
  ctx.strokeStyle = TOK.muted; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W / 2 - 300 * ax, s.dotY + 2); ctx.lineTo(W / 2 + 300 * ax, s.dotY + 2); ctx.stroke();
  // the persistent object
  ctx.fillStyle = TOK.accent;
  const r = Math.min(s.barW / 2, TOK.grid);
  roundRect(s.dotX - s.barW / 2, s.dotY - Math.max(s.barW, s.barH), s.barW, Math.max(s.barW, s.barH), r); ctx.fill();
}
function applyCamera(s) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.translate(W / 2, H / 2); ctx.scale(s.cam.z, s.cam.z); ctx.translate(-W / 2, -H / 2); }
// Overlay pass: labels, numbers, HUD. Drawn once per frame after the motion-blurred scene so text stays sharp,
// in the same camera space as the scene so labels stay attached to what they name.
function drawOverlay(t) {
  const s = stateAt(t); applyCamera(s);
  if (s.label > 0) { ctx.globalAlpha = s.label; ctx.fillStyle = TOK.ink; ctx.font = `600 ${TOK.grid * 1.4}px ${TOK.text}`; ctx.textAlign = 'left';
    ctx.fillText('60 days', s.dotX + s.barW / 2 + TOK.grid, s.dotY - s.barH + TOK.grid); ctx.globalAlpha = 1; }
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// Captions: max two lines, one beat at a time, inside the platform safe zone. Drawn once per frame (never motion-blurred).
function drawCaptions(t) {
  const b = TIMELINE.beats.find(x => t >= x.t0 && t < x.t1); if (!b) return;
  const fadeIn = b.t0 <= 0 ? 1 : clamp((t - b.t0) / 0.25);                      // the hook is readable on frame 1
  const a = fadeIn * (1 - clamp((t - (b.t1 - 0.2)) / 0.2));
  const size = captionSize(), fit = captionFit(b), SZ = safeArea();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.fillStyle = TOK.ink;
  ctx.font = `700 ${Math.floor(size * fit)}px ${TOK.display}`;
  const top = SZ.y0 + TOK.grid + size * fit * 0.8;                              // first baseline: cap height below the top bar
  b.words.slice(0, 2).forEach((line, i) => ctx.fillText(line, (SZ.x0 + SZ.x1) / 2, top + i * size * fit * 1.2 + (1 - settle(a)) * 16));
  ctx.globalAlpha = 1;
}
const captionSize = () => Math.round(TOK.grid * (W < H ? 2.0 : 1.8));
const MIN_CAPTION_PX = Math.round(0.055 * Math.min(W, H));   // ~59 px at 1080: still legible on a phone in a feed
// Both lines share one size (captions live inside the safe area); a long line shrinks both, so loadFonts warns if that
// drops below MIN_CAPTION_PX: split the line or shorten the copy.
function captionFit(b) {
  const maxW = safeArea().x1 - safeArea().x0 - 2 * TOK.grid; ctx.font = `700 ${captionSize()}px ${TOK.display}`;
  return Math.min(1, ...b.words.slice(0, 2).map(l => maxW / ctx.measureText(l).width));
}
// Platform UI covers the edges of vertical video. Same numbers as `render.mjs safezones` (conservative TikTok/Reels/Shorts union):
// top 15%, bottom 25%, sides 10%. 16:9 and 1:1 use a 5% title-safe margin. Override both by setting window.SAFE_ZONES.
function safeArea() { return H / W > 1.5 ? { x0: 0.10 * W, y0: 0.15 * H, x1: 0.90 * W, y1: 0.75 * H } : { x0: 0.05 * W, y0: 0.05 * H, x1: 0.95 * W, y1: 0.95 * H }; }
function drawGuides() {
  const a = safeArea(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(255,0,0,0.18)';
  ctx.fillRect(0, 0, W, a.y0); ctx.fillRect(0, a.y1, W, H - a.y1); ctx.fillRect(0, a.y0, a.x0, a.y1 - a.y0); ctx.fillRect(a.x1, a.y0, W - a.x1, a.y1 - a.y0);
}

// ---------- frame (motion blur = average of sub-frames inside a 180-degree shutter) ----------
const acc = document.createElement('canvas'); acc.width = W; acc.height = H; const actx = acc.getContext('2d');
function segBounds(t) { for (let i = 1; i < CUTS.length; i++) if (t < CUTS[i]) return [CUTS[i - 1], CUTS[i]]; return [CUTS[CUTS.length - 2], TIMELINE.dur]; }
function renderFrame(t, sub = 1, frameIdx = Math.round(t * FPS)) {
  if (sub > 1) {
    const [a, b] = segBounds(t), shutter = 0.5 / FPS;
    for (let k = 0; k < sub; k++) { drawScene(clamp(t + ((k + 0.5) / sub - 0.5) * shutter, a, b - 1e-4)); actx.globalAlpha = 1 / (k + 1); actx.drawImage(canvas, 0, 0); }
    actx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(acc, 0, 0);
  } else drawScene(t);
  drawOverlay(t);
  drawCaptions(t);
  if (Q.get('guides') === '1' || window.__guides) drawGuides();
}

// ---------- exports for render.mjs / audio ----------
Object.assign(window, { W, H, FPS, DUR: TIMELINE.dur, renderFrame,
  EVENTS: Object.fromEntries(TIMELINE.beats.map(b => [b.cue.name, b.cue.at])),
  CAPTIONS: TIMELINE.beats.map(b => ({ t0: b.t0, t1: b.t1, text: b.words.join('\n') })),
  ready: loadFonts() });

// A font that silently falls back renders the first frames wrong. Load every face, then prove each family is
// really in use by measuring it against generic fallbacks; reject (and fail the render) if one is missing.
async function loadFonts() {
  await Promise.all(TOK.fonts.flatMap(([fam, ws]) => ws.map(w => document.fonts.load(`${w} 100px "${fam}"`))));
  await document.fonts.ready;
  const m = document.createElement('canvas').getContext('2d'), probe = 'mmmmwwwwlliiQQ@#2026';
  const width = f => { m.font = f; return m.measureText(probe).width; };
  const missing = TOK.fonts.filter(([fam]) => ['monospace', 'serif'].every(g => width(`100px "${fam}", ${g}`) === width(`100px ${g}`))).map(([f]) => f);
  if (missing.length) throw new Error('fonts not available: ' + missing.join(', '));
  TIMELINE.beats.forEach(b => { const px = Math.floor(captionSize() * captionFit(b));
    if (px < MIN_CAPTION_PX) console.warn(`"${b.id}" caption shrinks to ${px}px (min ${MIN_CAPTION_PX}): split the line or shorten the copy`); });
}

// ---------- preview (open index.html directly) ----------
if (Q.get('render') !== '1') {
  document.body.classList.add('preview');
  const scrub = document.getElementById('scrub'), tc = document.getElementById('tc'), pp = document.getElementById('pp');
  scrub.max = TIMELINE.dur; let playing = true, t = 0, last = performance.now();
  pp.onclick = () => { playing = !playing; pp.textContent = playing ? 'Pause' : 'Play'; };
  scrub.oninput = () => { t = +scrub.value; playing = false; pp.textContent = 'Play'; };
  document.getElementById('guides').onchange = e => { window.__guides = e.target.checked; };
  const loop = now => { if (playing) t = (t + (now - last) / 1000) % TIMELINE.dur; last = now; renderFrame(t); scrub.value = t; tc.textContent = t.toFixed(2); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
