# Foresights distribution

Foresights has one plugin source at `foresights/skills/` and four installation surfaces. Do not fork
the skills by host; the `.claude-plugin` and `.codex-plugin` manifests adapt the same package.

## User installation

| Surface | Recommended install |
| --- | --- |
| Claude app / Cowork | Download `foresights-<version>.plugin` from GitHub Releases, then open Plugins and upload the custom plugin file. |
| Claude Code | `npx github:instancelabs/foresights install --claude` |
| ChatGPT Work / Codex app | `npx github:instancelabs/foresights install --codex`, restart the desktop app, then use Foresights in a new Work/Codex chat. |
| Codex CLI | `npx github:instancelabs/foresights install --codex`, then start a new session. |
| Both CLIs | `npx github:instancelabs/foresights install --all` |

The direct host commands remain supported:

```bash
# Claude Code
claude plugin marketplace add instancelabs/foresights
claude plugin install foresights@instancelabs --scope user

# Codex
codex plugin marketplace add instancelabs/foresights
codex plugin add foresights@instancelabs
```

The installer is idempotent: an existing Claude installation is updated, while an existing Codex
installation has its marketplace snapshot refreshed. Run
`npx github:instancelabs/foresights status --all` to inspect both.

OpenAI's current plugin surface is ChatGPT Work and Codex (desktop and CLI), not standard ChatGPT
chats, mobile, or the IDE extension. Keep that boundary explicit in release and website copy.

## App-directory publishing

The GitHub marketplace is the immediate distribution path. Public app-store discovery requires two
separate submissions:

1. Submit the `.plugin` package to Anthropic's plugin directory. Until accepted, users can upload the
   GitHub Release asset directly.
2. Submit the repository plugin and listing through the OpenAI plugin submission portal. OpenAI
   publishes an accepted plugin once to the universal directory shared by ChatGPT and Codex.

Before submission, prepare stable public URLs for the product website, support, privacy policy, and
terms. The source package already contains the listing copy, starter prompts, icon assets, and skills.

## Maintainer checks

```bash
npm run preflight
npm run build:plugin
npm pack --dry-run
claude plugin validate .
```

`npm run validate:distribution` prevents version drift between the npm installer and both plugin
manifests, verifies both marketplaces, and checks every bundled skill has a `SKILL.md`.

## Platform references

- [OpenAI: build plugins](https://learn.chatgpt.com/docs/build-plugins)
- [OpenAI: plugin availability and installation](https://learn.chatgpt.com/docs/plugins)
- [OpenAI: package plugins](https://developers.openai.com/plugins/build/plugins)
- [OpenAI: submit plugins](https://developers.openai.com/plugins/deploy/submission)
- [Anthropic: use plugins in Claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)
- [Anthropic: discover and install Claude Code plugins](https://code.claude.com/docs/en/discover-plugins)
