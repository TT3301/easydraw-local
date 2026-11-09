# EasyDraw Local

**English** · [简体中文](README.zh-CN.md)

> [!IMPORTANT]
> **Official product website: [https://easydraw.pinkhorse.xyz](https://easydraw.pinkhorse.xyz)**

A local-first desktop canvas for sketches, wireframes, and editable prototypes.
Draw by hand or connect an AI agent through MCP—your projects stay in local files.

## Features

- **Flexible canvas** — shapes, text, arrows, frames, images, and native SVG vectors.
- **Multiple canvases** — organize independent canvases inside one project.
- **Portable projects** — save documents and assets together in a single `.edw` file, with debounced autosave after the first save.
- **Local assets** — built-in icons, offline semantic icon search, image placeholders, and reusable materials.
- **Export** — save or copy images and export multiple frames.
- **Optional AI assistance** — let a compatible MCP agent inspect and edit the canvas.
- **English and Simplified Chinese UI** — switch languages in Settings.

No account, sync service, or official EasyDraw backend is included.

> **Fork addition: self-hosted public sharing.** Configure your own VPS address and access token in Settings
> to publish an end-to-end encrypted, read-only snapshot link (the key stays after `#`).
> See [apps/share-server](apps/share-server/README.md) for the server and deployment.

## v0.3.7 update

Includes local changes from [EasyDraw v0.3.7](https://github.com/lostcrab9/EasyDraw/releases/tag/v0.3.7)
(source commit `ee98f22d883d3c8aa3c20c4ba4f562c924810628`):

- AI text writes use content sizing or fixed-width wrapping and align within shapes.
- New AI arrows use elbow routing, can bind to frames, and follow changed targets.
- Opening projects clears invalid connector bindings. First canvas visits fit all content; returning preserves the view within the session.
- Fixes blocked actions after context menus or canvas renaming, and Backspace deletion with the property panel open.

Account, cloud share key, sign-in recovery, website, and backend updates are excluded.

## Quick start

Requirements: **Node.js 22.12+** (Node.js 22 or 24 recommended), **npm 10+**,
and a desktop environment capable of running Electron.

```sh
git clone <your-repository-url> easydraw-local
cd easydraw-local
npm ci
npm run dev
```

Create a project and choose where to save it, or open an existing `.edw` file.
Saved projects automatically persist changes after 900 ms of inactivity.
Use **Save As** to create a separate copy.

Dependencies and Electron are downloaded during installation. Once installed,
normal local editing does not require an EasyDraw service or an internet connection.

### Browser preview

```sh
npm run dev:web
```

Open `http://127.0.0.1:1420`. Browser preview is for canvas development;
desktop file dialogs, project persistence, and local MCP access require Electron.
Use `npm run dev` for the full application.

## AI / MCP

Open **AI** in the canvas toolbar, enable **Allow MCP access**, and copy the setup
guide into your MCP-compatible agent. No API key or agent installation is bundled.

MCP access is **off by default**. When enabled, the desktop starts an authenticated
loopback bridge; the agent connects through a local stdio MCP process. This is
local desktop integration, not a hosted service.

Only connect agents you trust: they can read and modify the active project.
An external agent may send project content to its model provider according to
that client's configuration. Local-first storage does **not** imply local AI inference.

See [MCP setup](docs/mcp.md) and the bundled
[product sketch skill](skills/easydraw-product-sketch/SKILL.md).

## Development

```sh
npm test                     # Unit and architecture tests
npm run build                # Type-check and build desktop UI + local MCP sidecar
npm run check:source         # Check public-source hygiene and local-only boundaries
npm run engine:typecheck
npm run model:typecheck
npm run mcp:smoke            # MCP protocol test with a mock local bridge
npm run mcp:bundle-smoke     # Same test against the built sidecar
npm run test:desktop         # Build and run Electron UI/file-operation smoke tests
npm run test:canvas-fit      # Build and verify initial canvas fitting and view switching
```

Desktop smoke tests need an interactive desktop session and use temporary profiles.
See [Contributing](CONTRIBUTING.md) for additional integration checks.

### Build an application

```sh
npm run desktop:dir          # Unpacked application for the current platform
npm run desktop:pack         # Platform-specific distributable
```

Output is written to `release/`. Packaging uses electron-builder; signing and
notarization credentials are not included. Build on the target OS for the simplest
setup; Windows installers use NSIS. Linux builds require a graphical desktop.
The application identity is **EasyDraw Local**, separate from other EasyDraw editions.

## Repository layout

```text
src/                         React desktop editor
electron/                    Local files, assets, exports, and MCP bridge
packages/canvas-engine/      Canvas rendering and interaction
packages/document-model/     Document schemas and geometry
packages/editor-contracts/   Editor and MCP contracts
packages/mcp-server/         Local stdio MCP sidecar
assets/                      Branding and bundled offline icon-search model
remix-icons/                 Built-in icon collection and its license
skills/                      Optional agent drawing skill
tests/                       Maintained automated tests, not test reports
scripts/                     Build and validation tools
```

Generated bundles, installers, dependencies, projects, credentials, screenshots,
and test reports are excluded from version control. This repository contains no
deployment infrastructure or private planning/research documents.

## License and acknowledgements

EasyDraw code is available under the [MIT License](LICENSE), including commercial use.

The canvas engine and document model derive from
[Excalidraw](https://github.com/excalidraw/excalidraw), with upstream MIT notices
retained. Bundled fonts, the offline model, and icon collections retain their own
licenses; they are **not** relicensed by the root MIT license.
Icons by [Remix Icon](https://remixicon.com).

See [Third-party notices](THIRD_PARTY_NOTICES.md) before redistributing bundled resources.
For trust boundaries and known dependency limitations, see [Security](SECURITY.md).
