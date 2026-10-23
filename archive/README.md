# Archive (not served)

Files that were published with the site but used by no page (W005, W5-19; earlier
W-018 and W-022). `_redirects` sends `/archive/*` and the old `/touchscreen-ui` URL to
`/retired`, so none of this is served. Nothing was deleted; to bring a file back,
`git mv` it to its original path and reference it from a page.

| Archived file | Original path | Size | Why |
| --- | --- | --- | --- |
| `touchscreen-ui.html` | `/touchscreen-ui.html` | 9 KB page, 1.3 MB with its image | Orphan prototype page: not linked, missing QR image and library, indexable |
| `944eb351-61ec-449c-8372-27253ff1a3ef.png` | `/` | 1.3 MB | Only used by `touchscreen-ui.html` |
| `3d-images/` | `/3d-images/` | 22.6 MB | Two `.3mf` print files (21.9 MB and 0.6 MB), a 2-byte `enhance.jpeg` and two images used only by `touchscreen-ui.html` |
| `media/ambient_static_glitch.mp3` | `/media/` | 24.9 MB | Not referenced |
| `media/showduino-product-hero.webp` | `/media/` | 7 KB | Not referenced |
| `images/` | `/images/` | 6.7 MB | Not referenced; includes an unnamed "ChatGPT Image" PNG and a duplicate of `media/showduino-hardware-product.jpg` |
| `neopixel_fx_advert.png` | `/` | 2.3 MB | Duplicate of `images/neopixel_fx_advert.png`; not referenced |
| `icons/` | `/icons/` | 4.1 MB | Ten SVG icons used by no page (one is 1.8 MB) |
| `glitch-sfx.mp3`, `me.jpg` | `/` | 56 KB, 123 KB | Not referenced |

`tests/w005-site-polish.test.cjs` fails if a served page or script references anything
in this folder.
