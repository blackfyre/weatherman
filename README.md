# Weatherman

Weatherman is a static single-page weather application for Hungary-focused forecasts. It compares Europe/Hungary-relevant public weather sources, presents median forecast values, and includes practical advisory views for agriculture and family use.

## Project Structure

- `src/` contains the source HTML, CSS, JavaScript, PWA manifest, service worker, and icons.
- `public/` contains the Cloudflare Pages publish artefacts generated from `src/`.
- `scripts/` contains maintenance scripts, including the public sync task.
- `tests/` contains dependency-free smoke checks.
- `Documentation/` contains project notes.

## Local Development

Use mise for routine tasks:

```sh
mise run check
mise run smoke
mise run sync-public
mise run serve
```

`mise run serve` syncs `src/` into `public/` and serves the static site at `http://localhost:8000`.

## Deployment

Deployments publish the generated `public/` directory to Cloudflare Pages:

```sh
mise run deploy
```

Cloudflare credentials must be provided outside the repository. Do not commit real API tokens or account IDs.

## Licence

This project is licensed under the MIT Licence. See [LICENSE](LICENSE).
