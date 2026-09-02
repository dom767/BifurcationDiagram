/** Default parameters for the standard logistic bifurcation diagram. */
export const DEFAULTS = {
  rMin: 2.5,
  rMax: 4.0,
  x0: 0.5,
  xMin: 0.0,
  xMax: 1.0,
  burnIn: 256,
  plotSamples: 512,
  samplesPerPass: 64,
};

/** Default horizontal scale (1 = no relative stretch from the current view). */
export const HORIZONTAL_SCALE_DEFAULT = 1;

/**
 * Map horizontal scale to an absolute r span around a centre
 * (used for docs / helpers; live camera stretch is relative — see Camera.setHorizontalScale).
 * @param {number} scale
 * @param {number} [center]
 */
export function rRangeForScale(scale = HORIZONTAL_SCALE_DEFAULT, center = (DEFAULTS.rMin + DEFAULTS.rMax) * 0.5) {
  const baseSpan = DEFAULTS.rMax - DEFAULTS.rMin;
  const span = baseSpan / Math.max(scale, 1e-6);
  return {
    rMin: center - span * 0.5,
    rMax: center + span * 0.5,
  };
}

/** One step of the logistic map: x_{n+1} = r * x_n * (1 - x_n). */
export function iterate(x, r) {
  return r * x * (1.0 - x);
}

/** Map column index to the logistic parameter r. */
export function rAtColumn(column, width, rMin, rMax) {
  if (width <= 1) return rMin;
  return rMin + (column / (width - 1)) * (rMax - rMin);
}

/** Total iterations required (burn-in + plotted samples). */
export function totalIterations({ burnIn, plotSamples }) {
  return burnIn + plotSamples;
}

/** Number of GPU passes needed for a given N per pass. */
export function passCount({ burnIn, plotSamples, samplesPerPass }) {
  return Math.ceil(totalIterations({ burnIn, plotSamples }) / samplesPerPass);
}
