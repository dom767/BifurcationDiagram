# Static export and deploy guide

Reusable pattern for **Baffled Cat browser prototypes**: produce a versioned static build locally, then optionally upload to S3 (or compatible object storage) with sensible cache headers.

Each project keeps its own `deploy.md` (or README section) for app-specific paths, data sources, and smoke-test checklists. This guide covers the shared mechanics.

---

## Goals

- Ship a **self-contained static folder** — no dev server, no `node_modules`, no fetch scripts at runtime.
- Keep every build in its **own folder** (`Export/Build1`, `Build2`, …) and every release in `Export/VersionN`. Deploys copy a build and only replace `__VERSION__` in its HTML.
- **Bundle** ES-module JS (and minify CSS where applicable); do not concatenate modules as globals.
- **Version-stamp** assets with `?v=N` so long-lived cache headers are safe.
- **Separate data refresh from packaging** when the app depends on fetched snapshots (catalogs, manifests, etc.).
- Upload with **immutable cache** for versioned assets and **short cache** for `index.html`.
- **Verify** the live site reports the expected version after upload.

---

## Conventions

| Item | Convention |
| --- | --- |
| Export root | `Export/` at project root (gitignored) |
| Build folders | `Build1`, `Build2`, … from **Build**, with `__VERSION__` still in the HTML |
| Release folders | `Version1`, `Version2`, … stamped by **Deploy Prod** from the latest build |
| Local copies | `Build<k>-local`, stamped `b<k>-local` by **Deploy Local** (replaced each time) |
| Release number | Kept on GitHub in `VERSION`. **Deploy Prod** claims the next number (`scripts/release-version.mjs`) before stamping. Build and Deploy Local do not use one up |
| Manifest | `Export/latest.json`: `{ "build", "dir", "builtAt", "source" }` written by Build |
| Public URL | `https://<bucket>/<prefix>/index.html` — prefix must match where users browse |

Do not mutate an old version folder in place. Always create the next number. Never pick a release number from the folders on your machine: other machines release too.

### `Export/latest.json`

After a successful export, write:

```json
{
  "build": 12,
  "dir": "Export/Build12",
  "builtAt": "2026-08-28T08:08:22.257Z",
  "source": { "commit": "abc1234", "uncommittedChanges": false }
}
```

Deploy Local and Deploy Prod read this manifest. They deploy **that build**, and they never rebuild.

---

## Pipeline overview

```text
Source tree
    │
    ▼
1. (Optional) Refresh fetched data — separate command, not part of export
   Vendored shared libraries (ScreenGrabber SDK) ARE refreshed here; export fails if that fails
    │
    ▼
2. Take the next Export/Build<k> and leave __VERSION__ in the HTML
    │
    ▼
3. Bundle JS entry → app.bundle.min.js (esbuild / Rollup / Vite)
    │
    ▼
4. Emit / minify CSS → app.bundle.min.css
    │
    ▼
5. Copy or gzip runtime data assets into the export folder
    │
    ▼
6. Rewrite index.html for production (?v=__VERSION__, bundle paths, asset-version global)
    │
    ▼
7. Write Export/latest.json
    │
    ▼
8. Smoke-test locally
    │
    ▼
9. Deploy Prod claims VERSION, stamps Export/VersionN, uploads that folder, verifies the live stamp
```

---

## Development vs production entry

Typical dev `index.html`:

```html
<link rel="stylesheet" href="css/app.css" />
<script type="module" src="js/main.js"></script>
```

Production rewrite (version `N`):

```html
<link rel="stylesheet" href="app.bundle.min.css?v=__VERSION__" />
<script>self.__APP_ASSET_VERSION__ = "__VERSION__";</script>
<script type="module" src="app.bundle.min.js?v=__VERSION__"></script>
```

Replace `__APP_ASSET_VERSION__` with a project-specific global name (e.g. `__BIFURCATION_DIAGRAM_ASSET_VERSION__`). The loader reads that global and appends `?v=` to runtime fetches. A deploy replaces `__VERSION__` in the HTML only.

Use **page-relative paths** (no leading `/`) so the app works at a subpath such as `/myapp/`.

---

## Bundling

- **Entry:** project’s main module (e.g. `js/main.js`).
- **Format:** `esm`, `bundle: true`, `minify: true`.
- **Output:** `app.bundle.min.js` in the build folder (`Export/Build<k>`).
- **Fail hard** if bundling fails — do not ship an incomplete export.

Keep large runtime data **external** (fetched at load time) unless you intentionally want a single huge bundle. Do not inline multi‑MB JSON via the bundler’s JSON loader unless that is a deliberate trade-off.

### CSS

- Single stylesheet or a small chain — emit one `app.bundle.min.css` at the export root.
- External fonts/CDNs: either keep as `<link>` in HTML or document why they stay external.

---

## Runtime data assets

When the app `fetch`es JSON (or other files) at runtime:

| Environment | Typical pattern |
| --- | --- |
| Local dev | Plain `data/foo.json` |
| Production export | `data/foo.json.gz` (optional but recommended for large files) |

If using gzip in production:

- Ship **only** `.json.gz` in the export (omit uncompressed JSON).
- Set S3 `Content-Type: application/gzip`.
- **Do not** set `Content-Encoding: gzip` — the client decompresses with `DecompressionStream`.
- Append `?v=N` to fetch URLs when the asset-version global is set.

**Separate data refresh from export.** A flaky upstream API must not block a release build. Run fetch/import scripts explicitly before export when you want fresh data. Vendored shared libraries are the exception: the export refreshes the ScreenGrabber SDK itself and fails if it can't (see [deploy.md](deploy.md)).

