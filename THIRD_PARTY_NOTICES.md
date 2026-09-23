# Third-Party Notices

R2FileBox is an independent Cloudflare Workers implementation inspired by the FileCodeBox project family. It is not an official release of either upstream project and does not publish either upstream repository as a vendored dependency or submodule.

## vastsa/FileCodeBox

- Repository: https://github.com/vastsa/FileCodeBox
- Role: Original FileCodeBox project and product concept reference.
- License: LGPL-3.0.

## zy84338719/FileCodeBox

- Repository: https://github.com/zy84338719/FileCodeBox
- Role: Go implementation reference for migration goals, admin-console structure, and chunk-upload behavior.
- License: MIT.

If current or future work includes substantial code adapted from either upstream project, keep the upstream copyright notice and license text with the copied material.

## Bundled webfonts

The app CSP keeps `style-src` and `font-src` at `'self'`, so these faces are served from `frontend/public/fonts/` rather than a font CDN. All three are redistributed unmodified under the SIL Open Font License 1.1, which permits bundling with the application.

| Font | Files | Upstream | License |
| --- | --- | --- | --- |
| Cormorant Garamond | `cormorant-garamond-v21-*.woff2` | https://github.com/CatharsisFonts/Cormorant | OFL-1.1 |
| Plus Jakarta Sans | `plus-jakarta-sans-v12-*.woff2` | https://github.com/tokotype/PlusJakartaSans | OFL-1.1 |
| JetBrains Mono | `jetbrains-mono-v24-*.woff2` | https://github.com/JetBrains/JetBrainsMono | OFL-1.1 |

Each file is the Latin / Latin-Extended variable subset published by Google Fonts; the version in the filename is the upstream release it was taken from. CJK text falls back to the system stacks declared in `frontend/src/styles/_tokens.scss`.
