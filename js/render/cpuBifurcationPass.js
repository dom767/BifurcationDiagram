import { DEFAULTS, iterate, rAtColumn } from "../math/logistic.js";
import { DEFAULT_PALETTE_ID, getPalette, samplePalette } from "./palettes.js";

/** Baseline display gain; slider value 1.0 maps to this. */
export const BASE_DISPLAY_GAIN = 100;

/**
 * fp64 CPU accumulator with per-pixel density accumulation.
 */
export class CpuBifurcationPass {
  constructor(params = DEFAULTS) {
    this.params = { ...params };
    this.frameWidth = 0;
    this.frameHeight = 0;
    this.iterationOffset = 0;
    this.computeComplete = false;
    /** @type {Float64Array | null} */
    this.state = null;
    /** @type {Float64Array | null} */
    this.density = null;
    /** @type {Uint8ClampedArray | null} */
    this.plotPixels = null;
    this.brightness = 1;
    this.paletteId = DEFAULT_PALETTE_ID;
  }

  /** @param {number} brightness */
  setBrightness(brightness) {
    this.brightness = brightness;
  }

  /** @param {string} paletteId */
  setPalette(paletteId) {
    this.paletteId = paletteId;
  }

  /**
   * @param {{ rMin: number, rMax: number, xMin: number, xMax: number }} renderBounds
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   * @param {{ iterationsPerFrame: number, totalFrames: number }} accumulation
   */
  beginAccumulation(renderBounds, canvasWidth, canvasHeight, accumulation) {
    const width = Math.max(1, canvasWidth);
    const height = Math.max(1, canvasHeight);

    this.frameWidth = width;
    this.frameHeight = height;
    this.params.columnCount = width;
    this.params.rMin = renderBounds.rMin;
    this.params.rMax = renderBounds.rMax;
    this.params.xMin = renderBounds.xMin;
    this.params.xMax = renderBounds.xMax;
    this.params.samplesPerPass = accumulation.iterationsPerFrame;
    this.params.plotSamples = accumulation.totalFrames * accumulation.iterationsPerFrame;

    this.state = new Float64Array(width).fill(this.params.x0);
    this.density = new Float64Array(width * height);
    this.plotPixels = new Uint8ClampedArray(width * height * 4);
    this.iterationOffset = 0;
    this.computeComplete = true;
  }

  /** Iteration count that has contributed plotted samples so far. */
  getPlottedIterations() {
    const { burnIn, plotSamples } = this.params;
    return Math.min(Math.max(this.iterationOffset - burnIn, 0), plotSamples);
  }

  /** Visible height of the diagram in data space. */
  getXSpan() {
    return this.params.xMax - this.params.xMin;
  }

  /**
   * @param {number} iterationsPerFrame
   * @returns {Promise<number>}
   */
  async accumulateStep(iterationsPerFrame) {
    if (!this.state || !this.density) return this.iterationOffset;

    const {
      columnCount,
      burnIn,
      plotSamples,
      rMin,
      rMax,
      xMin,
      xMax,
    } = this.params;
    const height = this.frameHeight;
    const width = columnCount;
    const xSpan = xMax - xMin;
    const plotLimit = burnIn + plotSamples;
    const state = this.state;
    const density = this.density;

    for (let column = 0; column < width; column++) {
      let x = state[column];
      const r = rAtColumn(column, width, rMin, rMax);
      let iter = this.iterationOffset;

      for (let step = 0; step < iterationsPerFrame; step++) {
        x = iterate(x, r);

        if (iter >= burnIn && iter < plotLimit && xSpan > 0) {
          const t = (x - xMin) / xSpan;
          const row = Math.round((1 - t) * (height - 1));
          density[row * width + column] += 1;
        }

        iter++;
      }

      state[column] = x;
    }

    this.iterationOffset += iterationsPerFrame;
    this.buildPlotPixels();
    this.computeComplete = true;
    return this.iterationOffset;
  }

  /**
   * Normalize accumulated density to display pixels.
   * intensity = density / (plottedIterations × visibleHeight)
   */
  buildPlotPixels() {
    if (!this.density || !this.plotPixels) return;

    const width = this.frameWidth;
    const height = this.frameHeight;
    const plotted = this.getPlottedIterations();
    const xSpan = this.getXSpan();
    const divisor = plotted * xSpan;
    const pixels = this.plotPixels;
    const density = this.density;

    if (divisor <= 0) {
      pixels.fill(0);
      return;
    }

    const palette = getPalette(this.paletteId);
    const gain = BASE_DISPLAY_GAIN * this.brightness;

    for (let i = 0; i < density.length; i++) {
      const intensity = (density[i] / divisor) * gain;
      const idx = i * 4;

      if (intensity <= 0) {
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
        continue;
      }

      const [r, g, b] = samplePalette(palette, Math.min(1, intensity));
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = 255;
    }
  }
}
