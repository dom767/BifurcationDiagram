import { DEFAULTS, HORIZONTAL_SCALE_DEFAULT } from "../math/logistic.js";
import { DEFAULT_PALETTE_ID, PALETTES } from "../render/palettes.js";

/** @typedef {{ iterationsPerFrame: number, totalFrames: number, horizontalScale: number, brightness: number, paletteId: string }} AccumulationSettings */

/** Default progressive accumulation settings. */
export const ACCUMULATION_DEFAULTS = {
  iterationsPerFrame: DEFAULTS.samplesPerPass,
  totalFrames: 2000,
  horizontalScale: HORIZONTAL_SCALE_DEFAULT,
  brightness: 1,
  paletteId: DEFAULT_PALETTE_ID,
};

/**
 * DOM settings panel for accumulation controls.
 */
export class SettingsPanel {
  /**
   * @param {{ root: HTMLElement, onChange: (settings: AccumulationSettings) => void }} options
   */
  constructor({ root, onChange }) {
    this.root = root;
    this.onChange = onChange;

    this.iterationsInput = /** @type {HTMLInputElement} */ (
      root.querySelector("#iterations-per-frame")
    );
    this.iterationsOutput = /** @type {HTMLOutputElement} */ (
      root.querySelector("#iterations-per-frame-value")
    );
    this.totalFramesInput = /** @type {HTMLInputElement} */ (
      root.querySelector("#total-frames")
    );
    this.totalFramesOutput = /** @type {HTMLOutputElement} */ (
      root.querySelector("#total-frames-value")
    );
    this.horizontalScaleInput = /** @type {HTMLInputElement} */ (
      root.querySelector("#horizontal-scale")
    );
    this.horizontalScaleOutput = /** @type {HTMLOutputElement} */ (
      root.querySelector("#horizontal-scale-value")
    );
    // No control any more; kept so links (and gallery shots) with ?b= still restore their look.
    this.brightness = ACCUMULATION_DEFAULTS.brightness;
    this.paletteSelect = /** @type {HTMLSelectElement} */ (
      root.querySelector("#colour-palette")
    );

    this.populatePalettes();

    for (const el of root.querySelectorAll("input, label, select")) {
      el.addEventListener("pointerdown", (e) => e.stopPropagation());
    }

    this.iterationsInput.addEventListener("input", () => this.emitChange());
    this.totalFramesInput.addEventListener("input", () => this.emitChange());
    this.horizontalScaleInput.addEventListener("input", () => this.emitChange());
    this.paletteSelect.addEventListener("change", () => this.emitChange());
    this.syncOutputs();
  }

  populatePalettes() {
    this.paletteSelect.replaceChildren();
    for (const palette of PALETTES) {
      const option = document.createElement("option");
      option.value = palette.id;
      option.textContent = palette.label;
      if (palette.id === DEFAULT_PALETTE_ID) option.selected = true;
      this.paletteSelect.appendChild(option);
    }
  }

  /** @returns {AccumulationSettings} */
  getSettings() {
    return {
      iterationsPerFrame: Number(this.iterationsInput.value),
      totalFrames: Number(this.totalFramesInput.value),
      horizontalScale: Number(this.horizontalScaleInput.value),
      brightness: this.brightness,
      paletteId: this.paletteSelect.value,
    };
  }

  syncOutputs() {
    this.iterationsOutput.textContent = this.iterationsInput.value;
    this.totalFramesOutput.textContent = this.totalFramesInput.value;
    this.horizontalScaleOutput.textContent = `${Number(this.horizontalScaleInput.value).toFixed(2)}×`;
  }

  /**
   * Set display controls without emitting a change (e.g. restoring from the URL).
   * @param {{ brightness?: number, paletteId?: string }} settings
   */
  setDisplaySettings({ brightness, paletteId }) {
    if (brightness != null) this.brightness = brightness;
    if (paletteId && PALETTES.some((p) => p.id === paletteId)) this.paletteSelect.value = paletteId;
    this.syncOutputs();
  }

  emitChange() {
    this.syncOutputs();
    this.onChange(this.getSettings());
  }
}

/**
 * @param {AccumulationSettings} settings
 * @returns {number}
 */
export function totalPlotSamples(settings) {
  return settings.totalFrames * settings.iterationsPerFrame;
}
