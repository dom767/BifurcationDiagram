/**
 * Desktop hover readout for the logistic parameter r under the cursor.
 */
export class CursorReadout {
  /**
   * @param {HTMLElement} element
   * @param {HTMLCanvasElement} canvas
   * @param {import("../math/camera.js").Camera} camera
   * @param {() => { width: number, height: number }} getCanvasSize
   * @param {(clientX: number, clientY: number) => { x: number, y: number }} clientToCanvas
   */
  constructor(element, canvas, camera, getCanvasSize, clientToCanvas) {
    this.element = element;
    this.canvas = canvas;
    this.camera = camera;
    this.getCanvasSize = getCanvasSize;
    this.clientToCanvas = clientToCanvas;
    this.enabled = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    this.mouseOver = false;
    /** @type {{ x: number, y: number } | null} */
    this.lastClient = null;

    if (this.enabled) {
      canvas.addEventListener("mouseenter", this.onMouseEnter);
      canvas.addEventListener("mouseleave", this.onMouseLeave);
      canvas.addEventListener("mousemove", this.onMouseMove);
    }
  }

  onMouseEnter = () => {
    this.mouseOver = true;
  };

  onMouseLeave = () => {
    this.mouseOver = false;
    this.lastClient = null;
    this.hide();
  };

  /** @param {MouseEvent} event */
  onMouseMove = (event) => {
    this.lastClient = { x: event.clientX, y: event.clientY };
    this.update(this.lastClient.x, this.lastClient.y);
  };

  /** @param {number} clientX @param {number} clientY */
  update(clientX, clientY) {
    if (!this.enabled) return;

    const pos = this.clientToCanvas(clientX, clientY);
    const { width, height } = this.getCanvasSize();
    const { r } = this.camera.canvasToData(pos.x, pos.y, width, height);
    const rPerPixel = this.camera.getRPerPixel(width);

    this.element.textContent = `r=${formatR(r, rPerPixel)}`;
    this.element.classList.remove("hidden");
  }

  refresh() {
    if (this.mouseOver && this.lastClient) {
      this.update(this.lastClient.x, this.lastClient.y);
    }
  }

  hide() {
    this.element.classList.add("hidden");
  }
}

/**
 * Decimal places so one-pixel steps in r are visible (min 2 at normal zoom, up to 8 when zoomed in).
 * @param {number} rPerPixel
 */
export function decimalPlacesForRDelta(rPerPixel) {
  if (!Number.isFinite(rPerPixel) || rPerPixel <= 0) return 2;
  return Math.min(8, Math.max(2, Math.ceil(-Math.log10(rPerPixel))));
}

/** @param {number} r @param {number} rPerPixel */
function formatR(r, rPerPixel) {
  return r.toFixed(decimalPlacesForRDelta(rPerPixel));
}
