import { createBaffledScreenshots } from "../vendor/baffled-screenshots.js";
import { shotsConfig } from "../shotsConfig.js";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;
const THUMB_SIZE = 256;
const PREVIEW_WIDTH = 480;
const UPLOAD_PREF_KEY = "bifurcation.screenshot.upload";

function jpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not encode screenshot.")), "image/jpeg", quality);
  });
}

// Copy immediately after the WebGPU draw, before yielding to the browser.
export function snapshotCanvas(source) {
  const scale = Math.min(1, MAX_WIDTH / source.width, MAX_HEIGHT / source.height);
  const image = document.createElement("canvas");
  image.width = Math.max(1, Math.floor(source.width * scale));
  image.height = Math.max(1, Math.floor(source.height * scale));
  image.getContext("2d").drawImage(source, 0, 0, image.width, image.height);
  return image;
}

/** Same maths as CSS brightness() then contrast(), for browsers without ctx.filter. */
function adjustPixels(ctx, width, height, brightness, contrast) {
  const b = brightness / 100;
  const c = contrast / 100;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const lit = Math.min(1, (v / 255) * b);
    lut[v] = Math.round(((lit - 0.5) * c + 0.5) * 255);
  }
  const pixels = ctx.getImageData(0, 0, width, height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
  ctx.putImageData(pixels, 0, 0);
}

