---
name: generate-roof-report
description: Use when the user requests generating a Roof Inspection Report or roof report PDF to summarize findings and costs.
---

# Generate Roof Inspection Report

## Overview
This skill gathers inspection details, generates a branded Roof Inspection Report PDF via the bundled `acculynx` CLI (see the `use-acculynx` skill for how to invoke it), and — after the user reviews the actual document — uploads it to the job's document folder.

The PDF generation step is **rendering only** (no external side effects), so generate early and regenerate freely when the user wants changes. Confirm with the user in chat before running the upload command, with the real PDF reviewed.

## Dependencies
This skill leverages the following CLI commands (schemas: `acculynx describe <group> <command>`):
* `acculynx jobs get` / `acculynx jobs list --search-term` — job details, including addresses and dates.
* `acculynx jobs contacts` — the customer / client associated with the job.
* `acculynx settings company` — company contact details.
* `acculynx reports roof-report` — renders the report PDF to disk (`-o <path>`; result includes `filePath`).
* `acculynx documents folders` — resolves the document folder mapping for uploads.
* `acculynx documents add` — uploads the PDF to the job. **Mutating** — run only after the user's explicit sign-off.

## Workflow

### Step 1: Gather Job and Contact Information
* If a customer or realtor name is given, search with `acculynx jobs list --search-term "<name>"` or `acculynx contacts list --search-term "<name>"`.
* Fetch full job details with `acculynx jobs get <jobId>`: note the `id` (jobId), property address, and client details.
* Fetch `acculynx jobs contacts <jobId>` for the recipient's full name and company.

### Step 2: Collect Inspection Metrics
Ask the user (in one message) for any of these that are missing — never guess them:
* Overall roof condition (excellent / good / fair / poor / failing).
* Estimated remaining useful life (years). Omit it entirely for a roof at the end of its life.
* Number of shingle layers (default 1).
* Specific areas of damage and required repairs.
* Squares count (e.g. 20).
* Costs — either a repair/replacement pair, or an itemized `costBreakdown` (see below).

Do **not** ask about signer details or company identity — the command fills those from `ACCULYNX_SIGNER_EMAIL`/company configuration automatically.

### Step 2b: Match the Report's Depth to the Findings
The command renders **two depths from one schema** (see `acculynx describe reports roof-report`). Pick based on how much the inspector actually reported — never pad, never flatten.

**Brief letter** — a couple of areas, a simple repair/replace number. Pass `damages` as flat `{area, description}` plus `repairCost` / `replacementCost`. This is the right shape for a quick summary.

**Detailed report** — a full inspection walking several systems. Use every field the findings support:
* `primaryMaterial`, `primaryDefects` — populate the Property & Roof Summary block.
* `executiveSummary` — **write this yourself** whenever the roof is anything other than normally aging. Omitting it falls back to a generic sentence that will read wrong against serious findings.
* `damages[].items` — the itemized sub-findings under each system (e.g. Wind Damage / Dislodged Shingles / Creased Shingles under "Roof Covering System"). The area's `description` becomes that section's opening paragraph. Supplying `items` switches the section to a numbered "Detailed Inspection Findings" layout.
* `recommendation` + `actionPlan[]` — the narrative for why, then the ordered steps.
* `costBreakdown[]` — one line per scope item, each with `low`, an optional `high` for a range, and the `basis` (the unit math, e.g. "$10 to $20 per linear foot"). **The command sums the totals** — never compute or pass a total yourself.
* `disclaimer` — the caveat that figures are approximate pending a formal estimate.

Carry the inspector's own detail through into these fields. The document is only as specific as what you pass — the command does not invent prose, and anything you leave out simply does not appear. Nested fields go in `--json '{...}'`.

### Step 3: Generate Immediately, Then Ask for Review
Run `acculynx reports roof-report ... -o <path>` as soon as the data is assembled. Do not present a markdown mock-up and do not ask permission to generate. Show/open the generated PDF (the `filePath` in the result) for the user. Then **end your turn** with a short review question: summarize the key figures in one sentence (condition, remaining life, repair cost, replacement cost) and ask whether the document looks right or if they'd like any changes. Do **not** upload yet.

### Step 4: Iterate Until Approved
If the user wants changes, adjust the inputs and regenerate — it's free. Repeat until they say it looks good.

### Step 5: Upload After Confirmation
Once the user confirms the document is correct:
* Run `acculynx documents folders` and pick the **"Roof Report"** folder; if it doesn't exist, fall back to "Other".
* Run `acculynx documents add` with the `jobId`, resolved `documentFolderId`, the `filePath` returned by the generate command as `file`, and description `"Roof Inspection Report - Approved"`.
* Success → report it with the destination folder name. Error → report the AccuLynx error; if the user wants changes instead, return to Step 4.

## Common Mistakes
* **Uploading in the same turn as generating** — the user must get a chance to review the PDF and request changes first. Generate, ask "does this look right?", and stop.
* **Ending the flow after generation without a question** — never leave the user with a PDF and silence; always ask for their review and offer the upload as the next step.
* **Guessing metrics** — useful life, condition, costs, and squares must come from the user or the job record, never invented.
* **Flattening a detailed inspection into the brief shape** — when the user hands over per-system findings, sub-findings, unit-rate costs, or cost ranges, pass them through as `damages[].items` and `costBreakdown[]`. Collapsing that into one `description` per area and a single repair figure silently throws away what they gave you.
* **Computing cost totals yourself** — pass the `costBreakdown` lines; the command sums low and high.
* **Mocking up the document in markdown** — show the real PDF; a text imitation is redundant and drifts from the actual layout.
* **Asking for signer or company details** — the defaults come from configuration; never ask, never override unless the user explicitly instructs it.
* **Wrong folder** — roof reports belong in the "Roof Report" folder, not "Other" or COC folders.
