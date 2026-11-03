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

Each deploy refreshes the ScreenGrabber SDK from
`https://raw.githubusercontent.com/dom767/ScreenGrabber/master/sdk/baffled-screenshots.js`
through `scripts/refresh-screengrabber-sdk.mjs` before bundling. Download failures
abort packaging. If the SDK changes, packaging stops: commit the refreshed file
and rerun the deploy so the manifest names the actual source. Source development
uses the checked-in SDK without requiring network access.

## Default hosting

| Parameter | Default |
|---|---|
| S3 bucket | `baffledcat.com` |
| S3 prefix | `bifurcation/` |
| Public URL | `https://baffledcat.com/bifurcation/index.html` |

Override with `BIFURCATION_S3_BUCKET` / `BIFURCATION_S3_PREFIX`.

## Repository commands

Both deploys package independently through `packageBuild({ dir, version })` in
`actions/lib/build.mjs`. Install dev dependencies with `npm ci` first.

| Action | What it does |
|---|---|
| **Run Local** (`RunLocal.cmd`) | Opens `StartServer.cmd` in its own window, serving the working tree. |
| **Deploy Local** (`DeployLocal.cmd`) | Packages `Export/Local` as `0.0.C`, replaces that local folder, and serves it in its own window. |
| **Deploy Prod** (`DeployProd.cmd`) | Claims N, packages `Export/VersionN` as `0.N.C`, uploads assets first and HTML last, then verifies the live asset-version global. Humans only. |

Both deploys refuse uncommitted changes before packaging or claiming a release.
Production fetches and requires HEAD to be on the upstream branch before claiming.
C is `git rev-list --count HEAD`, captured with the full source hash before the
VERSION claim commit. N is claimed through `scripts/release-version.mjs`, using
the highest existing release folder as a floor. Release folders never overwrite.

Versions are written directly into HTML asset URLs and
`self.__BIFURCATION_DIAGRAM_ASSET_VERSION__`; bundles read the global for runtime
shader fetches and contain no release version. `build.json` records version, N,
C, source identity, build time and SHA-256 hashes of every non-HTML asset.
Production compares those hashes with `Export/Local/build.json` when source
commits match. Differences warn per file without blocking deployment.

```powershell
.\RunLocal.cmd
.\DeployLocal.cmd
# $env:PORT=7120; node actions\DeployLocal.mjs
# .\DeployProd.cmd   # humans / dashboard only
```

`npm run export` runs Deploy Local. `PORT` defaults to 8080, matching
`StartServer.cmd`. Stop an existing server before deploying locally.
Old export folders and metadata are left untouched and are no longer consumed.

## Smoke-test checklist

Open `http://127.0.0.1:8080` (or `PORT`) after Deploy Local:

- [ ] HTML asset URLs and global contain `0.0.C`, matching `build.json`
- [ ] Diagram accumulates and reaches ready state
- [ ] Pan, scroll zoom, and double-click reset work
- [ ] Settings sliders and colour palette apply
- [ ] Minimap shows overview and viewport box
- [ ] Resolution label updates on resize
- [ ] WebGPU initialises (requires localhost or HTTPS)

After a human runs Deploy Prod:

- [ ] Live asset-version global equals the full `0.N.C` version
- [ ] `Export/VersionN/build.json` identifies the intended source commit
- [ ] Hosted URL is HTTPS
