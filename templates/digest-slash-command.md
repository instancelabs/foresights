<!--
  Foresights /digest slash command — stub.
  Written to the target repo's .claude/commands/digest.md by /setup-claude-code.

  Spec from the brief — /digest [argument]:
    empty / "green"            list 🟢 items from latest digest (excluding done.json)
    "yellow" / "all"           include 🟡 (and 🟢)
    YYYY-MM-DD                 inspect specific date's digest
    "do <number-or-stableId>"  extract embedded prompt and follow it
    "done <id> [PR-URL]"       append to done.json
    "fresh"                    print reminder to regenerate from the dashboard
    "recommend"                apply Claude Code's own ranking (git log + repo state)
                               to override Haiku's triage with action-grounded recs
-->

---
description: Inspect and act on the latest Foresights upgrade digest.
---

# /digest

> Stub — fill in from the project brief.
