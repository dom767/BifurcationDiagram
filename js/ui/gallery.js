import { createBaffledScreenshots } from "../vendor/baffled-screenshots.js";
import { shotsConfig } from "../shotsConfig.js";

const PAGE_SIZE = 24;

/** @typedef {{ id: string, createdAt: number, pageUrl?: string, thumbUrl: string, title?: string }} Shot */

/**
 * Approved bifurcation screenshots from ScreenGrabber, shown as thumbnails in the Image panel.
 * Each thumbnail is a link to the view it was taken from; a plain click opens it in place.
 */
export class Gallery {
  /**
   * @param {{ onOpen: (search: string) => void }} options
   *   receives the shot's query string (?r=…&x=…&b=…&p=…) to restore the view.
   */
  constructor({ onOpen }) {
    this.onOpen = onOpen;
    this.grid = document.getElementById("gallery-grid");
    this.status = document.getElementById("gallery-status");
    this.more = /** @type {HTMLButtonElement} */ (document.getElementById("gallery-more"));
    this.shots = createBaffledScreenshots(shotsConfig);
    /** @type {string | null} */
    this.cursor = null;
    this.loading = false;
    this.loaded = false;

    this.more.addEventListener("click", () => void this.load());
  }

  /** Fetch the first page the first time the panel is opened. */
  ensureLoaded() {
    if (!this.loaded && !this.loading) void this.load();
  }

  async load() {
    this.loading = true;
    this.more.disabled = true;
    if (!this.loaded) this.setStatus("Loading saved screenshots…");
    try {
      const page = await this.shots.list({ limit: PAGE_SIZE, cursor: this.cursor || undefined });
      for (const shot of page.shots || []) this.grid.appendChild(this.renderShot(shot));
      this.cursor = page.nextCursor || null;
      this.loaded = true;
      this.setStatus(this.grid.children.length ? "" : "No saved screenshots yet.");
    } catch (error) {
      this.setStatus(`Couldn't load saved screenshots: ${error instanceof Error ? error.message : "please try again."}`);
    } finally {
      this.loading = false;
      this.more.disabled = false;
      const hasMore = Boolean(this.cursor);
      this.more.hidden = !hasMore;
      this.more.classList.toggle("hidden", !hasMore);
    }
  }

  /** @param {string} text */
  setStatus(text) {
    this.status.textContent = text;
    this.status.hidden = !text;
  }

  /** @param {Shot} shot */
  renderShot(shot) {
    const item = document.createElement("li");
    const date = new Date(shot.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" });
    const search = shot.pageUrl ? new URL(shot.pageUrl, location.href).search : "";

    const link = document.createElement("a");
    link.className = "gallery-shot";
    link.href = `${location.pathname}${search}`;
    link.title = `Open view saved ${date}`;
    link.setAttribute("aria-label", `${shot.title || "Saved view"}, ${date}`);
    link.addEventListener("click", (e) => {
      if (!search || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      this.onOpen(search);
    });

    const img = document.createElement("img");
    img.src = shot.thumbUrl;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.width = img.height = 256;
    link.appendChild(img);
    item.appendChild(link);
    return item;
  }
}
