#!/usr/bin/env node
// @ts-check
/**
 * Deploy Local — local export, then serve Export/Version… on this machine.
 * Uses PORT when set, otherwise 8080 (ports.md reserved default for this app).
 * See guidelines/repository-commands.md and deploy.md.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(root);

const port = Number(process.env.PORT) || 8080;

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

console.log("Deploy Local: exporting (local, no --release)…");
run(process.execPath, [path.join(root, "export-static.mjs")]);

const manifestPath = path.join(root, "Export", "latest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("Missing Export/latest.json — export did not complete.");
  process.exit(1);
}

/** @type {{ version: string, dir: string }} */
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const outDir = path.join(root, manifest.dir.replace(/\//g, path.sep));
if (!fs.existsSync(outDir)) {
  console.error(`Export directory not found: ${outDir}`);
  process.exit(1);
}

console.log(`\nExport ${manifest.version} ready at ${manifest.dir}`);
console.log(`Serving on http://127.0.0.1:${port}/`);
console.log("Close this window or press Ctrl+C to stop.");

run("npx", ["--yes", "serve", "-l", `tcp://127.0.0.1:${port}`, outDir], { shell: true });
process.exit(0);
