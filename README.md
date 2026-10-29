# Logistic bifurcation diagram

Interactive viewer for the classic bifurcation diagram of the logistic map. Accumulation runs in JavaScript fp64; WebGPU is used only to blit the result to the canvas.

## Quick start

Double-click `StartServer.cmd` (requires [Node.js LTS](https://nodejs.org/)), or run:

```powershell
.\StartServer.cmd
```

Open [http://localhost:8080](http://localhost:8080) in a WebGPU-capable browser (Chrome or Edge 113+).

No build step is required for development. The launcher downloads the static server through npx when needed. Set `PORT` to use another port. Close the server window or press Ctrl+C to stop.

## Production export

AgentController repository commands (see [deploy.md](deploy.md)):

```powershell
npm install
.\Build.cmd                 # local export only (no release claim, no upload)
.\DeployLocal.cmd           # local export + serve Export/Version… (respects PORT)
# .\DeployProd.cmd          # humans only: release + S3 upload + verify
```

Or: `node actions\Build.mjs` / `node actions\DeployLocal.mjs`. Creates `Export/VersionN-localK/` (or `VersionN` on Deploy Prod) with bundled JS/CSS, version-stamped `index.html`, and the WGSL shader. See [deploy.md](deploy.md) and [deploy_guide.md](deploy_guide.md).

Legacy wrappers still work: `Export-Static.ps1 -SkipUpload` ≈ Build; `Export-Static.cmd` ≈ Deploy Prod.

Smoke-test a build (or use Deploy Local):

```powershell
npx --yes serve Export/VersionN -p 8080
```

## What it shows

The logistic map:

\[
x_{n+1} = r \cdot x_n \cdot (1 - x_n)
\]

For each value of \(r\) along the horizontal axis (default range 2.5–4.0), the map is iterated in fp64 on the CPU. After a burn-in period, attractor values of \(x\) accumulate into a per-pixel density buffer, normalized by iteration count and visible height. The result is the familiar period-doubling cascade and chaotic bands with finer detail than fp32 GPU compute.

See [rendering.md](rendering.md) for accumulation and normalization details.

## Controls

| Input | Action |
|---|---|
| Drag | Pan (moves last render; recomputes after 200 ms idle) |
| Scroll wheel | Zoom toward cursor (same stale-then-refresh behaviour) |
| Pinch (touch) | Zoom |
| Double-click / double-tap | Reset view to full diagram |

During pan/zoom the last frame is transformed interactively. After 200 ms of inactivity the visible data window is recomputed at full canvas resolution, then detail accumulates progressively over multiple frames.

The bottom toolbar opens Settings, Image and About panels, resets the view with Home,
and enters fullscreen where supported. Panels start closed and Escape dismisses them.
On touch devices the minimap and resolution readout are hidden to leave more room
for the diagram; panels scroll within the available viewport height.

## Settings

| Control | Description |
|---|---|
| Iterations per frame | Logistic steps computed each animation frame (state preserved between frames) |
| Total frames | Number of frames to accumulate before stopping |
| Horizontal scale | Magnify r relative to the current view (above 1×); keeps the current centre |
| Colour | Density gradient from the style-guide palette |

## Image panel

- **Gallery:** thumbnails of approved screenshots saved to ScreenGrabber
  (`GET /v1/shots?app_id=bifurcation`), fetched the first time the panel opens,
  24 at a time with **Show more**. Clicking one restores that view (bounds,
  brightness and palette from its saved URL) in place; modifier-click opens it in
  a new tab. Old `?b=` brightness values in links still apply, though there is no
  longer a brightness slider.
- **Take screenshot:** see below.
- **Resolution:** *Fit window* (default) renders at the window size × device pixel
  ratio. Presets (720p, 1080p, 1440p, 4K, square, portrait) or a custom size
  (16–4096 px per side) render at exactly that size, and the canvas is scaled to fit
  the window and letterboxed, never stretched. The choice is stored in
  `localStorage`, not in the URL.

## Screenshots

The Image panel's **Take screenshot** action follows
ScreenGrabber's `TAKE_SCREENSHOT_GUI.md`. It snapshots the current diagram
(without overlays) and opens a **Take screenshot** dialog with a live preview,
Brightness and Contrast sliders (50–150 %, with Reset) and an **Upload to
baffledcat.com** checkbox (unchecked by default; the choice is remembered).
**Capture** bakes the adjustments into a JPEG that preserves the aspect ratio
and fits within 1920 × 1080 and 2 MiB, always downloads it, and — only when the
checkbox is ticked — uploads it with a 256 × 256 centre-cropped thumbnail and
metadata for view bounds, pan/zoom, settings and accumulated frames. Uploads
may become public after moderation.

Server setup still requires the ScreenGrabber administrator to:

1. Set the public Turnstile widget site key in `js/shotsConfig.js`.
   Keep `devBypassTurnstile: false` for production.
2. Register app ID `bifurcation` in ScreenGrabber's `ALLOWED_APP_IDS` and add
   production/local origins to `ALLOWED_ORIGINS` (including port 7100 for this
   agent's local testing, if desired), then redeploy ScreenGrabber.

ScreenGrabber doesn't push its SDK to this app: the app pulls it. The SDK is
vendored from ScreenGrabber; see `js/vendor/README.md` for its pinned revision.
Every export first re-downloads it from ScreenGrabber's `master` and fails if it
can't (see [deploy.md](deploy.md)), then bundles it through `js/main.js`.
Without the site key, upload reports a configuration message and local downloads
remain available. Network, CORS and verification failures are shown in the panel
and the controls can be retried.

## Browser requirements

- WebGPU support (Chrome 113+, Edge 113+, or other compatible browsers) — used for canvas blit only
- Secure context: **localhost** or **HTTPS**

## Project layout

```text
index.html          App shell
css/app.css         Baffled Cat dark theme
js/main.js          Entry point
js/gpu/gpu.js       WebGPU bootstrap
js/math/logistic.js Domain constants and helpers
js/render/          CPU accumulation + GPU blit
js/ui/              Viewport input and HUD
```

Shared guides: [app_guide.md](app_guide.md), [style_guide.md](style_guide.md), [deploy_guide.md](deploy_guide.md).
