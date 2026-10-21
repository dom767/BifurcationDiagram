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

/** Bottom toolbar and mutually exclusive control sheets. */
export class ControlDock {
  constructor({ root, panels, onHome, fullscreenTarget }) {
    this.panels = panels;
    this.openPanel = null;
    this.panelButtons = root.querySelectorAll("[data-panel]");
    const fullscreenButton = root.querySelector("#dock-fullscreen");

    root.querySelector("#dock-home").addEventListener("click", () => {
      this.closeAll();
      onHome();
    });
    for (const button of this.panelButtons) {
      button.addEventListener("click", () => {
        const name = button.dataset.panel;
        this.openPanel = this.openPanel === name ? null : name;
        this.syncPanels();
      });
    }
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const activeButton = [...this.panelButtons].find(
        (button) => button.dataset.panel === this.openPanel
      );
      const hadFocus = Object.values(this.panels).some(
        (panel) => panel.contains(document.activeElement)
      );
      this.closeAll();
      if (hadFocus) activeButton?.focus();
    });

    const syncFullscreen = () => {
      const active = document.fullscreenElement === fullscreenTarget;
      fullscreenButton.classList.toggle("is-active", active);
      const label = active ? "Exit fullscreen" : "Enter fullscreen";
      fullscreenButton.title = label;
      fullscreenButton.setAttribute("aria-label", label);
      fullscreenButton.querySelector(".dock-icon-enter").classList.toggle("hidden", active);
      fullscreenButton.querySelector(".dock-icon-exit").classList.toggle("hidden", !active);
    };
    fullscreenButton.hidden = !document.fullscreenEnabled;
    fullscreenButton.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement === fullscreenTarget) {
          await document.exitFullscreen();
        } else {
          await fullscreenTarget.requestFullscreen();
        }
      } catch (error) {
        console.warn("Fullscreen unavailable:", error);
      }
    });
    document.addEventListener("fullscreenchange", syncFullscreen);
    syncFullscreen();
    this.syncPanels();
  }

  closeAll() {
    this.openPanel = null;
    this.syncPanels();
  }

  syncPanels() {
    for (const [name, panel] of Object.entries(this.panels)) {
      const active = name === this.openPanel;
      panel.hidden = !active;
      panel.classList.toggle("hidden", !active);
    }
    for (const button of this.panelButtons) {
      const active = button.dataset.panel === this.openPanel;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-expanded", String(active));
    }
  }
}
