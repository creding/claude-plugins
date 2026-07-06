---
name: generate-image
description: Generate an image from text, OR edit/render from source photo(s), using Google's Gemini image models ("Nano Banana"). Use whenever the user wants to create, generate, make, or produce an image, picture, photo, illustration, graphic, rendering, or visual — including editing a provided photo (e.g. "add a deck to this house", "render a patio here", "show this with a new roof"), producing architectural renderings/perspectives, or any mention of nano banana / nanobanana.
---

# Generate & edit images with Nano Banana

Generate images from text, or edit/render from one or more source photos, by running the
bundled zero-dependency Node script, then show the result(s) to the user.

## How to run it

Run the script with the user's prompt as the first argument:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate-image.mjs" "<prompt>" [flags]
```

`${CLAUDE_PLUGIN_ROOT}` is set to this plugin's install directory when the skill runs.
If for some reason it is empty, use the absolute path to this skill's
`scripts/generate-image.mjs` instead.

The script prints progress to stderr and, on success, prints the absolute path of each
generated file to stdout (one per line, as the final output). After it finishes, **Read
each printed path and display the image to the user.**

## Editing / rendering from source images (image-to-image)

Pass one or more source photos with `--image <path>` (repeatable, up to 14). The model
edits/renders based on them — e.g. adding a deck or patio to a photo of a house. **Any
writing, arrows, or markings in the source image are read and followed by the model**, so a
photo annotated with "deck goes here" works as-is.

```bash
node ".../generate-image.mjs" "Add a large cedar deck with railings and steps where marked. \
Keep the house and landscaping unchanged; match lighting and perspective." \
  --image /path/to/house.jpg --image /path/to/markup.jpg \
  --model gemini-3-pro-image --size 2K
```

**Getting the user's photo to a file path:** the script needs the image as a file on disk.
- If the user gives a file path (or drags a file into the input, which inserts its path),
  pass it straight to `--image`.
- If the user **pastes** an image, first check whether the client saved it to a path you can
  read (look for a mentioned path, or a newly-created image under the system temp dir). If you
  can find/read it, copy it to a stable temp file and use that path. If you genuinely cannot
  obtain the bytes on disk, tell the user to drag the image file into the input instead — do
  not fabricate or approximate the image.

For rendering work, prefer `--model gemini-3-pro-image` and `--size 2K` for quality.

## Architect-style perspectives

`--perspective <list>` renders the SAME scene multiple ways in one run. Presets:
`photoreal` (realistic after-photo), `topdown` (aerial plan view), `drawing` (architect's
line-drawing/elevation), `angled` (three-quarter eye-level view). Use `all` for the full set.

```bash
node ".../generate-image.mjs" "render this backyard with a paver patio and pergola" \
  --image /path/to/backyard.jpg --perspective photoreal,topdown,drawing,angled \
  --model gemini-3-pro-image
```

When the user asks for "different perspectives", "an architect's drawing", "top-down", or "a
few views", use this. Each perspective is saved as its own file (labeled in the filename).

## Flags (translate the user's request into these)

- `--image <path>` — source image to edit/reference (repeatable, up to 14). Presence of any
  `--image` switches to image-to-image rendering.
- `--perspective <list>` — `photoreal,topdown,drawing,angled` (or `all`). Renders the same
  scene multiple ways in one run.
- `--model <id>` — `gemini-3.1-flash-image` (default, generalist), `gemini-3-pro-image`
  (premium/complex), `gemini-3.1-flash-lite-image` (fast/cheap, 1K max), or
  `gemini-2.5-flash-image` (legacy). Use pro when the user wants the highest quality or a
  complex scene; use lite for quick drafts.
- `--aspect <ratio>` — one of `1:1 3:2 2:3 3:4 4:3 4:5 5:4 9:16 16:9 21:9`. Pick from the
  user's intent (e.g. a website hero → `16:9`, a phone wallpaper → `9:16`, a logo/avatar →
  `1:1`).
- `--size <res>` — `512px`, `1K`, `2K`, or `4K`. Default to `2K` for hero/marketing images.
- `--n <count>` — number of variations. Use when the user asks for options/variations.
- `--out <dir>` — output directory. Defaults to `./nanobanana-images` in the current repo.
- `--name <base>` — base filename. Derive something descriptive from the prompt if the user
  doesn't specify.

Only pass flags that are relevant; everything has a sensible default. When in doubt about
aspect ratio or model, just run with the prompt alone rather than guessing wrongly.

## Prompting tips

Gemini image models respond well to descriptive, photographic prompts. Prefer concrete
detail: subject, setting, lighting, camera angle, and style (e.g. "photorealistic",
"studio product shot", "flat vector illustration"). Expand terse user requests into a
richer prompt, but keep the user's intent intact.

## API key

The script needs a Google Gemini API key, resolved in this order:
`GEMINI_API_KEY` → `GOOGLE_GENERATIVE_AI_API_KEY` → `~/.config/nanobanana/key`.

If the script fails with a "no API key found" error, tell the user to either add
`export GEMINI_API_KEY="<their-key>"` to their shell profile (`~/.zshrc`) and restart the
shell, or write the key to `~/.config/nanobanana/key`. Keys are available from Google AI
Studio (aistudio.google.com). Do not print or echo the key value.

## After generating

- Read and display each generated image inline.
- Report where the file(s) were saved.
- Note that images land in `./nanobanana-images/` by default — remind the user to add that
  to `.gitignore` if they don't want generated images committed.
