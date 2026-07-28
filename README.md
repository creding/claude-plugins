# creding-plugins

A personal [Claude Code](https://code.claude.com) plugin marketplace.

## Plugins

### acculynx

Full-featured [AccuLynx](https://www.acculynx.com/) (roofing CRM) connector. Bundles a
single-file, LLM-first CLI covering the complete AccuLynx v2 API — 120 commands across
jobs, leads, contacts, estimates, financials, invoices, payments, appointments, documents,
media, users, and company settings — plus three skills:

- **use-acculynx** — teaches Claude the discovery-first workflow (`guide`, `search`,
  `describe`) and the domain rules (contact-first job creation, milestone discovery,
  pagination limits).
- **draft-coc** — Certificate of Completion PDFs: generate → review → upload.
- **generate-roof-report** — branded roof inspection report PDFs, brief or detailed.

Setup: enter your API key (and optional signer email for PDF signatures) in the plugin's
configuration screen when installing — the key lands in secure storage and a SessionStart
hook makes it available to the CLI in every session, including Cowork sandboxes.
Alternatives: export `ACCULYNX_API_KEY` / `ACCULYNX_SIGNER_EMAIL`, or write
`~/.config/acculynx/config.json` as `{"apiKey": "...", "signerEmail": "..."}`.
Requires Node 22+.

The CLI is developed in [`acculynx-cli`](https://github.com/creding/acculynx-cli) and the
built bundle is synced into `plugins/acculynx/cli/` by that repo's `scripts/sync-plugin.sh`.

### nanobanana

Generate images from a text prompt using Google's Gemini image models ("Nano Banana"),
callable from **any** repository. Zero runtime dependencies — a single Node script using
built-in `fetch` (Node 18+).

## Install

In a Claude Code CLI that supports `/plugin`:

```
/plugin marketplace add creding/claude-plugins
/plugin install acculynx@creding-plugins
/plugin install nanobanana@creding-plugins
```

(Or use a local checkout as the source: `/plugin marketplace add ~/github/claude-plugins`.)

If your environment doesn't expose `/plugin`, install it as a personal skill instead —
symlink the skill into your skills folder so it loads in every session:

```
ln -sfn ~/github/claude-plugins/plugins/nanobanana/skills/generate-image \
  ~/.claude/skills/generate-image
```

Then set your Gemini API key once so it's available everywhere:

```bash
# in ~/.zshrc
export GEMINI_API_KEY="your-key-here"
```

(Alternatively, write the key to `~/.config/nanobanana/key`.) Get a key from
[Google AI Studio](https://aistudio.google.com/).

## Usage

Once installed, just ask Claude in any session:

> generate an image of a red metal roof on a craftsman house at golden hour, 16:9

Claude runs the bundled script and shows you the result. Generated files are saved to
`./nanobanana-images/` in the current repo by default.

### Rendering from a source photo (image-to-image)

Give Claude a photo of a home/yard and ask for a change — it edits the actual photo:

> here's a photo of my house (house.jpg) — render it with a large cedar deck across the front

**Providing the photo:** give a file path, drag the file into the input, or **copy** the
image (Cmd+C) and it's pulled off the clipboard (`--clipboard`). Note: *pasting* an image
directly into the chat only shows it as a picture with no underlying file — copy it or drag
the file instead.

You can include a second image that's marked up (arrows/writing showing where the deck goes);
the model reads and follows those markings. Ask for **an architect's set** to get multiple
views at once:

> render this backyard with a paver patio and pergola — give me photoreal, top-down, a line
> drawing, and an angled 3D view

Each perspective is saved as its own labeled file.

### Running the script directly

```bash
node plugins/nanobanana/skills/generate-image/scripts/generate-image.mjs \
  "a photorealistic red metal standing-seam roof at golden hour" \
  --model gemini-3.1-flash-image \
  --aspect 16:9 --size 2K --n 1 --out ./nanobanana-images
```

| Flag | Values | Default |
| --- | --- | --- |
| `--image` | path to a source image (repeatable, up to 14) | none (text-to-image) |
| `--clipboard` | use the image on the macOS clipboard as a source | off |
| `--perspective` | `photoreal`, `topdown`, `drawing`, `angled`, or `all` (comma-separated) | none |
| `--model` | `gemini-3.1-flash-image`, `gemini-3-pro-image`, `gemini-3.1-flash-lite-image`, `gemini-2.5-flash-image` | `gemini-3.1-flash-image` |
| `--aspect` | `1:1 3:2 2:3 3:4 4:3 4:5 5:4 9:16 16:9 21:9` | model default |
| `--size` | `512px 1K 2K 4K` | model default |
| `--n` | positive integer | `1` |
| `--out` | directory | `./nanobanana-images` |
| `--name` | base filename | derived from prompt |

## Models

| Model | Use |
| --- | --- |
| `gemini-3.1-flash-image` | Generalist workhorse (default) |
| `gemini-3-pro-image` | Premium — most complex visual tasks |
| `gemini-3.1-flash-lite-image` | Fastest / cheapest (1K max) |
| `gemini-2.5-flash-image` | Legacy "Nano Banana" |
