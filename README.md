# EasyDraw Local

**English** · [简体中文](README.zh-CN.md)

A local-first desktop canvas for sketches, wireframes, and editable prototypes.
Draw by hand or connect an AI agent through MCP. Projects stay in local files and can be
shared as **end-to-end encrypted, read-only links**: no server needed on a LAN, self-hosted for the internet.

Current version: **1.1.0**

## Download

Get `EasyDraw-Local-<version>-mac-arm64.dmg` (macOS Apple Silicon) from
[Releases](https://github.com/TT3301/easydraw-local/releases) and verify it with `SHA256SUMS.txt`.

The app is ad-hoc signed and not notarized. If macOS says it is damaged or from an
unidentified developer on first launch, run:

```sh
xattr -dr com.apple.quarantine "/Applications/EasyDraw Local.app"
```

## Features

- **Flexible canvas**: shapes, text, arrows, frames, images, and native SVG vectors.
- **Multiple canvases**: organize independent canvases inside one project.
- **Portable projects**: documents and assets in a single `.edw` file, autosaved after the first save.
- **Local assets**: built-in icons, offline semantic icon search, image placeholders, and reusable materials.
- **Export**: save or copy images and export multiple frames.
- **Encrypted sharing**: publish a whole project as a read-only browser link; update, pause, expire, or delete it.
- **Optional AI assistance**: let a compatible MCP agent inspect and edit the canvas.
- **English and Simplified Chinese UI**: switch languages in Settings.

No account or sync service is included.

## Sharing

Click **Share** at the top right of the canvas and turn on **Link sharing** to publish a snapshot
of the current project (all canvases and assets).

| Action | Effect |
|---|---|
| Copy | Copies the full link; it opens a read-only viewer with canvas switching |
| Update content | Replaces the snapshot with the latest content; the link stays the same |
| Switch off | Pauses: the snapshot is kept and the link returns 404 until switched on again |
| Delete | Removes the snapshot from the server; the link stops working for good |
| Expiry | Never, 7 days, or 30 days; expired snapshots are deleted automatically |

Choose the share server in **Settings → Share server**:

- **This computer (LAN)**, the default: turn on **Run LAN share service**. The local address and
  access token are generated and prefilled, and phones or computers on the same network can open links.
  No VPS needed. The service is off by default and stops when the app quits; links are unavailable
  while this computer is off or asleep. macOS may ask to allow incoming connections the first time.
- **Custom server**: enter your own server address (`https://`) and access token to share on the internet.
  The server is a single dependency-free Node file with amd64 / arm64 Docker images; see
  [apps/share-server](apps/share-server/README.md) for deployment.

**Security model**: project content and assets are encrypted on this device with AES-256-GCM.
The key lives only after `#` in the link, which browsers never send to the server; the server stores
ciphertext plus metadata such as size and time. Anyone with the full link can view it, so share carefully.
The access token and share keys are encrypted in the system keychain and never written into `.edw` files.
LAN links use `http://`; browsers provide no WebCrypto on non-HTTPS pages, so the viewer falls back to a
pure-JS AES-GCM implementation. An attacker on the same network could in principle tamper with that page,
so use an HTTPS server for internet sharing.

## AI / MCP

Open **AI** in the canvas toolbar, enable **Allow MCP access**, and copy the setup
guide into your MCP-compatible agent. No API key or agent installation is bundled.

MCP access is **off by default**. When enabled, the desktop starts an authenticated
loopback bridge; the agent connects through a local stdio MCP process. MCP cannot publish or change shares.

Only connect agents you trust: they can read and modify the active project.
An external agent may send project content to its model provider according to
that client's configuration. Local-first storage does **not** imply local AI inference.

See [MCP setup](docs/mcp.md) and the bundled
[product sketch skill](skills/easydraw-product-sketch/SKILL.md).

## Run from source

Requirements: **Node.js 22.12+** (22 or 24 recommended), **npm 10+**, and a desktop environment that can run Electron.

```sh
git clone https://github.com/TT3301/easydraw-local.git
cd easydraw-local
npm ci
npm run dev
```

npm 11 skips dependency install scripts by default. If startup reports that Electron is not installed,
run `node node_modules/electron/install.js` (add `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
if downloads fail; the archive is still verified against the package checksums).

`npm run dev:web` serves a browser preview at `http://127.0.0.1:1420` for canvas development only;
file dialogs, saving, MCP, and sharing require Electron.

## Development

```sh
npm test                     # Unit and architecture tests (incl. share server, codec, LAN service)
npm run check                # Source hygiene + tests + desktop build (same as CI)
npm run build:viewer         # Build the read-only share viewer (dist-viewer/)
npm run engine:typecheck
npm run model:typecheck
npm run mcp:smoke            # MCP protocol test with a mock local bridge
npm run test:desktop         # Build and run Electron UI/file-operation smoke tests
```

### Packaging and releases

```sh
npm run desktop:dir          # Unpacked application for the current platform
npm run desktop:pack         # Platform-specific distributable in release/
```

GitHub Actions:

| Workflow | Trigger | Output |
|---|---|---|
| `ci.yml` | Every push | Checks, tests, build |
| `build-macos.yml` | `tt/main`, `feat/**`, `v*` tags | Apple Silicon DMG; `v*` tags create a Release |
| `share-server-image.yml` | `tt/main` (share-related changes), `v*` tags | Multi-arch `ghcr.io/tt3301/easydraw-share` image |

To release: bump the version in `package.json`, push to `tt/main`, then push a `v<version>` tag.

## Changelog

- **1.1.0**: LAN sharing. The desktop app bundles the share server with the address and token prefilled;
  the viewer decrypts with pure JS outside HTTPS; multi-arch GHCR image for the share server.
- **1.0.0**: End-to-end encrypted sharing with a self-hosted server, read-only web viewer, macOS Apple Silicon build.

## Repository layout

```text
src/                         React desktop editor
src/features/share/          Share dialog, server settings, snapshot decoding
src/share-viewer/            Read-only browser viewer (viewer.html)
electron/                    Local files, assets, exports, MCP bridge, sharing
apps/share-server/           Share server (server.mjs, Dockerfile, compose, deploy script)
packages/canvas-engine/      Canvas rendering and interaction
packages/document-model/     Document schemas and geometry
packages/editor-contracts/   Editor and MCP contracts
packages/mcp-server/         Local stdio MCP sidecar
assets/                      Branding and bundled offline icon-search model
remix-icons/                 Built-in icon collection and its license
skills/                      Optional agent drawing skill
tests/                       Automated tests
scripts/                     Build and validation tools
```

## Branches

| Branch | Purpose |
|---|---|
| `tt/main` | Main line (default branch); releases are tagged here |
| `main` | Upstream mirror, used only to pull upstream changes |
| `feat/*` | Feature work, merged into `tt/main` |

## License and acknowledgements

Code is available under the [MIT License](LICENSE), including commercial use.
Forked from [lostcrab9/easydraw-local](https://github.com/lostcrab9/easydraw-local).

The canvas engine and document model derive from
[Excalidraw](https://github.com/excalidraw/excalidraw), with upstream MIT notices
retained. Bundled fonts, the offline model, and icon collections retain their own
licenses; they are **not** relicensed by the root MIT license. Icons by
[Remix Icon](https://remixicon.com); LAN decryption uses
[@noble/ciphers](https://github.com/paulmillr/noble-ciphers) (MIT).

See [Third-party notices](THIRD_PARTY_NOTICES.md) before redistributing bundled resources.
For trust boundaries and known dependency limitations, see [Security](SECURITY.md).
