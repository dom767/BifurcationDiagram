#!/usr/bin/env node
/**
 * Packages the bifurcation diagram viewer into a folder Build has already chosen.
 * Leaves __VERSION__ in the HTML so Deploy Local and Deploy Prod can stamp a copy.
 * Does not claim a release number or upload. See deploy.md.
 *
 * Refreshes js/vendor/baffled-screenshots.js from ScreenGrabber first and fails if that fails.
 */

import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { refreshScreenGrabberSdk } from "./scripts/refresh-screengrabber-sdk.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ASSET_VERSION_GLOBAL = "__BIFURCATION_DIAGRAM_ASSET_VERSION__";
const PLACEHOLDER = "__VERSION__";
const SHADER_REL = "js/render/shaders/logistic.wgsl";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

/**
 * Production index.html: bundles, with the version left as a placeholder.
 * @param {string} sourceHtml
 */
function buildProductionHtml(sourceHtml) {
  let html = sourceHtml;

  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="css\/app\.css"\s*\/?>/i,
    `<link rel="stylesheet" href="app.bundle.min.css?v=${PLACEHOLDER}" />`
  );

  html = html.replace(
    /<script\s+type="module"\s+src="js\/main\.js"\s*><\/script>\s*/i,
    `<script>self.${ASSET_VERSION_GLOBAL} = "${PLACEHOLDER}";</script>\n  <script type="module" src="app.bundle.min.js?v=${PLACEHOLDER}"></script>\n`
  );

  if (html.includes('href="css/app.css"') || html.includes('src="js/main.js"')) {
    throw new Error("index.html still references dev asset paths after rewrite.");
  }

  if (!html.includes(ASSET_VERSION_GLOBAL) || !html.includes(PLACEHOLDER)) {
    throw new Error(`index.html missing ${ASSET_VERSION_GLOBAL} or ${PLACEHOLDER}.`);
  }

  return html;
}

/**
 * Bundle this app into `outDir`. The version stays as `__VERSION__` in the HTML only.
 * @param {string} outDir
 */
export async function packageInto(outDir) {
  await refreshScreenGrabberSdk(ROOT);
  const sourceHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  ensureDir(outDir);

  await esbuild.build({
    entryPoints: [path.join(ROOT, "js/main.js")],
    outfile: path.join(outDir, "app.bundle.min.js"),
    bundle: true,
    format: "esm",
    minify: true,
    sourcemap: false,
    target: ["es2022"],
    logLevel: "info",
  });

  await esbuild.build({
    entryPoints: [path.join(ROOT, "css/app.css")],
    outfile: path.join(outDir, "app.bundle.min.css"),
    minify: true,
    logLevel: "info",
  });

  copyFile(path.join(ROOT, SHADER_REL), path.join(outDir, SHADER_REL));

  fs.writeFileSync(path.join(outDir, "index.html"), buildProductionHtml(sourceHtml), "utf8");
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  console.error("Packaging runs through Build. Use Build.cmd, or: node actions/Build.mjs");
  process.exit(1);
}
