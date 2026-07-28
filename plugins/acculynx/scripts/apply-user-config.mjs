// SessionStart hook: bridges plugin userConfig options to the CLI's config file.
// Plugin options are only exported to hook processes (CLAUDE_PLUGIN_OPTION_*),
// not to skill Bash calls — so this hook writes ~/.config/acculynx/config.json,
// which the bundled CLI already resolves, in whatever filesystem the session
// runs in (including Cowork sandboxes). No-op when no options are set.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const apiKey = process.env.CLAUDE_PLUGIN_OPTION_ACCULYNX_API_KEY;
const signerEmail = process.env.CLAUDE_PLUGIN_OPTION_ACCULYNX_SIGNER_EMAIL;
if (!apiKey && !signerEmail) process.exit(0);

const dir = path.join(process.env.ACCULYNX_CONFIG_HOME || os.homedir(), ".config", "acculynx");
const file = path.join(dir, "config.json");

let existing = {};
try {
  existing = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  // missing or unreadable: start fresh
}

// Plugin-screen values win for the keys they define; other keys are preserved.
const merged = {
  ...existing,
  ...(apiKey && { apiKey }),
  ...(signerEmail && { signerEmail }),
};

if (JSON.stringify(merged) !== JSON.stringify(existing)) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(merged, null, 2), { mode: 0o600 });
}
process.exit(0);
