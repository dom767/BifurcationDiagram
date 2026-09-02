/**
 * Bootstrap WebGPU for a canvas element.
 * @returns {Promise<{ device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat }>}
 */
export async function initWebGPU(canvas) {
  if (!navigator.gpu) {
    throw new Error(
      "WebGPU is not available in this browser. Use Chrome or Edge 113+ on localhost or HTTPS."
    );
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("No WebGPU adapter found. Your GPU or driver may not support WebGPU.");
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!context) {
    throw new Error("Could not acquire a WebGPU context from the canvas.");
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: "opaque",
  });

  return { device, context, format };
}

/**
 * Load WGSL shader source from a URL (works with static file servers).
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function loadShaderSource(url) {
  const response = await fetch(assetUrl(url));
  if (!response.ok) {
    throw new Error(`Failed to load shader: ${url} (${response.status})`);
  }
  return response.text();
}

/**
 * Append a production version query when the export stamp global is set.
 * @param {string} path
 */
export function assetUrl(path) {
  const version = globalThis.__BIFURCATION_DIAGRAM_ASSET_VERSION__;
  if (!version) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${version}`;
}

/**
 * Split a combined WGSL file into compute and render shader modules.
 * @param {string} source
 * @returns {{ compute: string, blitVertex: string, blitFragment: string }}
 */
export function splitLogisticShaders(source) {
  const parts = source.split(/^\/\/ @shader (\w+)$/m);
  const shaders = {};
  for (let i = 1; i < parts.length; i += 2) {
    shaders[parts[i]] = parts[i + 1].trim();
  }
  return {
    compute: shaders.compute ?? source,
    blitVertex: shaders.blit_vertex ?? "",
    blitFragment: shaders.blit_fragment ?? "",
  };
}
