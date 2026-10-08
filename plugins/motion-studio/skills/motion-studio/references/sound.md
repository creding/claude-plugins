# Sound

Two timing modes; pick one per film and write it in `DECISIONS.md`:

- **Picture-led** (story films, explainers): the scene owns time. `node render.mjs events` writes `out/events.json`; the audio script reads cue times from it. Never retype a time the scene already knows. For continuous sound (rain that swells, flow that speeds up), export curves too: `EVENTS.curves = { rain: [...] }` sampled once per frame from the same state function the picture uses.
- **Music-led** (reels, launch films, anything with a supplied track): the music owns time. `python3 scripts/beats.py track.mp3 > beats.json` (or `--bpm 120 --dur 30` for music you will synthesize or compose at that tempo). The scene loads `beats.json` in `window.ready`: state changes on beats, big moments on downbeats, SFX on hits. Start on a downbeat. Measured accuracy: tempo within 0.2 BPM, beats within ~15 ms.

## Layers

1. **Bed / score**: one motif that returns on the key idea. Options, best first:
   - ElevenLabs Music with a composition plan (`audio_tools.music_sections`): one section per story beat, lengths matched to the edit. Sections must be >= 3 s, so merge short beats; put a section boundary exactly on the most important cut (the impact, the reveal). Instrumental only (negative styles: vocals, lyrics).
   - A tempo-locked procedural bed when there's no API key, built from `audio_tools` synth helpers (`osc`, `noise`, `env`, `lp`/`hp`/`bp`, `karplus` for plucks; numpy only, no scipy). Seed all noise. Lock the tempo (`beats.py --bpm`) so cuts land on beats.
2. **Cues**: sound only on actions that carry meaning (the snap, the crack, the click). One cue per key action, timed to the frame. ElevenLabs SFX (`audio_tools.sfx`): describe the physical event, material and distance ("aluminum gutter ripping off a wooden fascia, metal screech, splinters, close").
3. **Ambience**: room tone or weather under the scene, ducked when anything else speaks.
4. **Voice** (optional): see below.

## Voice

- Default is captions-only (most feeds play muted). Make a narrated cut as a second deliverable to A/B, not a replacement, unless the brief asks for VO.
- Voice choice: for a local business, pick warm and steady (stability ~0.6, style ~0.15, speed ~1.05). Deep "movie trailer" voices with dramatic settings can read as creepy on a problem story. Send 3-4 short samples of the same lines and let the client choose; never pick for them by label alone.
- Script mirrors the on-screen anchors; short lines; start narration where the story starts (cold opens usually play better with sound design only).
- **Every take is verified, not assumed** (`audio_tools.good_take`): transcribe with Scribe, require an exact word match and no tagged audio events (laughs, breaths), else regenerate with the next seed.
- **Anchor words to picture beats** (`audio_tools.anchor_offset`): e.g. the end of "hits" lands on the thunder, the end of "loose" on the rip, each step word on its title. Trim each take to its first/last word (+0.28 s tail). If anchors force overlaps, tighten the script or raise speed slightly on that line; print target vs actual for every anchor.

## Mix

- Duck music and SFX under the voice with a sidechain envelope (`audio_tools.sidechain`), ~-10 dB while speaking.
- Action scenes: music sits 3-6 dB **under** the SFX (the effects carry the hits, the score carries momentum). Calm, explainer and payoff scenes: music leads, SFX 3-6 dB under it. A buried score and a score that drowns the effects are both amateur tells; print per-section bus levels before mastering.
- Phones: most viewers hear a phone speaker that can't reproduce much below ~150 Hz. Keep sub-bass restrained, high-pass the master (`master_wav` does 40 Hz), and check `audio_tools.py balance mix.wav` (aim for roughly 30-50% of energy below 150 Hz).
- Loudness: social platforms (Reels, TikTok, Shorts) -14 LUFS integrated; long-form explainers / web players -16 LUFS. True peak <= -1 dBTP (<= -1.5 for -16 masters). `finish.sh` applies -14 / -1.
- The video must work **muted** (captions carry it) and the soundtrack must make sense **audio-only** (cues land on actions, voice is intelligible).
