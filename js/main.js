import { initWebGPU } from "./gpu/gpu.js";
import { BifurcationPass } from "./render/bifurcationPass.js";
import { CpuBifurcationPass } from "./render/cpuBifurcationPass.js";
import { Viewport } from "./ui/viewport.js";
import { AppChrome } from "./ui/appChrome.js";
import { SettingsPanel, ACCUMULATION_DEFAULTS } from "./ui/settingsPanel.js";
import { Minimap } from "./ui/minimap.js";
import { CursorReadout } from "./ui/cursorReadout.js";
import { Camera } from "./math/camera.js";

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("view"));
const overlay = /** @type {HTMLElement} */ (document.getElementById("overlay"));
const statusEl = /** @type {HTMLElement} */ (document.getElementById("status"));
const hintEl = /** @type {HTMLElement} */ (document.getElementById("hud-hint"));
const resolutionEl = /** @type {HTMLElement} */ (document.getElementById("resolution"));
const settingsEl = /** @type {HTMLElement} */ (document.getElementById("settings"));
const minimapCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById("minimap-canvas"));
const minimapReadoutEl = /** @type {HTMLElement} */ (document.getElementById("minimap-readout"));

const chrome = new AppChrome({ overlay, statusEl, hintEl, resolutionEl });
const camera = new Camera();

/** @type {BifurcationPass | null} */
let displayPass = null;
/** @type {CpuBifurcationPass | null} */
let computePass = null;
/** @type {Viewport | null} */
let viewport = null;
/** @type {Minimap | null} */
let minimap = null;
/** @type {CursorReadout | null} */
let cursorReadout = null;
/** @type {GPUCanvasContext | null} */
let context = null;

let refreshTimer = 0;
let refreshGeneration = 0;
let lastFrameWidth = 0;
let lastFrameHeight = 0;

/** @type {typeof ACCUMULATION_DEFAULTS} */
let accumulationSettings = { ...ACCUMULATION_DEFAULTS };

const accumulation = {
  active: false,
  busy: false,
  currentFrame: 0,
};

function requestAccumulationRestart() {
  refreshGeneration++;
  window.clearTimeout(refreshTimer);
  void startAccumulation();
}

function applyDisplaySettings({ brightness, paletteId }) {
  if (!computePass) return;
  computePass.setBrightness(brightness);
  computePass.setPalette(paletteId);
  computePass.buildPlotPixels();
  minimap?.setDisplaySettings({ brightness, paletteId });
  drawFrame();
}

function onSettingsChange(settings) {
  const prev = accumulationSettings;
  const scaleChanged = settings.horizontalScale !== prev.horizontalScale;
  const displayChanged =
    settings.brightness !== prev.brightness || settings.paletteId !== prev.paletteId;
  const accumulationChanged =
    settings.iterationsPerFrame !== prev.iterationsPerFrame ||
    settings.totalFrames !== prev.totalFrames;

  accumulationSettings = settings;

  if (scaleChanged) {
    const size = viewport?.getCanvasSize();
    camera.setHorizontalScale(
      settings.horizontalScale,
      size?.width,
      size?.height
    );
  }

  if (displayChanged) {
    applyDisplaySettings({
      brightness: settings.brightness,
      paletteId: settings.paletteId,
    });
  }

  if (accumulationChanged || scaleChanged) {
    requestAccumulationRestart();
  }
}

function onInteract() {
  scheduleRefresh();
}

function onReset() {
  window.clearTimeout(refreshTimer);
  refreshGeneration++;
  void startAccumulation();
}

function scheduleRefresh() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    void refreshView();
  }, 200);
}

async function refreshView() {
  if (!displayPass || !viewport) return;

  const { width, height } = viewport.getCanvasSize();
  const hasDelta = camera.hasPendingDelta();
  const sizeChanged = width !== lastFrameWidth || height !== lastFrameHeight;

  if (!hasDelta && !sizeChanged) return;

  if (hasDelta) {
    camera.commitView(width, height);
  }

  lastFrameWidth = width;
  lastFrameHeight = height;
  await startAccumulation();
}

