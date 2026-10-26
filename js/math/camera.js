import { DEFAULTS, HORIZONTAL_SCALE_DEFAULT } from "./logistic.js";

const MIN_SCALE = 0.25;
const MAX_SCALE = 32;

/** @typedef {{ rMin: number, rMax: number, xMin: number, xMax: number }} RenderBounds */

/**
 * Camera maps between diagram data space (r, x) and canvas pixels.
 * renderBounds = data window baked into the last GPU frame.
 * viewDelta = temporary pan/zoom applied while interacting.
 */
export class Camera {
  constructor() {
    this.horizontalScale = HORIZONTAL_SCALE_DEFAULT;
    this.renderBounds = this.defaultBounds();
    this.viewDelta = { panX: 0, panY: 0, scale: 1 };
  }

  /** @returns {RenderBounds} */
  defaultBounds() {
    return {
      rMin: DEFAULTS.rMin,
      rMax: DEFAULTS.rMax,
      xMin: DEFAULTS.xMin,
      xMax: DEFAULTS.xMax,
    };
  }

  /**
   * Change horizontal magnification as a relative stretch of the current r span.
   * Higher scale → narrower window (more zoom); lower → wider. Centre and vertical
   * bounds stay fixed.
   * @param {number} scale
   * @param {number} [canvasWidth]
   * @param {number} [canvasHeight]
   */
  setHorizontalScale(scale, canvasWidth, canvasHeight) {
    if (
      canvasWidth != null &&
      canvasHeight != null &&
      this.hasPendingDelta()
    ) {
      this.commitView(canvasWidth, canvasHeight);
    }

    const nextScale = Math.max(scale, 1e-6);
    const prevScale = Math.max(this.horizontalScale, 1e-6);
    const { rMin, rMax, xMin, xMax } = this.renderBounds;
    const center = (rMin + rMax) * 0.5;
    const currentSpan = Math.max(rMax - rMin, 1e-12);
    // Higher scale magnifies: span shrinks by prev/next.
    const nextSpan = currentSpan * (prevScale / nextScale);

    this.horizontalScale = nextScale;
    this.renderBounds = {
      rMin: center - nextSpan * 0.5,
      rMax: center + nextSpan * 0.5,
      xMin,
      xMax,
    };
    this.viewDelta = { panX: 0, panY: 0, scale: 1 };
  }

  /** @returns {RenderBounds} */
  get bounds() {
    return this.renderBounds;
  }

  /** @param {RenderBounds} bounds */
  setBounds(bounds) {
    this.renderBounds = { ...bounds };
    this.viewDelta = { panX: 0, panY: 0, scale: 1 };
  }

  reset() {
    this.renderBounds = this.defaultBounds();
    this.viewDelta = { panX: 0, panY: 0, scale: 1 };
  }

  hasPendingDelta() {
    const { panX, panY, scale } = this.viewDelta;
    return scale !== 1 || panX !== 0 || panY !== 0;
  }

  applyPan(dx, dy) {
    this.viewDelta.panX += dx;
    this.viewDelta.panY += dy;
  }

  /**
   * Zoom toward a canvas pixel, keeping the diagram point under the cursor fixed.
   * @param {number} canvasX
   * @param {number} canvasY
   * @param {number} factor
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   */
  applyZoom(canvasX, canvasY, factor, canvasWidth, canvasHeight) {
    const before = this.canvasToUv(canvasX, canvasY, canvasWidth, canvasHeight);
    this.viewDelta.scale = clamp(this.viewDelta.scale * factor, MIN_SCALE, MAX_SCALE);
    const after = this.canvasToUv(canvasX, canvasY, canvasWidth, canvasHeight);

    const { scale } = this.viewDelta;
    this.viewDelta.panX += (after.u - before.u) * scale * canvasWidth;
    this.viewDelta.panY += (after.v - before.v) * scale * canvasHeight;
  }

