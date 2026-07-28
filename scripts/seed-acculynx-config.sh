#!/usr/bin/env bash
# Drops your local AccuLynx credentials (from ~/.config/acculynx/config.json)
# next to every local copy of the plugin's CLI bundle, so sessions that can't
# see your home config (e.g. Cowork sandboxes) still authenticate.
#
# The target file (cli/config.json) is GITIGNORED and must never be committed —
# this seeds LOCAL copies only. Re-run after every plugin update (updates
# create a fresh cache dir without the seeded file).
set -euo pipefail

SRC="$HOME/.config/acculynx/config.json"
[ -f "$SRC" ] || { echo "No $SRC — create it first ({\"apiKey\": \"...\"})"; exit 1; }

seed() {
  local dir="$1"
  [ -f "$dir/acculynx.cjs" ] || return 0
  cp "$SRC" "$dir/config.json"
  chmod 600 "$dir/config.json"
  echo "seeded: $dir/config.json"
}

# 1. This checkout (used by inline/local installs)
seed "$(cd "$(dirname "$0")/.." && pwd)/plugins/acculynx/cli"

# 2. Every cached plugin version (used by marketplace installs incl. the desktop app)
for v in "$HOME/.claude/plugins/cache/creding-plugins/acculynx"/*/cli; do
  [ -d "$v" ] && seed "$v"
done

echo "Done. Never commit cli/config.json (it is gitignored)."