async function startAccumulation() {
  if (!displayPass || !computePass || !viewport) return;

  const { width, height } = viewport.getCanvasSize();
  const generation = ++refreshGeneration;

  accumulation.active = false;
  accumulation.busy = false;
  accumulation.currentFrame = 0;

  displayPass.beginDisplay(width, height);
  computePass.setBrightness(accumulationSettings.brightness);
  computePass.setPalette(accumulationSettings.paletteId);
  computePass.beginAccumulation(camera.bounds, width, height, accumulationSettings);
  chrome.setProgress(0, accumulationSettings.totalFrames);

  if (generation !== refreshGeneration) return;

  accumulation.active = true;
  lastFrameWidth = width;
  lastFrameHeight = height;
}

function drawMinimap() {
  if (!minimap || !viewport) return;
  const { width, height } = viewport.getCanvasSize();
  minimap.draw(camera, width, height);
  cursorReadout?.refresh();
}

function drawFrame() {
  if (!displayPass || !context || !viewport || !computePass?.plotPixels) return;
  const { width, height } = viewport.getCanvasSize();
  displayPass.uploadPlotFromCpu(computePass.plotPixels, width, height);
  displayPass.draw(context, camera.getBlitTransform(width, height));
  drawMinimap();
}

async function runAccumulationStep() {
  if (!displayPass || !computePass || !viewport || accumulation.busy || !accumulation.active) return;
  if (camera.hasPendingDelta()) return;
  if (accumulation.currentFrame >= accumulationSettings.totalFrames) {
    accumulation.active = false;
    chrome.setReady();
    return;
  }

  accumulation.busy = true;
  const generation = refreshGeneration;

  try {
    await computePass.accumulateStep(accumulationSettings.iterationsPerFrame);
  } catch (err) {
    console.error(err);
    accumulation.active = false;
    accumulation.busy = false;
    chrome.setError(err instanceof Error ? err.message : "Accumulation failed.");
    return;
  }

  if (generation !== refreshGeneration) {
    accumulation.busy = false;
    return;
  }

  accumulation.currentFrame++;
  drawFrame();

  if (accumulation.currentFrame >= accumulationSettings.totalFrames) {
    accumulation.active = false;
    chrome.setReady();
  } else {
    chrome.setProgress(accumulation.currentFrame, accumulationSettings.totalFrames);
  }

  accumulation.busy = false;
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  chrome.setResolution(width, height);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    scheduleRefresh();
  }
}

function frame() {
  resizeCanvas();

  if (displayPass && context && viewport) {
    if (accumulation.active && !accumulation.busy && !camera.hasPendingDelta()) {
      void runAccumulationStep();
    } else if (displayPass.computeComplete && computePass?.plotPixels) {
      drawFrame();
    } else {
      drawMinimap();
    }
  }

  requestAnimationFrame(frame);
}

async function main() {
  chrome.setComputing("Initialising…");

  try {
    const gpu = await initWebGPU(canvas);
    context = gpu.context;

    displayPass = new BifurcationPass(gpu.device, gpu.format);
    await displayPass.init();
    computePass = new CpuBifurcationPass();

    viewport = new Viewport(canvas, camera, onInteract, onReset);
    cursorReadout = new CursorReadout(
      minimapReadoutEl,
      canvas,
      camera,
      () => viewport.getCanvasSize(),
      (clientX, clientY) => viewport.clientToCanvas(clientX, clientY)
    );
    new SettingsPanel({ root: settingsEl, onChange: onSettingsChange });

    minimap = new Minimap(minimapCanvas);
    void minimap.start().then(() => {
      minimap?.setDisplaySettings({
        brightness: accumulationSettings.brightness,
        paletteId: accumulationSettings.paletteId,
      });
    });

    resizeCanvas();
    await startAccumulation();

    requestAnimationFrame(frame);

    window.addEventListener("resize", () => {
      resizeCanvas();
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error initialising the viewer.";
    chrome.setError(message);
    console.error(err);
  }
}

main();