/** Draw `source` into `out` (already sized) with brightness/contrast baked into the pixels. */
function drawAdjusted(out, source, brightness, contrast) {
  const ctx = out.getContext("2d");
  const neutral = brightness === 100 && contrast === 100;
  if (neutral || "filter" in ctx) {
    ctx.filter = neutral ? "none" : `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.drawImage(source, 0, 0, out.width, out.height);
    ctx.filter = "none";
  } else {
    ctx.drawImage(source, 0, 0, out.width, out.height);
    adjustPixels(ctx, out.width, out.height, brightness, contrast);
  }
  return out;
}

export function renderAdjustedCanvas(source, { brightness = 100, contrast = 100, maxWidth = MAX_WIDTH, maxHeight = MAX_HEIGHT } = {}) {
  const scale = Math.min(1, maxWidth / source.width, maxHeight / source.height);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(source.width * scale));
  out.height = Math.max(1, Math.round(source.height * scale));
  return drawAdjusted(out, source, brightness, contrast);
}

/** Centre-cropped square thumbnail, as ScreenGrabber expects. */
export function renderSquareThumbCanvas(image, size = THUMB_SIZE) {
  const thumb = document.createElement("canvas");
  thumb.width = thumb.height = size;
  const side = Math.min(image.width, image.height);
  const sx = Math.round((image.width - side) / 2);
  const sy = Math.round((image.height - side) / 2);
  thumb.getContext("2d").drawImage(image, sx, sy, side, side, 0, 0, size, size);
  return thumb;
}

export async function encodeImage(image) {
  let imageBlob;
  for (const quality of [0.92, 0.8, 0.65, 0.45, 0.25]) {
    imageBlob = await jpeg(image, quality);
    if (imageBlob.size <= MAX_BYTES) break;
  }
  if (imageBlob.size > MAX_BYTES) throw new Error("Screenshot exceeds the 2 MiB upload limit.");
  return imageBlob;
}

function download(blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${shotsConfig.appId}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.jpg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function readUploadPref() {
  try {
    return localStorage.getItem(UPLOAD_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function writeUploadPref(value) {
  try {
    localStorage.setItem(UPLOAD_PREF_KEY, value ? "1" : "0");
  } catch {
    // Storage may be unavailable (private mode); the checkbox still works for this session.
  }
}

function errorText(error) {
  return error instanceof Error ? error.message : "Please try again.";
}

/**
 * Wire the Take screenshot button to the capture dialog.
 * @param {() => { image: HTMLCanvasElement, meta: object }} capture
 *   snapshots the current frame; throws if there is nothing to capture yet.
 */
export function initScreenshots(capture) {
  const take = document.getElementById("screenshot-take");
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById("screenshot-panel"));
  const preview = /** @type {HTMLCanvasElement} */ (document.getElementById("screenshot-preview"));
  const brightness = /** @type {HTMLInputElement} */ (document.getElementById("screenshot-brightness"));
  const brightnessValue = document.getElementById("screenshot-brightness-val");
  const contrast = /** @type {HTMLInputElement} */ (document.getElementById("screenshot-contrast"));
  const contrastValue = document.getElementById("screenshot-contrast-val");
  const upload = /** @type {HTMLInputElement} */ (document.getElementById("screenshot-upload-check"));
  const status = document.getElementById("screenshot-status");
  const reset = document.getElementById("screenshot-reset-btn");
  const cancel = document.getElementById("screenshot-cancel-btn");
  const close = document.getElementById("screenshot-close-btn");
  const captureBtn = /** @type {HTMLButtonElement} */ (document.getElementById("screenshot-capture-btn"));
  const shots = createBaffledScreenshots(shotsConfig);

  /** @type {{ image: HTMLCanvasElement, meta: object, pageUrl: string } | null} */
  let captured = null;
  let busy = false;
  let previewQueued = false;

  upload.checked = readUploadPref();

  function setStatus(text, isError = false) {
    status.textContent = text;
    status.hidden = !text;
    status.dataset.error = String(isError);
  }

  function adjustments() {
    return { brightness: Number(brightness.value), contrast: Number(contrast.value) };
  }

  function drawPreview() {
    previewQueued = false;
    if (!captured) return;
    const { brightness: b, contrast: c } = adjustments();
    drawAdjusted(preview, captured.image, b, c);
  }

  function schedulePreview() {
    brightnessValue.textContent = `${brightness.value}%`;
    contrastValue.textContent = `${contrast.value}%`;
    if (previewQueued) return;
    previewQueued = true;
    requestAnimationFrame(drawPreview);
  }

  function open() {
    try {
      // Synchronous: copies the canvas on the same task as the WebGPU draw.
      const { image, meta } = capture();
      captured = { image, meta, pageUrl: location.href };
    } catch (error) {
      captured = null;
      setStatus(`Screenshot failed: ${errorText(error)}`, true);
      captureBtn.disabled = true;
      dialog.showModal();
      return;
    }
    const scale = Math.min(1, PREVIEW_WIDTH / captured.image.width);
    preview.width = Math.max(1, Math.round(captured.image.width * scale));
    preview.height = Math.max(1, Math.round(captured.image.height * scale));
    setStatus("");
    captureBtn.disabled = false;
    schedulePreview();
    dialog.showModal();
    take.setAttribute("aria-expanded", "true");
  }

  function dismiss() {
    if (dialog.open) dialog.close();
  }

  async function onCapture() {
    if (!captured || busy) return;
    busy = true;
    captureBtn.disabled = true;
    setStatus("Capturing…");
    const shot = captured;
    const shouldUpload = upload.checked;
    let image, imageBlob;
    try {
      image = renderAdjustedCanvas(shot.image, adjustments());
      imageBlob = await encodeImage(image);
      download(imageBlob);
    } catch (error) {
      setStatus(`Screenshot failed: ${errorText(error)}`, true);
      busy = false;
      captureBtn.disabled = false;
      return;
    }
    if (!shouldUpload) {
      busy = false;
      dismiss();
      return;
    }
    setStatus("Uploading…");
    try {
      if (!shotsConfig.turnstileSiteKey && !shotsConfig.devBypassTurnstile) {
        throw new Error("Server uploads need a Turnstile site key.");
      }
      const thumbBlob = await jpeg(renderSquareThumbCanvas(image), 0.85);
      await shots.upload({
        imageBlob,
        thumbBlob,
        pageUrl: shot.pageUrl,
        meta: shot.meta,
        title: "Logistic bifurcation diagram",
      });
      setStatus("Downloaded and uploaded to baffledcat.com. Gallery visibility depends on moderation.");
    } catch (error) {
      setStatus(`Downloaded, but the upload failed: ${errorText(error)}`, true);
    } finally {
      busy = false;
      captureBtn.disabled = false;
    }
  }

  brightness.addEventListener("input", schedulePreview);
  contrast.addEventListener("input", schedulePreview);
  reset.addEventListener("click", () => {
    brightness.value = contrast.value = "100";
    schedulePreview();
  });
  upload.addEventListener("change", () => writeUploadPref(upload.checked));
  cancel.addEventListener("click", dismiss);
  close.addEventListener("click", dismiss);
  // Backdrop clicks land on the <dialog> itself; clicks inside land on the form.
  dialog.addEventListener("click", e => {
    if (e.target === dialog) dismiss();
  });
  dialog.addEventListener("close", () => {
    take.setAttribute("aria-expanded", "false");
    captured = null;
  });
  captureBtn.addEventListener("click", () => void onCapture());
  take.addEventListener("click", open);
}
