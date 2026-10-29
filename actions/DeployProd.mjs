#!/usr/bin/env node
// @ts-check
/**
 * Deploy Prod — claim VERSION, export with --release, upload to S3, verify live stamp.
 * Humans only (dashboard confirms). Agents must never run this.
 * Mirrors Export-Static.ps1 upload/verify; may call existing scripts until fully Node.
 * See guidelines/repository-commands.md and deploy.md.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(root);

const ASSET_VERSION_GLOBAL = "__BIFURCATION_DIAGRAM_ASSET_VERSION__";
const defaultBucket = process.env.BIFURCATION_S3_BUCKET ?? "baffledcat.com";
const defaultPrefix = process.env.BIFURCATION_S3_PREFIX ?? "bifurcation/";

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ shell?: boolean, capture?: boolean }} [opts]
 */
function run(command, args, opts = {}) {
  const r = spawnSync(command, args, {
    stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    cwd: root,
    shell: opts.shell ?? false,
    env: process.env,
    encoding: opts.capture ? "utf8" : undefined,
  });
  if (r.error) {
    console.error(r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) {
    if (opts.capture && r.stderr) process.stderr.write(String(r.stderr));
    process.exit(r.status ?? 1);
  }
  return r;
}

/** @returns {boolean} */
function awsIdentityOk() {
  const r = spawnSync("aws", ["sts", "get-caller-identity"], {
    stdio: "ignore",
    cwd: root,
    shell: true,
    env: process.env,
  });
  return r.status === 0;
}

function ensureAwsAuth() {
  if (awsIdentityOk()) return;
  console.log("AWS credentials not found. Running aws login…");
  run("aws", ["login"], { shell: true });
  if (!awsIdentityOk()) {
    console.error("AWS authentication still failed after aws login.");
    process.exit(1);
  }
}

/**
 * @param {string} publicUrl
 * @param {string} expectedVersion
 */
async function verifyRemoteVersion(publicUrl, expectedVersion) {
  const res = await fetch(publicUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${publicUrl}: HTTP ${res.status}`);
  }
  const html = await res.text();
  const needle = `self.${ASSET_VERSION_GLOBAL} = "${expectedVersion}"`;
  if (!html.includes(needle)) {
    throw new Error(`Remote index.html does not contain expected version stamp: ${needle}`);
  }
}

if (!fs.existsSync(path.join(root, "node_modules"))) {
  console.log("Installing dev dependencies…");
  run("npm", ["install"], { shell: true });
}

console.log("Deploy Prod: node export-static.mjs --release");
run(process.execPath, [path.join(root, "export-static.mjs"), "--release"]);

const manifestPath = path.join(root, "Export", "latest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("Missing Export/latest.json — export did not complete.");
  process.exit(1);
}

/** @type {{ version: string, dir: string, bucket?: string, prefix?: string }} */
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const version = String(manifest.version);
const outDir = path.join(root, manifest.dir.replace(/\//g, path.sep));
if (!fs.existsSync(outDir)) {
  console.error(`Export directory not found: ${outDir}`);
  process.exit(1);
}

const bucket = manifest.bucket || defaultBucket;
let prefix = manifest.prefix || defaultPrefix;
if (!prefix.endsWith("/")) prefix += "/";
const s3Base = `s3://${bucket}/${prefix}`;

console.log(`\nExport ${version} ready at ${manifest.dir}`);
ensureAwsAuth();

console.log(`\nUploading to ${s3Base}`);

run(
  "aws",
  [
    "s3",
    "sync",
    outDir,
    s3Base,
    "--delete",
    "--exclude",
    "index.html",
    "--exclude",
    "*.json.gz",
    "--cache-control",
    "public, max-age=31536000, immutable",
  ],
  { shell: true }
);

run(
  "aws",
  [
    "s3",
    "sync",
    outDir,
    s3Base,
    "--exclude",
    "*",
    "--include",
    "*.json.gz",
    "--content-type",
    "application/gzip",
    "--cache-control",
    "public, max-age=31536000, immutable",
  ],
  { shell: true }
);

run(
  "aws",
  [
    "s3",
    "cp",
    path.join(outDir, "index.html"),
    `${s3Base}index.html`,
    "--cache-control",
    "public, max-age=60",
    "--content-type",
    "text/html; charset=utf-8",
  ],
  { shell: true }
);

const publicUrl = bucket.includes(".")
  ? `https://${bucket}/${prefix}index.html`
  : `https://${bucket}.s3.amazonaws.com/${prefix}index.html`;

console.log(`Verifying remote version at ${publicUrl}`);
try {
  await verifyRemoteVersion(publicUrl, version);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

console.log(`\nUpload complete. Version ${version} verified.`);
process.exit(0);
