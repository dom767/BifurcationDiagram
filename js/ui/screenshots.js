import { createBaffledScreenshots } from "../vendor/baffled-screenshots.js";
import { shotsConfig } from "../shotsConfig.js";

const MAX_BYTES = 2 * 1024 * 1024;

function jpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not encode screenshot.")), "image/jpeg", quality);
  });
}

// Copy immediately after the WebGPU draw, before yielding to the browser.
export function snapshotCanvas(source) {
  const scale = Math.min(1, 1920 / source.width, 1080 / source.height);
  const image = document.createElement("canvas");
  image.width = Math.max(1, Math.floor(source.width * scale));
  image.height = Math.max(1, Math.floor(source.height * scale));
  image.getContext("2d").drawImage(source, 0, 0, image.width, image.height);
  return image;
}

export async function encodeScreenshot(image) {
  let imageBlob;
  for (const quality of [0.92, 0.8, 0.65, 0.45, 0.25]) {
    imageBlob = await jpeg(image, quality);
    if (imageBlob.size <= MAX_BYTES) break;
  }
  if (imageBlob.size > MAX_BYTES) throw new Error("Screenshot exceeds the 2 MiB upload limit.");
  const thumb = document.createElement("canvas");
  thumb.width = thumb.height = 256;
  const ctx = thumb.getContext("2d");
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  ctx.fillRect(0, 0, 256, 256);
  const scale = Math.min(256 / image.width, 256 / image.height);
  const w = image.width * scale, h = image.height * scale;
  ctx.drawImage(image, (256 - w) / 2, (256 - h) / 2, w, h);
  return { imageBlob, thumbBlob: await jpeg(thumb, 0.85) };
}

export function initScreenshots(capture) {
  const take = document.getElementById("screenshot-take");
  const savePanel = document.getElementById("screenshot-save-panel");
  const saveTitle = document.getElementById("screenshot-save-title");
  const upload = document.getElementById("screenshot-upload");
  const status = document.getElementById("screenshot-status");
  const shots = createBaffledScreenshots(shotsConfig);
  let captured = null;

  function showSavePanel() {
    savePanel.hidden = false;
    savePanel.classList.remove("hidden");
    take.setAttribute("aria-expanded", "true");
  }

  async function takeScreenshot() {
    take.disabled = upload.disabled = true;
    showSavePanel();
    saveTitle.textContent = "Taking screenshot…";
    status.textContent = "Preparing screenshot…";
    try {
      const { image, meta } = capture();
      const pageUrl = location.href;
      const blobs = await encodeScreenshot(image);
      captured = { ...blobs, meta, pageUrl };
      const url = URL.createObjectURL(blobs.imageBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bifurcation-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      saveTitle.textContent = "Screenshot downloaded";
      status.textContent = "Ready to save to the server.";
    } catch (error) {
      captured = null;
      saveTitle.textContent = "Screenshot not saved";
      status.textContent = `Screenshot failed: ${error instanceof Error ? error.message : "Please try again."}`;
    } finally {
      take.disabled = false;
      upload.disabled = !captured;
    }
  }

  async function uploadScreenshot() {
    if (!captured) return;
    take.disabled = upload.disabled = true;
    status.textContent = "Uploading screenshot…";
    try {
      if (!shotsConfig.turnstileSiteKey && !shotsConfig.devBypassTurnstile) {
        throw new Error("Server uploads need a Turnstile site key. Your local screenshot is still saved.");
      }
      await shots.upload({
        ...captured,
        title: "Logistic bifurcation diagram",
      });
      status.textContent = "Screenshot saved to the server. Gallery visibility depends on moderation.";
    } catch (error) {
      status.textContent = `Server save failed: ${error instanceof Error ? error.message : "Please try again."}`;
    } finally {
      take.disabled = upload.disabled = false;
    }
  }

  take.addEventListener("click", () => void takeScreenshot());
  upload.addEventListener("click", () => void uploadScreenshot());
}
