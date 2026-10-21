# EasyDraw document model

JSON element definitions, geometry, and project schemas used by EasyDraw Local.
This package is usable without React, the DOM, Electron, or a storage provider.
Its TypeScript configuration deliberately excludes browser libraries.

The initial geometry and element definitions derive from the upstream source
identified in `../canvas-engine/upstream-source.json`; the MIT notice is retained
in `LICENSE`.

`StoredProjectDocumentSchema` validates schema version 4: a flat ordered canvas
list, independent canvas scenes, and shared assets. `NativeProjectDocumentSchema`
also migrates v3 projects and flattens earlier v4 folder projects without losing
canvas scenes or IDs.

The editor projection exposes `activeCanvasId`, `scene`, and
`focusedPageElementId`. `serializeProjectDocument` commits the selected scene and
strips projection-only fields before persistence.

MCP commands identify the project and canvas explicitly. A canvas can contain
free elements without frames.

Run `npm run model:typecheck` from the repository root.
