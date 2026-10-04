# js-dos 6.22.60 (vendored)

DOSBox compiled to WebAssembly, used by `play.html` to run the door games.

- Package: [js-dos](https://www.npmjs.com/package/js-dos) 6.22.60, by Alexander Guryanov (caiiiycuk)
- Source code: https://github.com/caiiiycuk/js-dos (tag/branch for 6.22)
- Licence: js-dos wrapper ISC (`package.json`); DOSBox core GPL-2.0 (`LICENSE`)
- Files copied unmodified from `https://cdn.jsdelivr.net/npm/js-dos@6.22.60/`:
  `dist/js-dos.js`, `dist/wdosbox.js`, `dist/wdosbox.wasm.js`, `package.json`, `LICENSE`

`wdosbox.js` is loaded as a normal `<script>` and the WebAssembly is compiled in
`js/play.js`, so the page's Content Security Policy does not need `unsafe-eval`.
