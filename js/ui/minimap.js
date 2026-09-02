import { DEFAULTS } from "../math/logistic.js";
import { CpuBifurcationPass } from "../render/cpuBifurcationPass.js";

const MINIMAP_WIDTH = 240;
const MINIMAP_HEIGHT = 150;
/** Rough attractor samples after burn-in — enough to sketch the diagram. */
const OVERVIEW_PLOT_SAMPLES = 100;
const OVERVIEW_CHUNK = 64;

/**
 * Top-right overview minimap with a live viewport indicator over a
 * low-sample logistic bifurcation background.
 */
export class Minimap {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.computePass = new CpuBifurcationPass();
    this.overviewBounds = {
      rMin: DEFAULTS.rMin,
      rMax: DEFAULTS.rMax,
      xMin: DEFAULTS.xMin,
      xMax: DEFAULTS.xMax,
    };
    /** @type {HTMLCanvasElement | null} */
    this.overviewCanvas = null;
    this.ready = false;
    this.busy = false;
  }

  async start() {
    if (this.busy) return;
    this.busy = true;
    this.ready = false;

    this.canvas.width = MINIMAP_WIDTH;
    this.canvas.height = MINIMAP_HEIGHT;

    const burnIn = DEFAULTS.burnIn;
    const totalIterations = burnIn + OVERVIEW_PLOT_SAMPLES;
    const totalFrames = Math.ceil(totalIterations / OVERVIEW_CHUNK);

    this.computePass.beginAccumulation(
      this.overviewBounds,
      MINIMAP_WIDTH,
      MINIMAP_HEIGHT,
      {
        iterationsPerFrame: OVERVIEW_CHUNK,
        totalFrames,
      }
    );
    // Cap plotted samples at the rough budget (beginAccumulation uses frames × chunk).
    this.computePass.params.plotSamples = OVERVIEW_PLOT_SAMPLES;
    this.computePass.params.burnIn = burnIn;

    while (this.computePass.iterationOffset < burnIn + OVERVIEW_PLOT_SAMPLES) {
      await this.computePass.accumulateStep(OVERVIEW_CHUNK);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    this.cacheOverviewImage();
    this.ready = true;
    this.busy = false;
  }

  /** @param {{ brightness: number, paletteId: string }} settings */
  setDisplaySettings({ brightness, paletteId }) {
    this.computePass.setBrightness(brightness);
    this.computePass.setPalette(paletteId);
    if (this.ready) {
      this.refreshOverviewCache();
    }
  }

  refreshOverviewCache() {
    if (!this.overviewCanvas) return;

    this.computePass.buildPlotPixels();
    const overviewCtx = this.overviewCanvas.getContext("2d");
    if (!overviewCtx || !this.computePass.plotPixels) return;

    overviewCtx.putImageData(
      new ImageData(
        new Uint8ClampedArray(this.computePass.plotPixels),
        MINIMAP_WIDTH,
        MINIMAP_HEIGHT
      ),
      0,
      0
    );
  }

  cacheOverviewImage() {
    this.overviewCanvas = document.createElement("canvas");
    this.overviewCanvas.width = MINIMAP_WIDTH;
    this.overviewCanvas.height = MINIMAP_HEIGHT;
    this.refreshOverviewCache();
  }

  /**
   * @param {import("../math/camera.js").Camera} camera
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   */
  draw(camera, canvasWidth, canvasHeight) {
    const ctx = this.ctx;
    if (!ctx) return;

    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.fillStyle = "#1c1812";
    ctx.fillRect(0, 0, width, height);

    if (this.ready && this.overviewCanvas) {
      ctx.drawImage(this.overviewCanvas, 0, 0);
    }

    const visible = camera.getVisibleBounds(canvasWidth, canvasHeight);
    const rect = this.dataBoundsToRect(visible);

    ctx.strokeStyle = "#ff3b3b";
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, Math.max(2, rect.width), Math.max(2, rect.height));
  }

  /**
   * @param {{ rMin: number, rMax: number, xMin: number, xMax: number }} bounds
   */
  dataBoundsToRect(bounds) {
    const { rMin, rMax, xMin, xMax } = this.overviewBounds;
    const rSpan = rMax - rMin;
    const xSpan = xMax - xMin;
    const width = this.canvas.width;
    const height = this.canvas.height;

    const left = ((bounds.rMin - rMin) / rSpan) * width;
    const right = ((bounds.rMax - rMin) / rSpan) * width;
    const top = (1 - (bounds.xMax - xMin) / xSpan) * height;
    const bottom = (1 - (bounds.xMin - xMin) / xSpan) * height;

    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }
}
