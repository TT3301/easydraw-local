# Contributing

Thanks for improving EasyDraw Local. This repository is the standalone local
desktop application; keep changes independent of any hosted backend.

## Setup

Use Node.js 22.12+ and npm 10+. Install from the root with `npm ci` and start
Electron plus Vite with `npm run dev`. Use the root lockfile and npm workspaces;
do not add per-package lockfiles.

## Checks

Before submitting a change:

```sh
npm run check
npm run engine:typecheck
npm run model:typecheck
npm run mcp:smoke
npm run mcp:bundle-smoke
```

For desktop behavior, also run `npm run test:desktop` from an interactive desktop
session. More targeted checks, after `npm run build`, include:

- `npm run mcp:integration:smoke`: desktop/stdio client integration.
- `npm run engine:integration:smoke`: document editing through the local bridge.
- `npm run engine:pilot:smoke`: isolated canvas engine behavior.
- `npm run canvas:performance:smoke`: canvas performance probe.
- `npm run engine:reveal:smoke`: progressive AI element reveal.
- `npx tsx scripts/project-open-smoke.ts`: operating-system project opening.

Smoke checks may exercise native input or the system clipboard; run them outside
important work sessions. Reports and screenshots are local artifacts, not source.

## Boundaries

- `src/` owns the editor; `electron/` owns local operating-system integration.
- `packages/document-model` and `packages/editor-contracts` must remain independent
  of React, Electron, the DOM, and server frameworks.
- MCP is an opt-in, authenticated local interface. Keep it bound to loopback and
  preserve revocation behavior. Do not log its discovery token.
- Do not add cloud sharing, account APIs, hosted viewers, deployment files, telemetry,
  or application-owned upload endpoints to this local edition.
- Keep maintained tests and useful public documentation. Do not include private
  notes, research dumps, personal paths, project files, credentials, generated
  bundles, installer output, or QA screenshots.
- Update both README languages when user-facing commands or behavior change.
- Retain third-party license notices. Changes to icon names or tags require
  `npm run icons:index` to regenerate the bundled offline index.

## Pull requests

Describe the user-visible change and the checks you ran. Add a focused regression
test for bug fixes. Keep unrelated refactors out of the same change.

Contributions are provided under this project's MIT license, except files already
covered by a separately identified third-party license.
