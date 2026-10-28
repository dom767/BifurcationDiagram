/** @typedef {{ width: number, height: number } | null} RenderResolution null = fit the window */

const STORAGE_KEY = "bifurcation.resolution";
const CUSTOM = "custom";
const WINDOW = "window";
export const MIN_SIDE = 16;
export const MAX_SIDE = 4096;

export const RESOLUTIONS = [
  { id: WINDOW, label: "Fit window" },
  { id: "720p", label: "720p · 1280 × 720", width: 1280, height: 720 },
  { id: "1080p", label: "1080p · 1920 × 1080", width: 1920, height: 1080 },
  { id: "1440p", label: "1440p · 2560 × 1440", width: 2560, height: 1440 },
  { id: "4k", label: "4K · 3840 × 2160", width: 3840, height: 2160 },
  { id: "square", label: "Square · 1080 × 1080", width: 1080, height: 1080 },
  { id: "portrait", label: "Portrait · 1080 × 1920", width: 1080, height: 1920 },
  { id: CUSTOM, label: "Custom…" },
];

/** @param {number} value */
function clampSide(value) {
  return Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.round(value) || MIN_SIDE));
}

/**
 * Resolution select (plus custom width × height) at the bottom of the Image panel.
 * The choice is remembered locally; it is a device preference, not part of the shared view URL.
 */
export class ResolutionPicker {
  /**
   * @param {{ onChange: (resolution: RenderResolution) => void }} options
   */
  constructor({ onChange }) {
    this.onChange = onChange;
    this.select = /** @type {HTMLSelectElement} */ (document.getElementById("render-resolution"));
    this.customRow = document.getElementById("resolution-custom");
    this.widthInput = /** @type {HTMLInputElement} */ (document.getElementById("resolution-width"));
    this.heightInput = /** @type {HTMLInputElement} */ (document.getElementById("resolution-height"));

    for (const option of RESOLUTIONS) {
      const el = document.createElement("option");
      el.value = option.id;
      el.textContent = option.label;
      this.select.appendChild(el);
    }

    this.restore();
    this.select.addEventListener("change", () => this.emitChange());
    for (const input of [this.widthInput, this.heightInput]) {
      input.addEventListener("change", () => {
        input.value = String(clampSide(Number(input.value)));
        this.emitChange();
      });
    }
    this.syncCustomRow();
  }

  restore() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      saved = null;
    }
    if (!saved || !RESOLUTIONS.some((r) => r.id === saved.id)) return;
    this.select.value = saved.id;
    if (saved.id === CUSTOM) {
      this.widthInput.value = String(clampSide(saved.width));
      this.heightInput.value = String(clampSide(saved.height));
    }
  }

  save() {
    const value = { id: this.select.value, ...(this.getResolution() || {}) };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Storage may be unavailable; the choice still applies for this session.
    }
  }

  syncCustomRow() {
    const custom = this.select.value === CUSTOM;
    this.customRow.hidden = !custom;
    this.customRow.classList.toggle("hidden", !custom);
  }

  /** @returns {RenderResolution} */
  getResolution() {
    if (this.select.value === CUSTOM) {
      return {
        width: clampSide(Number(this.widthInput.value)),
        height: clampSide(Number(this.heightInput.value)),
      };
    }
    const preset = RESOLUTIONS.find((r) => r.id === this.select.value);
    return preset?.width ? { width: preset.width, height: preset.height } : null;
  }

  emitChange() {
    this.syncCustomRow();
    this.save();
    this.onChange(this.getResolution());
  }
}
