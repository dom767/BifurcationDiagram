#!/usr/bin/env node
// @ts-check
/**
 * Deploy Prod — ship the latest Build: claim VERSION, stamp it into Export/VersionN, upload,
 * verify the live asset version. It never rebuilds, so what goes live is what Deploy Local served.
 * Humans only (dashboard confirms). Agents must never run this.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, exportRoot, highestRelease, latestBuild, root, stampCopy } from "./lib/build.mjs";
import { claimVersion } from "../scripts/release-version.mjs";

const ASSET_VERSION_GLOBAL = "__BIFURCATION_DIAGRAM_ASSET_VERSION__";
const bucket = process.env.BIFURCATION_S3_BUCKET ?? "baffledcat.com";
let prefix = process.env.BIFURCATION_S3_PREFIX ?? "bifurcation/";
if (!prefix.endsWith("/")) prefix += "/";

/**
 * @param {string} command
 * @param {string[]} args
 */
function run(command, args) {
  console.log([command, ...args].join(" "));
  const r = spawnSync(command, args, {
    stdio: "inherit",
    cwd: root,
    env: process.env,
  });
  if (r.error) {
    console.error(r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
  return r;
}

/** @returns {string} */
function awsBin() {
  return process.platform === "win32" ? "aws.cmd" : "aws";
}

/** @returns {boolean} */
function awsIdentityOk() {
  const r = spawnSync(awsBin(), ["sts", "get-caller-identity"], {
    stdio: "ignore",
    cwd: root,
    shell: false,
    env: process.env,
  });
  return r.status === 0;
}

function ensureAwsAuth() {
  if (awsIdentityOk()) return;
  console.log("AWS credentials not found. Running aws login…");
  run(awsBin(), ["login"]);
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

try {
  const build = latestBuild();
  console.log(`Deploy Prod: ${describe(build)}`);
  if (build.source?.uncommittedChanges) {
    console.warn("Warning: this build has uncommitted changes in it.");
  }

  const n = claimVersion(root, { floor: highestRelease() });
  const version = String(n);
  const dir = stampCopy(build.dir, path.join(exportRoot, `Version${n}`), version);
  const s3Base = `s3://${bucket}/${prefix}`;

  console.log(`\nStamped ${version} into ${path.relative(root, dir).split(path.sep).join("/")}`);
  ensureAwsAuth();
  console.log(`\nUploading to ${s3Base}`);

  run(
    awsBin(),
    [
      "s3",
      "sync",
      dir,
      s3Base,
      "--delete",
      "--exclude",
      "index.html",
      "--exclude",
      "*.json.gz",
      "--cache-control",
      "public, max-age=31536000, immutable",
    ],
  );

  run(
    awsBin(),
    [
      "s3",
      "sync",
      dir,
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
  );

  run(
    awsBin(),
    [
      "s3",
      "cp",
      path.join(dir, "index.html"),
      `${s3Base}index.html`,
      "--cache-control",
      "public, max-age=60",
      "--content-type",
      "text/html; charset=utf-8",
    ],
  );

  const publicUrl = bucket.includes(".")
    ? `https://${bucket}/${prefix}index.html`
    : `https://${bucket}.s3.amazonaws.com/${prefix}index.html`;

  console.log(`Verifying remote version at ${publicUrl}`);
  await verifyRemoteVersion(publicUrl, version);
  console.log(`\nUpload complete. Version ${version} verified.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
