---
name: use-acculynx
description: "Work with AccuLynx (roofing CRM) — jobs, leads, contacts, estimates, invoices, payments, financial worksheets, insurance, appointments, document uploads, and PDF report generation — via the bundled acculynx CLI. Use whenever the user asks about AccuLynx data or wants to create/update anything in AccuLynx: look up or create jobs and leads, find contacts, check financials or payments, schedule appointments, upload documents or photos, or draft Certificates of Completion / roof reports."
---

# AccuLynx via the bundled CLI

All AccuLynx operations run through one bundled CLI (no MCP server, no other setup):

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli/acculynx.cjs" <group> <command> [args]
```

Define a shorthand once per session: `ALX='node ${CLAUDE_PLUGIN_ROOT}/cli/acculynx.cjs'` and invoke as `$ALX ...` — every example below uses `acculynx` to mean this.

Auth resolves from, in order: `ACCULYNX_API_KEY` env var → `~/.config/acculynx/config.json` (`{"apiKey": "..."}`) — and the plugin's own settings screen feeds that config file automatically via a SessionStart hook. If the key is missing, tell the user to enter it in the acculynx plugin's settings (or set the env var / config file) — never ask them to paste the key into chat.

## Discovery-first — do not guess flags

1. `acculynx guide` — operational primer (worth running once per session; it is authoritative on domain rules).
2. `acculynx --help` / `acculynx <group> --help` — enumerate commands, labeled `[read]` / `[mutates]`.
3. `acculynx describe <group> <command>` — exact input schema + a runnable example. Run this before any command you haven't used this session.
4. `acculynx search <keyword>` — find commands by intent.

Output is JSON (concise projections for lists — add `--full` or `--fields a,b,c` for more; `_meta` carries pagination; `_hints` suggests the next command). Errors are JSON on stderr with a `suggestion` field — follow it.

## Non-negotiable workflow rules

- **Contact-first job creation**: search contacts before creating one; if a plausible match exists, ask the user reuse-vs-new. Ask before assigning people to a job; new leads accept only `companyRepresentativeIds` (sales/AR owners need Approved milestone). After `jobs create`, check `assignmentErrors` before reporting success.
- **Mutations** (`[mutates]` label): confirm amounts, dates, recipients, and message text with the user before running; report the real result including errors.
- **Never show raw UUIDs** to the user — resolve them (`contacts get`, `users get`, `jobs get`) first.
- **Milestone names are company-specific**: discover with `acculynx settings milestones`; never guess.
- **"Latest N jobs"** requires `--sort-order Descending` (API default is Ascending). `--search-term` mode ignores every other filter.
- **pageSize max is 25.** Truncated output means narrow the query, not end of data.
- **Not supported by the API** (say so; don't improvise): changing job milestones/statuses, deleting jobs/contacts, reading message threads (posting/replying only).

## PDF documents (COC / roof report)

`acculynx reports coc ...` / `acculynx reports roof-report ...` render a real PDF locally (`-o <path>`; the JSON result includes `filePath`). Flow: gather user-owned facts (COC: supplements + mandatory Project Completion Date — never guess it), generate, show the PDF to the user for review, iterate freely (regeneration is free), and only after confirmation upload with `acculynx documents add` into the folder named in `_hints` (folder UUIDs from `acculynx documents folders`). Signing is automatic from `ACCULYNX_SIGNER_EMAIL`/company defaults — only pass signer overrides if the user explicitly asks to sign as someone else. Detailed field-by-field workflows: the `draft-coc` and `generate-roof-report` skills.
