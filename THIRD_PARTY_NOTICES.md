# Third-party notices

The root MIT license covers EasyDraw's original code. It does not replace the
licenses of third-party code, fonts, models, or artwork.

## Canvas engine and document model

- Source: [Excalidraw](https://github.com/excalidraw/excalidraw), initial import v0.18.1.
- License: MIT, retained in [canvas-engine/LICENSE](packages/canvas-engine/LICENSE)
  and [document-model/LICENSE](packages/document-model/LICENSE).
- Source provenance: [upstream-source.json](packages/canvas-engine/upstream-source.json).
  This records the initial import, not a claim that all current files are unchanged.
- The local fork includes EasyDraw changes and omits online publication features.

Font attribution and licensing are retained in the font source modules under
`packages/canvas-engine/src/editor/fonts/`. Bundled Excalifont and Xiaolai font
software is under SIL OFL 1.1; Comic Shanns font notices use MIT.
Other font entries may use system-installed fonts rather than distribute binaries.
The build collects the retained source/font notices into
`dist/licenses/canvas-engine-notices.txt`, included in the desktop application.

## Remix Icon

Icons by Remix Icon (https://remixicon.com).

- Source: [Remix-Design/RemixIcon](https://github.com/Remix-Design/RemixIcon).
- License: **Remix Icon License v1.0**, retained in [remix-icons/LICENSE](remix-icons/LICENSE).
- The icon files remain under that license, not MIT. Review its attribution,
  redistribution, and standalone-library restrictions before reusing the collection.

## Tabler Icons

The small `icon-library/` collection contains Tabler icons used by local icon
utilities and test fixtures.

- Source: [tabler/tabler-icons](https://github.com/tabler/tabler-icons).
- License: MIT, retained in [icon-library/LICENSE](icon-library/LICENSE).

## Offline icon-search model

- Model: [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2),
  based on [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2).
- License: Apache-2.0, retained in [assets/icon-embedding/LICENSE](assets/icon-embedding/LICENSE).
- The pinned revision, packaging details, and EasyDraw-generated icon vectors
  are described in [assets/icon-embedding/README.md](assets/icon-embedding/README.md).

## npm dependencies

Additional dependencies keep their own license and copyright notices. Exact
versions are recorded in `package-lock.json`; see the licenses distributed with
each installed package. Preserve applicable notices when redistributing a binary.