---

## What ships vs what stays in source

**Must ship (typical static app)**

| Export path | Role |
| --- | --- |
| `index.html` | Rewritten entry page |
| `app.bundle.min.js` | Bundled application |
| `app.bundle.min.css` | Styles |
| Runtime data / images | Whatever the app fetches or references |

**Must not ship**

| Exclude | Why |
| --- | --- |
| `js/` source tree | Folded into bundle |
| `css/` source (if emitted to root) | Avoid duplicate paths |
| `node_modules/`, `package.json` | Build-time only |
| Dev server scripts (`Start.cmd`, etc.) | Local only |
| Fetch / import scripts | Authoring, not runtime |
| `Export/` itself | Never nest exports |
| Packaging sources (`export-static.mjs`, `actions/`) | Not runtime |
| Docs, VCS, editor config | Not runtime |

Adjust per project; document extras in that project’s `deploy.md`.

---

## Upload (S3)

Upload **only** the stamped `Export/VersionN` folder (not the whole `Export/` tree, and not the unstamped build).

Default parameters (override per project):

| Parameter | Example |
| --- | --- |
| Bucket | `baffledcat.com` |
| Prefix | `myapp/` (must match the public URL path) |

### Cache headers

| Content | Cache-Control | Content-Type | Notes |
| --- | --- | --- | --- |
| `app.bundle.min.js`, `.css`, images | `public, max-age=31536000, immutable` | defaults | Safe with `?v=N` |
| `*.json.gz` | same | `application/gzip` | No `Content-Encoding` |
| `index.html` | `public, max-age=60` | `text/html; charset=utf-8` | Short TTL picks up new version stamp |

### Sync pattern (AWS CLI)

```powershell
# 1. Long-cache assets (exclude entry + gz catalogs)
aws s3 sync "Export/VersionN" "s3://bucket/prefix/" `
  --delete --exclude index.html --exclude "*.json.gz" `
  --cache-control "public, max-age=31536000, immutable"

# 2. Gzipped data
aws s3 sync "Export/VersionN" "s3://bucket/prefix/" `
  --exclude "*" --include "*.json.gz" `
  --content-type "application/gzip" `
  --cache-control "public, max-age=31536000, immutable"

# 3. Short-cache entry
aws s3 cp "Export/VersionN/index.html" "s3://bucket/prefix/index.html" `
  --cache-control "public, max-age=60" --content-type "text/html; charset=utf-8"
```

Use `--delete` only when the prefix is dedicated to this app. Do not sync into a shared prefix without a subdirectory.

### Post-upload verification

Fetch the public `index.html` and confirm the asset-version global matches `N`. Fail the script if it does not — catches wrong prefix, stale CDN edge, or upload to the wrong path.

### Secure context

Features like WebGPU, camera, geolocation, etc. require **HTTPS** (or `localhost`). Plain `http://` on a real hostname is not enough.

### AWS authentication

Wrapper should probe `aws sts get-caller-identity` before upload; on failure, run `aws login` and retry.

---

## Intended file layout (per project)

```text
myapp/
  index.html
  css/app.css
  js/main.js                 # or other entry
  data/                      # optional runtime snapshots
  actions/Build.mjs          # package into Export/Build<k>
  actions/DeployLocal.mjs    # stamp b<k>-local and serve
  actions/DeployProd.mjs     # claim, stamp VersionN, upload
  actions/RunDev.mjs         # serve the working tree
  export-static.mjs          # packager used by Build
  Export/                    # generated; gitignored
    latest.json
    Build1/
    VersionN/
  deploy.md                  # project-specific notes (optional)
  deploy_guide.md            # this file (copy into each repo, or symlink)
```

---

## Commands (target UX)

```powershell
.\RunDev.cmd          # working tree, no build
.\Build.cmd           # Export/Build<k>, __VERSION__ left in the HTML
.\DeployLocal.cmd     # stamp b<k>-local and serve that copy
.\DeployProd.cmd      # humans only: claim VERSION, stamp, upload, verify
```

Deploy Prod prints the `aws s3` commands it runs. Bucket and prefix come from the environment (`BIFURCATION_S3_BUCKET`, `BIFURCATION_S3_PREFIX`) when set.

### Local smoke-test

Deploy Local serves `Export/Build<k>-local`. Or:

```powershell
npx --yes serve Export/Build1-local -p 8080
```

Open `http://localhost:8080`. Use HTTPS or localhost for APIs that require a secure context.

---

## Export checklist (generic)

- [ ] Fetched data (if any) is the snapshot you intend to ship
- [ ] New `Export/Build<k>` created with `__VERSION__` in the HTML only; `Export/latest.json` updated
- [ ] No source trees / dev tooling in the version folder
- [ ] `index.html` references production bundles, not dev paths
- [ ] `?v=N` on JS/CSS (and runtime fetches that use the version global)
- [ ] Upload prefix matches the URL users visit
- [ ] Post-upload verification passed (if uploaded)
- [ ] Hosted URL is HTTPS if the app needs a secure context

---

## Per-project `deploy.md` template

Each repo should add a short project doc covering:

1. **App shape** — entry HTML, module graph, workers, external fetches.
2. **Data pipeline** — what to refresh before export and how (`Fetch-Data.cmd`, etc.).
3. **Asset-version global name** — e.g. `__PLANETVIEWER_ASSET_VERSION__`.
4. **Default S3 bucket/prefix** and public URL.
5. **Smoke-test checklist** — features specific to that app.
6. **Implementation status** — which scripts exist in this repo.

Copy this `deploy_guide.md` unchanged into new projects; grow `deploy.md` from the template above.
