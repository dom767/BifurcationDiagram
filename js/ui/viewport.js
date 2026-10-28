import { Camera } from "../math/camera.js";

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DISTANCE = 24;

/**
 * Pointer input handler — drives camera viewDelta only (no GPU work).
 */
export class Viewport {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Camera} camera
   * @param {() => void} onInteract
   * @param {() => void} [onReset]
   */
  constructor(canvas, camera, onInteract, onReset = () => {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.onInteract = onInteract;
    this.onReset = onReset;

    this.isDragging = false;
    this.lastPointer = { x: 0, y: 0 };
    this.pointers = new Map();
    this.lastPinchDistance = 0;
    this.lastTapTime = 0;
    this.lastTapPos = { x: 0, y: 0 };

    this.bindEvents();
  }

  /** Backing-store size: the window size × DPR, or the fixed render resolution. */
  getCanvasSize() {
    return {
      width: Math.max(1, this.canvas.width),
      height: Math.max(1, this.canvas.height),
    };
  }

  /** Canvas pixels per CSS pixel (not just DPR once a fixed resolution is scaled to fit). */
  pixelScale() {
    const rect = this.canvas.getBoundingClientRect();
    return rect.width > 0 ? this.canvas.width / rect.width : window.devicePixelRatio || 1;
  }

  clientToCanvas(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scale = this.pixelScale();
    return {
      x: (clientX - rect.left) * scale,
      y: (clientY - rect.top) * scale,
    };
  }

  bindEvents() {
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
    this.canvas.addEventListener("pointercancel", (e) => this.onPointerUp(e));
    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    this.canvas.addEventListener("dblclick", (e) => {
      e.preventDefault();
      this.camera.reset();
      this.onReset();
    });
  }

  onPointerDown(e) {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 1) {
      const now = performance.now();
      const pos = { x: e.clientX, y: e.clientY };
      const dt = now - this.lastTapTime;
      const dist = Math.hypot(pos.x - this.lastTapPos.x, pos.y - this.lastTapPos.y);
      if (dt < DOUBLE_TAP_MS && dist < DOUBLE_TAP_DISTANCE) {
        this.camera.reset();
        this.onReset();
        this.lastTapTime = 0;
        return;
      }
      this.lastTapTime = now;
      this.lastTapPos = pos;

      this.isDragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.canvas.classList.add("is-dragging");
    } else if (this.pointers.size === 2) {
      this.isDragging = false;
      this.canvas.classList.remove("is-dragging");
      this.lastPinchDistance = this.pinchDistance();
    }
  }

  onPointerMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const scale = this.pixelScale();
    const { width, height } = this.getCanvasSize();

    if (this.pointers.size >= 2) {
      const dist = this.pinchDistance();
      if (this.lastPinchDistance > 0) {
        const center = this.pinchCenter();
        const canvasPos = this.clientToCanvas(center.x, center.y);
        this.camera.applyZoom(
          canvasPos.x,
          canvasPos.y,
          dist / this.lastPinchDistance,
          width,
          height
        );
        this.onInteract();
      }
      this.lastPinchDistance = dist;
      return;
    }

    if (this.isDragging) {
      const dx = (e.clientX - this.lastPointer.x) * scale;
      const dy = (e.clientY - this.lastPointer.y) * scale;
      this.camera.applyPan(dx, dy);
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.onInteract();
    }
  }

  onPointerUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) {
      this.lastPinchDistance = 0;
    }
    if (this.pointers.size === 0) {
      this.isDragging = false;
      this.canvas.classList.remove("is-dragging");
    }
    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
  }

  onWheel(e) {
    e.preventDefault();
    const pos = this.clientToCanvas(e.clientX, e.clientY);
    const { width, height } = this.getCanvasSize();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.camera.applyZoom(pos.x, pos.y, factor, width, height);
    this.onInteract();
  }

  pinchDistance() {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }

  pinchCenter() {
    const pts = [...this.pointers.values()];
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
  }
}
