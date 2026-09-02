/** Minimal HUD overlay wiring. */
export class AppChrome {
  /**
   * @param {{ overlay: HTMLElement, statusEl: HTMLElement, hintEl: HTMLElement, resolutionEl?: HTMLElement }} elements
   */
  constructor({ overlay, statusEl, hintEl, resolutionEl = null }) {
    this.overlay = overlay;
    this.statusEl = statusEl;
    this.hintEl = hintEl;
    this.resolutionEl = resolutionEl;
  }

  setComputing(message = "Computing diagram…") {
    this.statusEl.textContent = message;
    this.statusEl.classList.remove("hidden", "is-error");
  }

  setReady() {
    this.statusEl.classList.add("hidden");
    this.statusEl.classList.remove("is-error");
  }

  setProgress(current, total) {
    this.statusEl.textContent = `Accumulating frame ${current} / ${total}…`;
    this.statusEl.classList.remove("hidden", "is-error");
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  setResolution(width, height) {
    if (!this.resolutionEl) return;
    this.resolutionEl.textContent = `${width} × ${height}`;
  }

  setError(message) {
    this.statusEl.textContent = message;
    this.statusEl.classList.remove("hidden");
    this.statusEl.classList.add("is-error");
    if (this.hintEl) {
      this.hintEl.classList.add("hidden");
    }
  }
}
