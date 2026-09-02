import { DEFAULTS, passCount } from "../math/logistic.js";
import { loadShaderSource, splitLogisticShaders } from "../gpu/gpu.js";

/**
 * GPU display pass — blits CPU-generated plot texture to the canvas.
 */
export class BifurcationPass {
  /**
   * @param {GPUDevice} device
   * @param {GPUTextureFormat} canvasFormat
   */
  constructor(device, canvasFormat) {
    this.device = device;
    this.canvasFormat = canvasFormat;
    this.frameWidth = 0;
    this.frameHeight = 0;
    this.computeComplete = false;

    /** @type {GPUTexture | null} */
    this.plotTexture = null;
    /** @type {GPUSampler | null} */
    this.linearSampler = null;
    /** @type {GPUBuffer | null} */
    this.viewportBuffer = null;
    /** @type {GPUBindGroup | null} */
    this.blitBindGroup = null;
    /** @type {GPURenderPipeline | null} */
    this.blitPipeline = null;
    /** @type {GPUBindGroupLayout | null} */
    this.blitBindGroupLayout = null;
  }

  async init() {
    const source = await loadShaderSource("js/render/shaders/logistic.wgsl");
    const { blitVertex, blitFragment } = splitLogisticShaders(source);

    const blitVertexModule = this.device.createShaderModule({ code: blitVertex });
    const blitFragmentModule = this.device.createShaderModule({ code: blitFragment });

    this.blitBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      ],
    });

    this.blitPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.blitBindGroupLayout] }),
      vertex: { module: blitVertexModule, entryPoint: "main" },
      fragment: {
        module: blitFragmentModule,
        entryPoint: "main",
        targets: [{ format: this.canvasFormat }],
      },
      primitive: { topology: "triangle-list" },
    });

    this.linearSampler = this.device.createSampler({ magFilter: "linear", minFilter: "linear" });

    this.viewportBuffer = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * @param {{ rMin: number, rMax: number, xMin: number, xMax: number }} renderBounds
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   */
  beginDisplay(canvasWidth, canvasHeight) {
    const width = Math.max(1, canvasWidth);
    const height = Math.max(1, canvasHeight);
    const sizeChanged = width !== this.frameWidth || height !== this.frameHeight;

    if (!sizeChanged && this.plotTexture) {
      return;
    }

    this.frameWidth = width;
    this.frameHeight = height;
    this.plotTexture?.destroy();

    this.plotTexture = this.device.createTexture({
      size: { width, height },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    this.blitBindGroup = this.device.createBindGroup({
      layout: this.blitBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.viewportBuffer } },
        { binding: 1, resource: this.linearSampler },
        { binding: 2, resource: this.plotTexture.createView() },
      ],
    });

    this.computeComplete = true;
  }

  /**
   * @param {Uint8ClampedArray} pixels
   * @param {number} width
   * @param {number} height
   */
  uploadPlotFromCpu(pixels, width, height) {
    if (!this.plotTexture) return;
    this.device.queue.writeTexture(
      { texture: this.plotTexture },
      pixels,
      { bytesPerRow: width * 4, rowsPerImage: height },
      { width, height }
    );
    this.computeComplete = true;
  }

  /**
   * @param {GPUCanvasContext} context
   * @param {{ offsetX: number, offsetY: number, scaleX: number, scaleY: number, canvasWidth: number, canvasHeight: number }} transform
   */
  draw(context, transform) {
    if (!this.computeComplete || !this.blitBindGroup) return;

    this.device.queue.writeBuffer(
      this.viewportBuffer,
      0,
      new Float32Array([
        transform.offsetX,
        transform.offsetY,
        transform.scaleX,
        transform.scaleY,
        transform.canvasWidth,
        transform.canvasHeight,
      ])
    );

    const encoder = this.device.createCommandEncoder();
    const view = context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.109803922, g: 0.094117647, b: 0.070588235, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.blitPipeline);
    pass.setBindGroup(0, this.blitBindGroup);
    pass.draw(6);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}
