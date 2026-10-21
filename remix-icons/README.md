# Remix Icon

This directory vendors the outlined icons from Remix Icon v4.9.1 for EasyDraw's
built-in icon library.

- Source: https://github.com/Remix-Design/RemixIcon
- Website: https://remixicon.com
- Version: 4.9.1
- Included icons: 1,690
- Native size: 24 x 24
- License: Remix Icon License v1.0 (see `LICENSE`)

Filled variants were intentionally removed. The directory keeps the upstream
category structure and `tags.json` search metadata.

EasyDraw swaps the filenames of `Device/signal-cellular-1-line.svg` and
`Device/signal-cellular-3-line.svg`: variant 1 is the preferred full-signal
graphic, and variant 3 is the weak-signal graphic. Their search tags are swapped
accordingly. Preserve this customization when refreshing the upstream pack,
then regenerate the manifest and embedding index with `npm run icons:index`.
