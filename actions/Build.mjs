#!/usr/bin/env node
// @ts-check
/**
 * Build — one unnumbered package in Export/Build<k> (no upload, no release-number claim).
 * HTML keeps __VERSION__. Deploy Local and Deploy Prod stamp a copy of this package; neither rebuilds.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { newBuildDir, root, writeLatest } from "./lib/build.mjs";
import { sourceOf } from "../scripts/release-version.mjs";

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ shell?: boolean }} [opts]
 */
function run(command, args, opts = {}) {
  const r = spawnSync(command, args, {
    stdio: "inherit",
    cwd: root,
    shell: opts.shell ?? false,
    env: process.env,
  });
  if (r.error) {
    console.error(r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!fs.existsSync(path.join(root, "node_modules"))) {
  console.log("Installing dev dependencies…");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  run(npm, ["install"]);
}

const { packageInto } = await import("../export-static.mjs");
const { build, dir } = newBuildDir();
console.log(`Build: packaging into Export/Build${build}`);
try {
  await packageInto(dir);
  const manifest = writeLatest({ build, dir, source: sourceOf(root) });
  console.log(`Build ${manifest.build} ready in ${manifest.dir}.`);
} catch (err) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
