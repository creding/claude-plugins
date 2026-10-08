# Critique loop

Checks (verification.md) catch what is *wrong*. This loop makes the film *good*. Run it on stills before the full render, and again on the encoded video. Minimum three rounds on a new film; one round on a re-cut.

## Make the evidence

```bash
# one frame per beat (from TIMELINE) or every 0.5 s
node scripts/render.mjs stills 0.5,1.0,1.5,...      # then tile them, or from a render:
ffmpeg -i out/video-silent.mp4 -vf "fps=2,scale=270:-1,tile=6x5" -frames:v 1 review/contact.png
# 12 consecutive frames around every fast action (catches pops, overlaps, one-frame glitches)
ffmpeg -ss 4.1 -i out/video-silent.mp4 -vf "scale=320:-1,tile=12x1" -frames:v 1 review/strip_4.1.png
# phone size: how it actually reads in a feed
ffmpeg -i out/video-silent.mp4 -vf "fps=1,scale=360:-1,tile=6x5" -frames:v 1 review/phone.png
# loop seam (only if the film should loop)
ffmpeg -stream_loop 1 -i out/final.mp4 -c copy review/loop_check.mp4
```

Open every image and look at it properly. Judge as a harsh motion director, not the proud author.

## Score 1-10

| Dimension | 8+ means |
|---|---|
| Hook | frame 1 already has motion and words; a stranger knows within 2 s why to keep watching |
| Readability | every word legible in `phone.png`; nothing in platform UI (`safezones` = 0 FAIL) |
| Motion quality | springs or settled curves, no linear slides, no dead frames, one focal action at a time |
| Variety | something new happens every 2-4 s; no two consecutive beats use the same move |
| Composition | clear focal point per frame, consistent grid, depth where the energy dial asks for it |
| Brand accuracy | tokens, vector logo on its required background, real assets, voice and claims on-brand |
| Sound sync | cues on actions and beats; music audible under SFX; voice anchors within ~0.1 s |

## Fix and repeat

1. Write the three worst problems **with timestamps** to `review/review_log.md` along with the scores.
2. Hunt specifically for: text overlapping during swaps, anything sliding instead of springing, labels or frames in corners, a centered title on a gradient, everything fading in the same way, scaled text going soft, a beat where nothing happens, a stutter at the loop seam.
3. Fix those three, re-render only the affected seconds (`FROM_FRAME`, or stills), post the before/after frame pair, re-score.
4. Stop when every score is 8 or higher. If a score is stuck after two rounds, change the approach for that beat instead of polishing it.

For a second opinion, give a fresh subagent `contact.png`, `phone.png` and the scene specs (not your reasoning) and ask for its scores and its three worst problems.
