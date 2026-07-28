---
name: draft-coc
description: Use when the user requests drafting a Certificate of Completion (COC) to certify job completion and request funds release from an insurance company.
---

# Draft Certificate of Completion (COC)

## Overview
This skill retrieves property and financial details from AccuLynx, generates a branded Certificate of Completion PDF via the bundled `acculynx` CLI (see the `use-acculynx` skill for how to invoke it), and — after the user reviews the actual document — uploads it to the job's document folder.

The PDF generation step is **rendering only** (no external side effects), so generate early and regenerate freely when the user wants changes. Confirm with the user in chat before running the upload command, with the real PDF reviewed.

## Dependencies
This skill leverages the following CLI commands (schemas: `acculynx describe <group> <command>`):
* `acculynx jobs get` / `acculynx jobs list --search-term` — job details, including claim numbers and dates.
* `acculynx jobs contacts` — the customer / owner associated with the job.
* `acculynx financials for-job` — worksheet totals and financial overview.
* `acculynx settings company` — company license and contact details.
* `acculynx reports coc` — renders the COC PDF to disk (`-o <path>`; result includes `filePath`).
* `acculynx documents folders` — resolves the document folder mapping for uploads.
* `acculynx documents add` — uploads the PDF to the job. **Mutating** — run only after the user's explicit sign-off.

## Workflow

### Step 1: Gather Job and Contact Information
* If a customer name is given (e.g. "Cory Brown"), search with `acculynx jobs list --search-term "<name>"` or `acculynx contacts list --search-term "<name>"`.
* Fetch full job details with `acculynx jobs get <jobId>`: note the `id` (jobId), property address, and insurance `claimNumber`.
* Fetch `acculynx jobs contacts <jobId>` for the customer's full name.

### Step 2: Retrieve Financials & Company Settings
* Call `acculynx financials for-job <jobId>` for the original contract / RCV amount and any approved supplemental worksheet items.
* Call `acculynx settings company` to confirm the company license number.

### Step 3: Confirm the Two User-Owned Facts
Exactly two things must come from the user before generating; ask for whichever is missing (in one message):
1. **Supplements** — ask whether any supplemental claims should be included (e.g. decking, drip edge, electrical). Combine user-provided supplements with those found in AccuLynx financials.
2. **Project Completion Date** — mandatory; never guess it.

Do **not** ask about signer details or company identity — the command fills those from `ACCULYNX_SIGNER_EMAIL`/company configuration automatically.

### Step 4: Generate Immediately, Then Ask for Review
Run `acculynx reports coc ... -o <path>` as soon as the data is assembled (see `acculynx describe reports coc` for the exact fields; supplements go in `--json '{"supplements": [...]}'`). Do not present a markdown mock-up of the document and do not ask permission to generate. Show/open the generated PDF (the `filePath` in the result) for the user. Then **end your turn** with a short review question: summarize the key figures in one sentence (claim #, original RCV, supplements total, new RCV total, completion date) and ask whether the document looks right or if they'd like any changes. Do **not** upload yet.

### Step 5: Iterate Until Approved
If the user wants changes, adjust the inputs and run `acculynx reports coc` again — regeneration is free. Repeat until they say it looks good.

### Step 6: Upload After Confirmation
Once the user confirms the document is correct:
* Run `acculynx documents folders` and pick the **"Certificate of Completion"** folder; if it doesn't exist, fall back to "Job Paperwork", then "Other".
* Run `acculynx documents add` with the `jobId`, resolved `documentFolderId`, the `filePath` returned by the generate command as `file`, and description `"Certificate of Completion - Approved"`.
* Success → report it with the destination folder name. Error → report the AccuLynx error; if the user wants changes instead, return to Step 5.

## Common Mistakes
* **Uploading in the same turn as generating** — the user must get a chance to review the PDF and request changes first. Generate, ask "does this look right?", and stop.
* **Ending the flow after generation without a question** — never leave the user with a PDF and silence; always ask for their review and offer the upload as the next step.
* **Guessing the completion date** — always ask if it isn't provided.
* **Mocking up the document in markdown** — show the real PDF; a text imitation is redundant and drifts from the actual layout.
* **Asking for signer or company details** — the defaults come from configuration; never ask, never override unless the user explicitly instructs it.
* **Wrong folder** — COCs belong in the "Certificate of Completion" folder.
