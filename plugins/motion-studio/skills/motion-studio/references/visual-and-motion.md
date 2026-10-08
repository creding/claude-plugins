# Visual system and motion language

## Reference first

Without a reference the model falls back to its defaults. Get one: a frame, a video, or a folder of past work.
- Video: `ffmpeg -i ref.mp4 -vf fps=2 refs/frames/%03d.png`, study the frames, then write `docs/style_guide.md`: palette (hex), type (family, weight, tracking), shot lengths, transition types, camera moves, texture/grain, how text enters and exits.
- Take the **grammar** of the reference (pacing, type behaviour, transitions), never its content, logos or characters.
- Name a look rather than describing one ("Swiss grid explainer", "PC-98 pixel art", "editorial collage").
- For a product or company: gather real assets first (site screenshots with Playwright, real photos from past jobs, the vector logo) into `./assets` and list them before animating. Never redraw a real UI or product from imagination.

## Tokens before drawing

Pull palette, type and spacing from the brand (`./brand`, a brand skill such as `patriot-brand`, or the client's site) into one `TOK` object at the top of the scene. Nothing hard-codes a color or size outside it.

- One ground color, one ink, **one** accent, one muted. Accent marks the single thing to look at.
- Two typefaces at most (display + text). Load them via CSS `@font-face` and await `document.fonts` before rendering.
- One spacing grid (`TOK.grid`); positions and sizes are multiples of it.
- Logos: use the vector master (SVG) from the client's logo folder, never a small PNG upscaled. Respect the brand's background rule (e.g. "logo only on white": use a white card or lockup, never place it on a dark scene). Never crop, recolor or stretch it, including during animation; reveal with fade/scale, not a wipe that clips it.
- Prefer real UI, real data, real diagrams over illustration. When illustrating a physical system, use a cutaway that shows the mechanism.

## Motion carries meaning

- Movement must say something: grouping, order, cause, or scale. If an element moves and the meaning doesn't change, hold it still.
- One focal action at a time. Everything else holds. Stagger secondary elements so they finish before the focal action starts.
- Keep objects alive across scenes and transform them (a dot becomes a node, a label becomes an axis, the hero leaf becomes part of the pile). Replacing objects resets the viewer's model.
- The camera reframes *between* ideas and is still while text is being read.

## Springs (default for anything that moves)

Fixed easing curves look cheap; springs have mass. The template's `spring(t, k, d)` is closed-form, so it stays a pure function of `t`.

| Feel | k / d | Use |
|---|---|---|
| Snappy | 320 / 30 | UI elements, buttons, leading edges |
| Default | 170 / 26 | cards, containers, camera |
| Heavy | 120 / 24 | big type, logo lockups, 3D objects |
| Playful | 220 / 14 | mascots, stickers (visible overshoot) |

- A value that changes target several times (cursor, container width, bar height) uses `track(t, keys)`: one spring per change, summed. Never restart a spring.
- Stretchy indicators: leading edge on a stiffer spring than the trailing edge.
- Text inside a morphing container enters after the morph starts and leaves before the next one begins.
- Tiny overshoot on UI, none on type.

## Easing and timing

| Use | Curve | Notes |
|---|---|---|
| Element settles into place (default) | quartic ease-out, no overshoot | explainer default |
| Camera move between ideas | quartic in-out | 0.6-1.2 s |
| Hit / pop on a social hook | back-out (overshoot ~1.7) | sparingly, only on beats |
| Exits | ease-in, 60-70% of entry duration | |

- Read time: ~0.3 s per word on screen plus 0.5 s; a line must hold still at least that long.
- Text enters word by word (60-80 ms stagger) only when the words land on a sound or voice beat.

## Energy dial

Choose per brief and write it in `DECISIONS.md`:

| | Explainer (calm) | Social ad (bold) |
|---|---|---|
| Ground | warm neutral, flat | scene with depth (parallax layers, cutaways) |
| Camera | slow reframes | handheld drift, punch-ins on impacts, one dutch angle max |
| Effects | none beyond depth and shadow | motion blur, bloom on highlights, grain, impact flash, chromatic shift on 1-2 hits |
| Grade | neutral | cool for the problem, warm for the fix (mood shift is part of the story) |
| Transitions | match cuts, morphs | one smash cut, one rewind or split reveal |

Even in bold mode, each effect must mark a story beat.

**Banned defaults** (the giveaways of AI-made video): a centered title on a gradient; everything fading in the same way; labels, frames or borders in the corners; glow on UI chrome; generic particle bursts or ambient floating particles; stock 3D blobs; gradient title cards; a logo slapped on at the end. Weather and debris that are part of the physics (rain, splinters, spray) are fine.

**Variety:** something new happens on screen every 2-4 seconds, and no two consecutive beats use the same move.

## Layout and safe zones

- 9:16: words, logos and key action stay inside the safe area: below the top 15%, above the bottom 25%, 10% in from each side (1080x1920: x 108-972, y 288-1440). That is a conservative union of TikTok, Reels and Shorts UI; ads add a CTA band up to 35% from the bottom. Size text to this area, not to the frame width.
- 16:9 and 1:1: 5% title-safe margin.
- `render.mjs safezones` enforces all of this automatically; `?guides=1` shows it in previews and stills.
- Recompose for 1:1 rather than cropping: move captions and re-center the focal element.
- Readability test: the frame scaled to 390 px wide (a phone in a feed) must still be legible (`finish.sh` writes `phone_check.png`).
