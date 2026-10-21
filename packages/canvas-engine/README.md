# EasyDraw canvas engine

Editable rendering, geometry, input handling, and canvas UI for EasyDraw Local.
The host application's Vite build bundles this source directly.

Element definitions live in `@easydraw/document-model`. Native vector paths are
rendered and hit-tested directly. Frame backgrounds are a render pass, not
synthetic elements stored in the document.

The desktop passes `documentHistory` to delegate undo/redo to its SceneController.
Standalone use falls back to internal gesture history. Programmatic scene inputs
are cloned so pointer gestures cannot mutate committed host snapshots.

## Validation

From the repository root:

```sh
npm run engine:typecheck
npm run engine:pilot:smoke
npm run build
npm run engine:integration:smoke
```

The pilot checks editing, history, save/reload, image export, and read-only input.
Desktop checks use isolated temporary profiles.

## Attribution

The initial fork is based on Excalidraw v0.18.1. `upstream-source.json` records its
source archive digest and original file digests. The source has since been adapted
for EasyDraw, including removal of online publication and collaboration entry
points. The original MIT license and embedded font notices are retained.

The build rejects imports from the original installed canvas runtime and emits
source/font notices for redistribution. See [third-party notices](../../THIRD_PARTY_NOTICES.md).
