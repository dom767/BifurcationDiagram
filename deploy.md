# Deploy — logistic bifurcation diagram

Project-specific notes for [deploy_guide.md](deploy_guide.md).

## App shape

| Item | Value |
|---|---|
| Entry HTML | `index.html` |
| JS entry | `js/main.js` → `app.bundle.min.js` |
| CSS | `css/app.css` → `app.bundle.min.css` |
| Runtime fetch | `js/render/shaders/logistic.wgsl` (copied into export) |
| Asset-version global | `__BIFURCATION_DIAGRAM_ASSET_VERSION__` |
| External CDN | Google Fonts (kept as `<link>` in production HTML) |

No runtime JSON catalog. No separate data refresh step before export.

## Default hosting

| Parameter | Default |
|---|---|
| S3 bucket | `baffledcat.com` |
| S3 prefix | `bifurcation/` |
| Public URL | `https://baffledcat.com/bifurcation/index.html` |

Override with `-S3Bucket` / `-S3Prefix` on `Export-Static.ps1`.

## Commands

```powershell
# Export + upload
.\Export-Static.cmd

# Export only
.\Export-Static.ps1 -SkipUpload

# Packager only
npm install
npm run export
```

## Smoke-test checklist

After export, serve the version folder locally:

```powershell
npx --yes serve Export/VersionN -p 8080
```

Open `http://localhost:8080` and confirm:

- [ ] Diagram accumulates and reaches ready state
- [ ] Pan, scroll zoom, and double-click reset work
- [ ] Settings sliders and colour palette apply
- [ ] Minimap shows overview + viewport box
- [ ] Desktop hover shows `r=` readout under minimap
- [ ] Resolution label updates on resize
- [ ] WebGPU initialises (requires localhost or HTTPS)

After upload (if used):

- [ ] Remote `index.html` contains `self.__BIFURCATION_DIAGRAM_ASSET_VERSION__ = "N"`
- [ ] Version matches `Export/latest.json`
- [ ] Hosted URL is HTTPS

## Implementation status

| Script | Status |
|---|---|
| `export-static.mjs` | Implemented |
| `Export-Static.ps1` | Implemented |
| `Export-Static.cmd` | Implemented |
| `Export/latest.json` | Written by packager |
| S3 upload + verify | Implemented in `Export-Static.ps1` |
