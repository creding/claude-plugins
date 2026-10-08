# Verification

Run each check and paste its output. Don't claim a check you didn't run. You cannot hear audio or watch motion directly, so verify through measurements, frames and transcripts.

| Check | How | Pass |
|---|---|---|
| Determinism | `node render.mjs determinism <t>` at 2-3 times incl. one mid-effect | identical bytes |
| Fast actions | 12-frame strip around each (`critique.md`) | no pops, overlaps or one-frame glitches |
| Loop seam (looping films) | `ffmpeg -stream_loop 1` playback | last frame equals the first, motion continuous |
| Every beat, still | `render.mjs stills` at the middle of every beat, view as a contact sheet | each frame reads on its own; focal element obvious |
| Phone readability | `phone_check.png` from `finish.sh` (frames at 390 px wide) | every caption legible |
| Safe zones | `node render.mjs safezones` in every delivered format | 0 FAIL (it records every text and image drawn and tests it against platform UI zones) |
| Muted pass | read only the captions in order | the story survives without sound |
| Audio-only pass | spectrogram (`ffmpeg -lavfi showspectrumpic`) + per-section bus levels + cue list vs events.json | cues on actions, music not buried, no dead air except deliberate silence |
| Voice | `audio_tools.py transcribe` on the **final mixed file** | full script recovered word for word; anchors within ~0.1 s of targets |
| Loudness | `audio_tools.py loudness final.mp4` | -14 LUFS (social) / -16 (explainer), true peak under target |
| Accessibility | contrast of caption vs background >= 4.5:1; count flashes | color is never the only signal; <= 3 flashes per second; offer a reduced-motion cut (same sequence, no camera shake, no flashes) when the brief is educational |
| Brand | stills of every logo appearance at full res | vector logo, correct background, not cropped, sharp |
| Facts | every number / offer / claim vs `SOURCES.md` | all traced |
| Design review | a fresh subagent gets the contact sheet + scene specs and answers: what is this for, who is it for, what is it communicating, what would you cut? | answers match the brief; act on cuts |

Quality (hook, motion, variety, composition) is scored in the critique loop: `critique.md`, every score 8+.

Every fix ships with a before/after frame pair at the same timestamp.

After a re-render, re-pull frames **from the encoded file**, not from the stills folder: a failed render can silently leave the old video in place.
