#!/usr/bin/env node
/**
 * Static export packager for the bifurcation diagram viewer.
 * See deploy_guide.md for conventions.
 */

import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_ROOT = path.join(ROOT, "Export");
const ASSET_VERSION_GLOBAL = "__BIFURCATION_DIAGRAM_ASSET_VERSION__";
const SHADER_REL = "js/render/shaders/logistic.wgsl";

function nextVersion() {
  if (!fs.existsSync(EXPORT_ROOT)) return 1;
  const versions = fs
    .readdirSync(EXPORT_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^Version\d+$/.test(entry.name))
    .map((entry) => Number(entry.name.replace("Version", "")))
    .filter((n) => Number.isFinite(n));

  return versions.length ? Math.max(...versions) + 1 : 1;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function buildProductionHtml(sourceHtml, version) {
  let html = sourceHtml;

  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="css\/app\.css"\s*\/?>/i,
    `<link rel="stylesheet" href="app.bundle.min.css?v=${version}" />`
  );

  html = html.replace(
    /<script\s+type="module"\s+src="js\/main\.js"\s*><\/script>\s*/i,
    `<script>self.${ASSET_VERSION_GLOBAL} = "${version}";</script>\n  <script type="module" src="app.bundle.min.js?v=${version}"></script>\n`
  );

  if (html.includes('href="css/app.css"') || html.includes('src="js/main.js"')) {
    throw new Error("index.html still references dev asset paths after rewrite.");
  }

  if (!html.includes(ASSET_VERSION_GLOBAL)) {
    throw new Error(`index.html missing ${ASSET_VERSION_GLOBAL} stamp.`);
  }

  return html;
}

function printUploadCommands(version, outDir, bucket, prefix) {
  const s3Base = `s3://${bucket}/${prefix}`.replace(/\/+$/, "/");
  const local = outDir.replace(/\\/g, "/");

  console.log("\nManual upload commands:");
  console.log(`aws s3 sync "${local}" "${s3Base}" --delete --exclude index.html --exclude "*.json.gz" --cache-control "public, max-age=31536000, immutable"`);
  console.log(`aws s3 sync "${local}" "${s3Base}" --exclude "*" --include "*.json.gz" --content-type "application/gzip" --cache-control "public, max-age=31536000, immutable"`);
  console.log(`aws s3 cp "${local}/index.html" "${s3Base}index.html" --cache-control "public, max-age=60" --content-type "text/html; charset=utf-8"`);
  console.log(`\nVerify: curl -s "https://${bucket}/${prefix}index.html" | findstr /C:"${ASSET_VERSION_GLOBAL}"`);
  console.log(`Expected stamp: self.${ASSET_VERSION_GLOBAL} = "${version}";`);
}

async function main() {
  const version = nextVersion();
  const outDir = path.join(EXPORT_ROOT, `Version${version}`);
  const sourceHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  ensureDir(outDir);

  console.log(`Exporting Version${version} → ${path.relative(ROOT, outDir)}`);

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

  const productionHtml = buildProductionHtml(sourceHtml, version);
  fs.writeFileSync(path.join(outDir, "index.html"), productionHtml, "utf8");

  const manifest = {
    version,
    dir: path.relative(ROOT, outDir).replace(/\\/g, "/"),
    exportedAt: new Date().toISOString(),
    bucket: process.env.BIFURCATION_S3_BUCKET ?? "baffledcat.com",
    prefix: process.env.BIFURCATION_S3_PREFIX ?? "bifurcation/",
  };

  fs.writeFileSync(
    path.join(EXPORT_ROOT, "latest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  console.log(`\nExport complete: ${manifest.dir}`);
  console.log(`Manifest: Export/latest.json`);
  console.log(`Smoke test: npx --yes serve "${manifest.dir}" -p 8080`);
  printUploadCommands(version, outDir, manifest.bucket, manifest.prefix);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
