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

Every **Build** first pulls the ScreenGrabber SDK from
`https://raw.githubusercontent.com/dom767/ScreenGrabber/master/sdk/baffled-screenshots.js`
into `js/vendor/baffled-screenshots.js` (`scripts/refresh-screengrabber-sdk.mjs`, called by
`export-static.mjs` before anything is bundled). Deploy Local and Deploy Prod do not refresh it:
they ship the package Build already made.

- The build **fails** if the download errors, times out, returns anything but HTTP 200, or
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

Override with `BIFURCATION_S3_BUCKET` / `BIFURCATION_S3_PREFIX`.

## Repository commands

Build once, deploy that build. Helpers live in `actions/lib/build.mjs`.

| Action | What it does |
|---|---|
| **Run Dev** (`actions/RunDev.mjs` / `RunDev.cmd`) | Opens `StartServer.cmd` in its own window. Serves the working tree. No build. |
| **Build** (`actions/Build.mjs` / `Build.cmd`) | The only packager. Writes `Export/Build<k>` with `?v=__VERSION__` and `self.__BIFURCATION_DIAGRAM_ASSET_VERSION__ = "__VERSION__"`, and records it in `Export/latest.json`. No `VERSION` claim, no upload. |
| **Deploy Local** (`actions/DeployLocal.mjs` / `DeployLocal.cmd`) | Takes the latest build, stamps `b<k>-local` into `Export/Build<k>-local`, and serves that copy on `PORT` (default 8080) in its own window. Never rebuilds. |
| **Deploy Prod** (`actions/DeployProd.mjs` / `DeployProd.cmd`) | Takes the latest build, claims `VERSION`, stamps it into `Export/VersionN`, uploads `bifurcation/` and checks the live asset version. Never rebuilds. **Humans only.** |

Both deploys fail with "run Build first" when there is no build, and start their log with which build and commit they are deploying.

```powershell
.\RunDev.cmd
.\Build.cmd
.\DeployLocal.cmd
# $env:PORT=7140; node actions\DeployLocal.mjs
# .\DeployProd.cmd   # humans / dashboard only
```

`npm run export` is Build. `Export-Static.ps1` and `Export-Static.cmd` are removed.

## Smoke-test checklist

Deploy Local serves the stamped copy. Open `http://127.0.0.1:8080` (or `PORT`) and confirm the page contains `b<k>-local` and not `__VERSION__`. Then:

- [ ] Diagram accumulates and reaches ready state
- [ ] Pan, scroll zoom, and double-click reset work
- [ ] Settings sliders and colour palette apply
- [ ] Minimap shows overview + viewport box
- [ ] Desktop hover shows `r=` readout under minimap
- [ ] Resolution label updates on resize
- [ ] WebGPU initialises (requires localhost or HTTPS)

After upload (if used):

- [ ] Remote `index.html` contains `self.__BIFURCATION_DIAGRAM_ASSET_VERSION__ = "N"`
- [ ] `N` is the number Deploy Prod claimed (`Export/VersionN`), not the build folder
- [ ] Hosted URL is HTTPS

## Implementation status

| Script | Status |
|---|---|
| `actions/RunDev.mjs` | Implemented (opens `StartServer.cmd`) |
| `actions/Build.mjs` | Implemented (`Export/Build<k>`, placeholder version) |
| `actions/DeployLocal.mjs` | Implemented (stamp + serve, no rebuild) |
| `actions/DeployProd.mjs` | Implemented (claim, stamp, upload, verify; humans only) |
| `actions/lib/build.mjs` | Shared helpers |
| `RunDev.cmd` / `Build.cmd` / `DeployLocal.cmd` / `DeployProd.cmd` | Thin wrappers |
| `export-static.mjs` | Packager used by Build (`packageInto`); not a release entry point |
| `StartServer.cmd` | Dev server (`%PORT%` or 8080) |
| `Export/latest.json` | Written by Build |
| S3 upload + verify | `actions/DeployProd.mjs` only |
