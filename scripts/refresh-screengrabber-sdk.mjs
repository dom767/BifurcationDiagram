/**
 * Pulls the ScreenGrabber SDK into js/vendor/ before an export is bundled.
 * See AgentStandards guidelines/libraries.md: each app pulls the SDK itself, and the export
 * fails rather than shipping a stale or partial copy.
 *
 *   import { refreshScreenGrabberSdk } from "./scripts/refresh-screengrabber-sdk.mjs";
 *   await refreshScreenGrabberSdk(ROOT);   // throws if the SDK can't be refreshed
 *
 * The checked-in copy is what source development runs; it's only rewritten when upstream differs.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = "dom767/ScreenGrabber";
const BRANCH = "master";
const SDK_PATH = "sdk/baffled-screenshots.js";
const SDK_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${SDK_PATH}`;
const DEST_REL = "js/vendor/baffled-screenshots.js";
const TIMEOUT_MS = 30000;

/** The vendored file without its provenance header, with LF line endings. */
function bodyOf(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^\/\/ Source: .*\n\/\/ Revision: .*\n/, "");
}

/** The commit `master` points at, for the provenance header; null if it can't be resolved. */
function upstreamCommit() {
  try {
    const out = execFileSync("git", ["ls-remote", `https://github.com/${REPO}`, `refs/heads/${BRANCH}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: TIMEOUT_MS,
    });
    return /^[0-9a-f]{40}/.exec(out)?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Downloads the SDK and writes it to js/vendor/ if it changed.
 * @param {string} root repo root
 * @returns {Promise<{ changed: boolean, dest: string }>}
 */
export async function refreshScreenGrabberSdk(root) {
  const dest = path.join(root, DEST_REL);
  console.log(`Refreshing ScreenGrabber SDK from ${SDK_URL}`);

  let res;
  try {
    res = await fetch(SDK_URL, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (err) {
    const c = err instanceof Error ? err.cause : null;
    const detail = c ? [c.code, c.message, ...(c.errors ?? []).map((e) => e.code ?? e.message)].filter(Boolean) : [];
    const cause = detail.length ? ` (${detail.join(", ")})` : "";
    throw new Error(`ScreenGrabber SDK refresh failed: ${err instanceof Error ? err.message : err}${cause}`);
  }
  if (res.status !== 200) {
    throw new Error(`ScreenGrabber SDK refresh failed: HTTP ${res.status} from ${SDK_URL}`);
  }

  const upstream = bodyOf(await res.text());
  if (!upstream.trim()) {
    throw new Error("ScreenGrabber SDK refresh failed: empty response.");
  }
  if (!upstream.includes("export function createBaffledScreenshots")) {
    throw new Error("ScreenGrabber SDK refresh failed: response doesn't export createBaffledScreenshots.");
  }

  const current = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : "";
  if (bodyOf(current) === upstream) {
    console.log(`ScreenGrabber SDK is up to date (${DEST_REL}).`);
    return { changed: false, dest };
  }

  const revision = upstreamCommit() ?? `${BRANCH} (commit not resolved)`;
  const header = `// Source: ${REPO} ${SDK_PATH}\n// Revision: ${revision} (vendored ESM).\n`;
  fs.writeFileSync(dest, header + upstream, "utf8");
  console.log(`ScreenGrabber SDK updated (${DEST_REL}, ${revision}). Commit the refreshed file.`);
  return { changed: true, dest };
}
