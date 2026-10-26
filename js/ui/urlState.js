/**
 * Keeps the page URL in sync with the current view so it can be bookmarked,
 * saved with screenshots and revisited.
 * Format: ?r=rMin,rMax&x=xMin,xMax&b=brightness&p=paletteId
 */

/** @param {number} value */
function fmt(value) {
  return String(Number(value.toPrecision(12)));
}

/** @param {string | null} text */
function pair(text) {
  if (!text) return null;
  const parts = text.split(",").map(Number);
  if (parts.length !== 2 || !parts.every(Number.isFinite) || parts[0] >= parts[1]) return null;
  return parts;
}

/**
 * @returns {{ bounds?: { rMin: number, rMax: number, xMin: number, xMax: number }, brightness?: number, paletteId?: string }}
 */
export function readUrlState() {
  const params = new URLSearchParams(location.search);
  const state = {};
  const r = pair(params.get("r"));
  const x = pair(params.get("x"));
  if (r && x) state.bounds = { rMin: r[0], rMax: r[1], xMin: x[0], xMax: x[1] };
  const b = Number(params.get("b"));
  if (params.has("b") && Number.isFinite(b) && b > 0) state.brightness = b;
  const p = params.get("p");
  if (p) state.paletteId = p;
  return state;
}

/**
 * @param {{ rMin: number, rMax: number, xMin: number, xMax: number }} bounds
 * @param {{ brightness: number, paletteId: string }} display
 */
export function writeUrlState(bounds, { brightness, paletteId }) {
  const params = new URLSearchParams(location.search);
  params.set("r", `${fmt(bounds.rMin)},${fmt(bounds.rMax)}`);
  params.set("x", `${fmt(bounds.xMin)},${fmt(bounds.xMax)}`);
  params.set("b", fmt(brightness));
  params.set("p", paletteId);
  const url = `${location.pathname}?${params.toString().replace(/%2C/g, ",")}${location.hash}`;
  history.replaceState(history.state, "", url);
}
