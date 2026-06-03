---
description: Save a pasted Foresights upgrade digest into .claude/upgrade-digests/.
argument-hint: "(paste the digest markdown after the command, or in the next message)"
allowed-tools: Read, Write, Bash
---

# /digest-save

The user is providing a Foresights upgrade digest as markdown — either in
`$ARGUMENTS` or pasted into the conversation. Save it into this repo.

1. Take the digest markdown. Its first heading has the form:

   ```
   # <Product> upgrade digest — YYYY-MM-DD
   ```

   Extract the **date** (`YYYY-MM-DD`) and the **product** name. If there's
   no heading in that form, don't guess — ask the user to paste the full
   digest including its `# <Product> upgrade digest — <date>` heading, and
   stop.

2. Derive a **product slug** from the product name: lowercase it, replace
   each run of non-alphanumeric characters with a single `-`, and trim
   leading/trailing `-`. (e.g. "CDK Insights" → `cdk-insights`.)

   **Reject the digest and ask the user to fix the heading** if any of
   the following appears in the extracted product name *before* slug
   normalisation:

   - A `..` path component (e.g. `# ../etc/passwd upgrade digest — 2026-06-02`).
   - A `/` or `\` (path separators of any flavour).
   - A null byte (`\0`).
   - A leading `.` (so the resulting slug can't start with `.`).

   Do **not** try to sanitise these by stripping characters — a heading
   like `# ../../foo upgrade digest — 2026-06-02` is ambiguous and
   almost certainly indicates either a copy-paste mishap or an
   injection attempt. Surface the issue and let the user retype the
   heading.

3. Target path:
   `.claude/upgrade-digests/<date>-<product-slug>-upgrade-digest.md`.
   Create `.claude/upgrade-digests/` if it doesn't exist.

4. If the target file already exists, show its current size / first line
   and ask the user to confirm overwrite before continuing.

5. Write the digest markdown **verbatim** to the target path — don't
   reformat or re-wrap it; the embedded `<details>` prompts and fenced
   code blocks must survive intact.

6. Confirm the path written, then remind the user they can now run
   `/digest` to inspect and act on it.
