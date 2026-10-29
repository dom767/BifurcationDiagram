#!/usr/bin/env node
// @ts-check
/**
 * Build — local static export only (no upload, no release-number claim).
 * Runs `node export-static.mjs` → Export/Version<N>-local<k>.
 * See guidelines/repository-commands.md and deploy.md.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(root);

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
  run("npm", ["install"], { shell: true });
}

console.log("Build: node export-static.mjs (local, no --release)");
run(process.execPath, [path.join(root, "export-static.mjs")]);
process.exit(0);
