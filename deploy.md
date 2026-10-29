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

## ScreenGrabber SDK refresh

Every export (local or release) first pulls the ScreenGrabber SDK from
`https://raw.githubusercontent.com/dom767/ScreenGrabber/master/sdk/baffled-screenshots.js`
into `js/vendor/baffled-screenshots.js` (`scripts/refresh-screengrabber-sdk.mjs`, called by
`export-static.mjs` before a release number is claimed or anything is bundled).

- The export **fails** if the download errors, times out, returns anything but HTTP 200, or
  returns an empty body or one without `createBaffledScreenshots`. There is no offline fallback:
  a stale SDK is never packaged silently.
- The file is only rewritten when upstream differs (ignoring line endings and the provenance
  header). Its header then records the ScreenGrabber commit. Commit the refreshed file.
- The checked-in copy stays the one used for source development, so the app runs from source
  without network access.

## Default hosting

| Parameter | Default |
|---|---|
| S3 bucket | `baffledcat.com` |
| S3 prefix | `bifurcation/` |
| Public URL | `https://baffledcat.com/bifurcation/index.html` |

Override with `BIFURCATION_S3_BUCKET` / `BIFURCATION_S3_PREFIX`, or `-S3Bucket` / `-S3Prefix` on the older `Export-Static.ps1`.

## Repository commands

Standard AgentController actions (see AgentController `docs/RepositoryCommands.md`):

| Action | What it does |
|---|---|
| **Build** (`actions/Build.mjs` / `Build.cmd`) | Local export only: `node export-static.mjs` (no `--release`, no upload) |
| **Deploy Local** (`actions/DeployLocal.mjs` / `DeployLocal.cmd`) | Local export, then serve `Export/Version…` on `PORT` (default 8080) |
| **Deploy Prod** (`actions/DeployProd.mjs` / `DeployProd.cmd`) | `export-static.mjs --release`, S3 upload, verify live asset version. **Humans only** |

```powershell
# Package only
.\Build.cmd
# or: node actions\Build.mjs

# Package + serve the export locally
.\DeployLocal.cmd
# or: $env:PORT=7160; node actions\DeployLocal.mjs

# Release + upload (humans / dashboard only — agents must never run this)
.\DeployProd.cmd
```

Older entry points still work: `Export-Static.ps1 -SkipUpload` ≈ Build; `Export-Static.cmd` ≈ Deploy Prod.

## Commands (legacy)

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

After export, serve the version folder locally (Deploy Local does this):

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
| `actions/Build.mjs` | Implemented |
| `actions/DeployLocal.mjs` | Implemented |
| `actions/DeployProd.mjs` | Implemented (humans only) |
| `Build.cmd` / `DeployLocal.cmd` / `DeployProd.cmd` | Thin wrappers |
| `export-static.mjs` | Implemented |
| `Export-Static.ps1` | Implemented (legacy; Deploy Prod mirrors it) |
| `Export-Static.cmd` | Implemented (legacy) |
| `Export/latest.json` | Written by packager |
| S3 upload + verify | Implemented in `actions/DeployProd.mjs` and `Export-Static.ps1` |
