# Libraries inside the render contract

The canvas scene stays the core (no dependencies, fully deterministic). Bring a library in only when it saves real work, and always drive it from `t`: pause its own clock and seek it every frame. If a library can't be seeked to an exact time, it can't be used. After adding one, run `render.mjs determinism` at a moment where it's animating.

Load from a CDN in `index.html` (cdnjs / jsdelivr / unpkg) or vendor the file into `src/` for offline renders. Await anything async (fonts, JSON, models) inside `window.ready`.

| Library | Use it for | Seek pattern | License |
|---|---|---|---|
| **GSAP** (+ SplitText, DrawSVG, MorphSVG) | heavy choreography, SVG line-draw and morph, per-letter text | `const tl = gsap.timeline({ paused: true }); ... tl.seek(t)` in `drawScene`; render the SVG to the canvas or use it as an overlay layer | free, plugins included |
| **Lottie** (`lottie-web`) | designer-made After Effects / LottieFiles pieces: icons, checkmarks, weather | `anim = lottie.loadAnimation({ autoplay: false, renderer: 'canvas', ... })`; per frame `anim.goToAndStop((t - start) * anim.frameRate, true)` | MIT; check each LottieFiles asset's license |
| **Three.js** | real 3D (house model, roof cutaway, rotating product) | build the scene once; per frame set every transform from `t`, `renderer.render(scene, cam)`, then `ctx.drawImage(renderer.domElement, ...)`; use `preserveDrawingBuffer: true`; no `Clock` | MIT |
| **d3** (scales, shapes, interpolators) | data-driven charts and map paths | use its math only (scales, `d3.interpolate`, path generators); never its transitions/timers | ISC |
| **AI video plates** (Veo, Seedance, Kling via fal) | photoreal background shots under the graphics | render the clip first, then per frame `video.currentTime = t - start` and wait for `seeked` before drawing (do it in render mode only) or pre-extract frames with ffmpeg | per provider; disclose AI |

Avoid for rendered video: CSS animations/transitions, `requestAnimationFrame`-driven libraries without a seek API, physics engines stepping on wall-clock time (step them with a fixed `dt` from 0 to `t` instead, and cache), anything reading `Date.now()`.

Bigger alternatives (switch frameworks only with a reason): **Remotion** (React, frame-based; paid company license above 3 employees) and **Motion Canvas** (TypeScript, MIT). Both are good; the render contract here already gives the same guarantees.

For editing **real footage** (talking heads, job-site clips) into reels, use a footage-editing tool such as the IT Reelsmaker plugin; this skill is for code-rendered motion graphics.
