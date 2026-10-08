# Delivery

## Files

```
out/<name>_master.mp4        best quality (crf 16 picture, 256k audio)
out/<name>.mp4               platform upload, 2-pass, <= 15 MB for 30 s vertical
out/<name>_silent.mp4        for adding a trending sound in-app
out/cut_16x9.mp4, cut_1x1.mp4  recompositions when the brief asks (render with QUERY=format=16x9 / 1x1)
out/captions.srt             node render.mjs captions
out/contact.png              one frame every 2 s
cover.jpg                    the strongest hook frame (usually inside the first 1-2 s)
post-copy.md                 per-platform title / description / caption
README.md                    lists ONLY the checks that were actually run, with their results
DECISIONS.md                 one line per creative call
SOURCES.md                   every number and claim, with its source
src/                         the scene; re-rendering must reproduce the master
```

## Encode

`scripts/finish.sh <video-silent.mp4> <soundtrack.wav> <out> <name> [MB]` does master + 2-pass + silent + contact sheet + phone check + loudness report. H.264 high, yuv420p, 30 fps, AAC 48 kHz, `+faststart`.

Re-render only what changed: `FROM_FRAME=<n>` keeps earlier frames (e.g. a phone-number change on the end card re-renders seconds, not minutes).

## Platform notes

- Vertical 1080x1920 for Reels / TikTok / Shorts; keep it 15-60 s, the payoff before 30 s if possible.
- Post copy per platform: YouTube title <= 100 characters with the searchable phrase first, description with link (UTM-tagged), phone, credentials, hashtags; TikTok/IG caption short, hook line first, offer, 5-8 hashtags.
- Disclose AI: if voice, music or imagery is AI-generated, say so in the description and turn on the platform's AI-content label.
- Phone numbers on videos: use the client's call-tracking number for video if one exists (check prior video descriptions) instead of the main line.
- Write output files outside cloud-synced folders (iCloud Documents can time out large writes); render frames to a scratch dir.
