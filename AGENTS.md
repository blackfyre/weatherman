# Repository Guidelines

## Project Structure & Module Organization

This repository is a static single-page weather application.

- `index.html` is the source of truth for the app. It contains the HTML, CSS, and JavaScript.
- `public/index.html` is the Cloudflare Pages publish artefact. Regenerate it from `index.html` before deployment.
- `Documentation/` contains project notes and ADR topic candidates.
- `mise.toml` defines local tasks and deployment commands.
- `start-codex-tmux.sh` starts a tmux workspace for development.

There is no separate assets directory or module tree at present. Keep changes surgical unless the project grows enough to justify splitting files.

## Build, Test, and Development Commands

Use mise for routine operations:

- `mise run check` validates that the inline JavaScript in `index.html` parses.
- `mise run sync-public` copies `index.html` to `public/index.html`.
- `mise run serve` serves the app locally on port `8000`.
- `mise run deploy` runs validation, syncs the publish file, and deploys `public/` to Cloudflare Pages.
- `mise run configure-production-branch` is a separate Cloudflare Pages configuration task. Do not include it in routine deploys.

The app has no package build step. Avoid adding one unless it directly solves a project requirement.

## Coding Style & Naming Conventions

Keep the page dependency-free and readable. Use plain HTML, CSS, and JavaScript. Prefer explicit constants for fixed value sets such as provider IDs, crop names, locale codes, work types, and map layers. Keep provider-specific parsing isolated from aggregation and UI rendering.

Use two-space indentation in HTML, CSS, and JavaScript. Use descriptive camelCase names for JavaScript variables and functions. Keep user-facing strings routed through the translation structure.

## Testing Guidelines

There is no formal test framework yet. At minimum, run `mise run check` before deployment. For UI changes, also run `mise run serve` and manually verify the page in a browser, including Hungarian and English language modes, provider source display, agricultural evaluation, and map embedding.

## Commit & Pull Request Guidelines

Use Conventional Commits for commit messages, for example `feat: add barley crop rules` or `docs: document deployment tasks`.

Pull requests should describe the user-visible change, list manual checks performed, and include screenshots for visual changes.

## Security & Configuration Tips

Cloudflare credentials are sensitive. Do not commit real API tokens. Prefer environment variables or local secret tooling for `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