  /**
   * Change in r per horizontal canvas pixel (includes live pan/zoom delta).
   * @param {number} canvasWidth
   */
  getRPerPixel(canvasWidth) {
    const { rMin, rMax } = this.renderBounds;
    const { scale } = this.viewDelta;
    return (rMax - rMin) / (scale * canvasWidth);
  }

  /**
   * Blit transform: maps canvas pixels to texture UV [0,1].
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   */
  getBlitTransform(canvasWidth, canvasHeight) {
    const { panX, panY, scale } = this.viewDelta;
    return {
      offsetX: panX,
      offsetY: panY,
      scaleX: scale * canvasWidth,
      scaleY: scale * canvasHeight,
      canvasWidth,
      canvasHeight,
    };
  }

  /**
   * Data-space bounds currently visible on the canvas, including pan/zoom delta.
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   * @returns {RenderBounds}
   */
  getVisibleBounds(canvasWidth, canvasHeight) {
    const corners = [
      this.canvasToData(0, 0, canvasWidth, canvasHeight),
      this.canvasToData(canvasWidth, 0, canvasWidth, canvasHeight),
      this.canvasToData(0, canvasHeight, canvasWidth, canvasHeight),
      this.canvasToData(canvasWidth, canvasHeight, canvasWidth, canvasHeight),
    ];

    let rMin = corners[0].r;
    let rMax = corners[0].r;
    let xMin = corners[0].x;
    let xMax = corners[0].x;

    for (const corner of corners) {
      rMin = Math.min(rMin, corner.r);
      rMax = Math.max(rMax, corner.r);
      xMin = Math.min(xMin, corner.x);
      xMax = Math.max(xMax, corner.x);
    }

    return { rMin, rMax, xMin, xMax };
  }

  /**
   * Merge viewDelta into renderBounds and reset delta to identity.
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   */
  commitView(canvasWidth, canvasHeight) {
    if (!this.hasPendingDelta()) return;

    const { rMin, rMax, xMin, xMax } = this.renderBounds;
    const rSpan = rMax - rMin;
    const xSpan = xMax - xMin;
    const visible = this.getVisibleBounds(canvasWidth, canvasHeight);

    let newRMin = visible.rMin;
    let newRMax = visible.rMax;
    let newXMin = visible.xMin;
    let newXMax = visible.xMax;

    // Guard against degenerate bounds after extreme zoom.
    if (newRMax - newRMin < rSpan * 1e-6) {
      const mid = (newRMin + newRMax) * 0.5;
      newRMin = mid - rSpan * 0.5;
      newRMax = mid + rSpan * 0.5;
    }
    if (newXMax - newXMin < xSpan * 1e-6) {
      const mid = (newXMin + newXMax) * 0.5;
      newXMin = mid - xSpan * 0.5;
      newXMax = mid + xSpan * 0.5;
    }

    this.renderBounds = { rMin: newRMin, rMax: newRMax, xMin: newXMin, xMax: newXMax };
    this.viewDelta = { panX: 0, panY: 0, scale: 1 };
  }

  /**
   * @param {number} canvasX
   * @param {number} canvasY
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   */
  canvasToUv(canvasX, canvasY, canvasWidth, canvasHeight) {
    const { panX, panY, scale } = this.viewDelta;
    return {
      u: (canvasX - panX) / (scale * canvasWidth),
      v: (canvasY - panY) / (scale * canvasHeight),
    };
  }

  /**
   * @param {number} canvasX
   * @param {number} canvasY
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   */
  canvasToData(canvasX, canvasY, canvasWidth, canvasHeight) {
    const { u, v } = this.canvasToUv(canvasX, canvasY, canvasWidth, canvasHeight);
    const { rMin, rMax, xMin, xMax } = this.renderBounds;
    return {
      r: rMin + u * (rMax - rMin),
      x: xMax - v * (xMax - xMin),
    };
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
