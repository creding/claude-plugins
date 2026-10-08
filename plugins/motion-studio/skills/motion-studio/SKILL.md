---
name: motion-studio
description: Use when making a motion-graphics or animated video, explainer, social reel / short / TikTok ad, animated logo sting, or any code-rendered animation that must ship as an MP4 with sound and captions. Also use when fixing safe zones, caption fit, narration timing, voice-over quality, loudness or render quality in such a video.
---

# Motion Studio

The deliverable is a **finished, rendered video with sound and captions**, plus the source that re-renders it exactly. A plan, moodboard or still frame is not the deliverable.

You play the whole studio: creative director, writer, motion designer, sound designer, render engineer. When the brief is thin, make the call, log it in one line in `DECISIONS.md`, and keep moving. Stop only for missing rights or assets, unsafe content, an ambiguity that changes the goal, or anything that publishes or touches an account.

## Where it runs

- **Claude Code / desktop Code tab:** full pipeline. Needs Node 18+, `npm i -D playwright && npx playwright install chromium` in the project, ffmpeg, Python 3 (+ numpy for mixing). ElevenLabs key optional.
- **claude.ai chat / Cowork without a shell:** do steps 1-4, write the scene from `scripts/template/`, preview it as an HTML artifact, and say that rendering needs Claude Code.

Paths below are relative to this skill's folder.

## Workflow

Run new films at high reasoning effort (xhigh/max); medium is fine for fixes and re-renders. Films over ~45 s: write `docs/ANIMATION_GUIDE.md` first, then split chapters across subagents that all follow it.

1. **Idea.** One sentence: the idea and what the viewer can do after watching. Discovery, arcs and copy rules: `references/story-and-copy.md`. Every number/claim goes in `SOURCES.md`.
2. **Reference and assets.** Get a reference (frame, video, past work) and write `docs/style_guide.md` from it; gather real assets (vector logo, real photos/screenshots) into `./assets`. `references/visual-and-motion.md`.
3. **Directions** (new brand or format only): 3-4 directions side by side in one `directions.html`; mark the winner and why in `DECISIONS.md`. Skip on re-cuts.
4. **Timing mode.** Picture-led (`events.json`) or music-led (`scripts/beats.py` → `beats.json`). `references/sound.md`.
5. **Scene specs.** One per scene (template in story-and-copy.md): time range, what it teaches, frame, motion, words, sound cue, check. Something new every 2-4 s.
6. **Build** from `scripts/template/` (copy to `src/`): tokens first, springs (`spring`, `track`) for anything that moves.
7. **Stills + critique loop** before the full render: `references/critique.md`, every score 8+. `safezones` and `determinism` must pass.
8. **Full render:** `render.mjs video [workers] 5` (5 motion-blur sub-frames). Frames go to a scratch dir (`FRAMES_DIR`), never a cloud-synced folder.
9. **Sound** with `scripts/audio_tools.py`; **captions** with `render.mjs captions`.
10. **Verify** (`references/verification.md`), one more critique round on the encoded file, then **deliver** with `scripts/finish.sh` (`references/delivery.md`).

## Render contract

- `renderFrame(t)` paints the frame at time `t` and nothing else: a pure function of `t`. No `Date.now()`, `Math.random()`, CSS animation or state carried between frames. Seeded random only.
- One `TIMELINE` object holds every beat, caption and sound cue. Audio reads cue times from it (`events.json`); never retype a time.
- Captions and HUD text draw once per frame, after the motion-blurred scene, so they stay sharp.
- Libraries (GSAP, Lottie, Three.js, d3, video plates) are allowed only seeked to `t`: `references/libraries.md`.

## Gates (all must pass; paste the output)

| Gate | Command |
|---|---|
| Deterministic | `node scripts/render.mjs determinism <t>` at 2-3 times, one mid-animation |
| Safe zones | `node scripts/render.mjs safezones` → 0 FAIL in every delivered format |
| Critique | `review/review_log.md` shows every score 8+ (`references/critique.md`) |
| Phone legible | `phone_check.png` from `finish.sh` (390 px wide) |
| Voice | every take passes `audio_tools.good_take`; final mix transcribed word for word |
| Loudness | `python3 scripts/audio_tools.py loudness <final.mp4>` → -14 LUFS social (-16 explainer), TP ≤ -1 |
| Facts & brand | every claim in `SOURCES.md`; logos are vector, on their required background, never cropped |

`render.mjs safezones` records every text and image drawn on the visible canvas and fails if any sits in platform UI for 0.3 s or more (vertical: top 15%, bottom 25%, sides 10%; 16:9 and 1:1: 5% title-safe). It works on any canvas scene, template or not.

## Mistakes this skill exists to prevent

| Mistake | Fix |
|---|---|
| Text sized to the frame width (fit to 940 px) runs into the like/share rail | Fit text to the safe area (`safeArea()` in the template); run `safezones` |
| Safe zones "checked" by eye | `safezones` gate; eyes miss the rail on every frame |
| Trusting a TTS take | Transcribe it; one take had a stray laugh. `good_take` rejects and regenerates |
| Narration starting over the cold open, lines piling up late | Start VO where the story starts; anchor key words to beats (`anchor_offset`); print target vs actual |
| Dramatic trailer voice on a home-problem story read as creepy | Warm, steady voice (stability ~0.6, style ~0.15); send 3-4 samples, the client picks |
| Music buried under SFX | Print per-section bus levels; keep music within 3-6 dB of SFX |
| Small PNG logo upscaled; logo cropped by a wipe; logo on a dark scene against brand rules | Vector master from the client's logo folder; fade/scale reveals; white card or lockup |
| Re-render failed silently and the old MP4 got encoded | Check the frame count and re-pull verification frames from the encoded file |
| Main phone line on a video | Use the client's video call-tracking number (look at earlier video descriptions) |
| Centered title on a gradient, everything fading in, corner labels | Banned defaults list in visual-and-motion.md; reference + style guide first |
| Linear slides and restarted easings | `spring` / `track`: one spring per target change |
| Shipping the first render | Critique loop: score, fix the 3 worst, repeat until 8+ |
| Delivering a plan instead of a video | The workflow ends at `finish.sh` output, not at the scene specs |
