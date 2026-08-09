# Changelog

Notable changes to Foresights are recorded here. Published release assets and migration notes are
also available on the [GitHub releases page](https://github.com/instancelabs/foresights/releases).

## [0.10.0] - Unreleased

### Added

- Added an OpenAI plugin manifest and repository marketplace entry so the same Foresights skills can
  be installed in ChatGPT Work and Codex without maintaining a second plugin implementation.
- Added a dependency-free `foresights` installer with `install`, `status`, `--claude`, `--codex`,
  `--all`, and `--dry-run` support for Claude Code and Codex CLI.
- Added distribution validation that keeps the npm package, Claude manifest, Codex manifest,
  marketplaces, and skill directories in sync.
- Added deterministic triage accuracy guards for unsupported green verdicts, alpha or proposal-stage
  work, and changes reported as reverted or withdrawn.

### Changed

- Generalised dashboard handoffs from Claude Code-only language to coding-agent prompts that work in
  ChatGPT Work, Codex, and Claude Code.
- Made generated briefs and upgrade digests evidence-aware: source fields are distinguished from model
  inference, uncertain claims become verification work, and speculative implementation advice is
  suppressed.
- Improved digest titles and output guidance, including preservation of explicit breaking-change
  labels and host-neutral suggested filenames.
- Updated installation, packaging, supported-host, and app-directory documentation.

### Packaging

- The `.plugin` release artifact now contains both `.claude-plugin` and `.codex-plugin` manifests.
- The root npm package exposes the unified installer and supports direct installation from GitHub.

## Earlier releases

See [GitHub Releases](https://github.com/instancelabs/foresights/releases) for versions 0.9.9 and
earlier.

[0.10.0]: https://github.com/instancelabs/foresights/compare/v0.9.9...HEAD
