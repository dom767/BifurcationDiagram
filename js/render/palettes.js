/**
 * Colour gradients from the Baffled Cat style guide palette.
 * All gradients: background → colour 1 → colour 2 → white (text).
 * Intensity t ∈ [0, 1] maps low density → high density.
 */

/** @typedef {{ id: string, label: string, stops: [number, number, number][] }} Palette */

/** @param {[number, number, number]} rgb */
function rgbToHsl([r, g, b]) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;

  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return [h * 360, s, l];
}

/** @param {number} h @param {number} s @param {number} l */
function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return /** @type {[number, number, number]} */ ([v, v, v]);
  }

  const hue2rgb = (p, q, t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, hue + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hue) * 255),
    Math.round(hue2rgb(p, q, hue - 1 / 3) * 255),
  ];
}

/** HSL colour-wheel complement (hue + 180°). */
export function wheelComplement(rgb) {
  const [h, s, l] = rgbToHsl(rgb);
  return hslToRgb(h + 180, s, l);
}

export const STYLE = {
  bg: [0x1c, 0x18, 0x12],
  raised: [0x26, 0x20, 0x19],
  text: [0xf6, 0xef, 0xe2],
  muted: [0xb3, 0xa6, 0x8e],
  faint: [0x85, 0x79, 0x5f],
  amber: [0xf2, 0xa5, 0x44],
  teal: [0x6f, 0xb8, 0xae],
  /** Wheel complement of amber (#4491f2) — not the style-guide teal accent. */
  amberComplement: wheelComplement([0xf2, 0xa5, 0x44]),
  /** Wheel complement of teal (#b86f79) — dusty rose. */
  tealComplement: wheelComplement([0x6f, 0xb8, 0xae]),
};

/** @type {Palette[]} */
export const PALETTES = [
  {
    id: "amber",
    label: "Amber",
    stops: [STYLE.bg, STYLE.amberComplement, STYLE.amber, STYLE.text],
  },
  {
    id: "teal",
    label: "Teal",
    stops: [STYLE.bg, STYLE.tealComplement, STYLE.teal, STYLE.text],
  },
  {
    id: "amber-teal",
    label: "Amber → teal",
    stops: [STYLE.bg, STYLE.amber, STYLE.teal, STYLE.text],
  },
  {
    id: "canvas",
    label: "Canvas",
    stops: [STYLE.bg, STYLE.raised, STYLE.muted, STYLE.text],
  },
];

export const DEFAULT_PALETTE_ID = "amber";

/**
 * @param {string} id
 * @returns {Palette}
 */
export function getPalette(id) {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/**
 * Sample a palette at intensity t ∈ [0, 1].
 * @param {Palette} palette
 * @param {number} t
 * @returns {[number, number, number]}
 */
export function samplePalette(palette, t) {
  const stops = palette.stops;
  if (stops.length === 1) return /** @type {[number, number, number]} */ ([...stops[0]]);

  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}
