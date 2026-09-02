// @shader blit_vertex
struct Viewport {
  offset: vec2<f32>,
  scale: vec2<f32>,
  canvasSize: vec2<f32>,
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> viewport: Viewport;

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(1.0, 1.0)
  );

  let pos = positions[vertexIndex];
  var out: VertexOutput;
  out.position = vec4<f32>(pos, 0.0, 1.0);
  let pixel = vec2<f32>(
    (pos.x * 0.5 + 0.5) * viewport.canvasSize.x,
    (0.5 - pos.y * 0.5) * viewport.canvasSize.y,
  );
  out.uv = (pixel - viewport.offset) / viewport.scale;
  return out;
}

// @shader blit_fragment
struct Viewport {
  offset: vec2<f32>,
  scale: vec2<f32>,
  canvasSize: vec2<f32>,
}

@group(0) @binding(0) var<uniform> viewport: Viewport;
@group(0) @binding(1) var plotSampler: sampler;
@group(0) @binding(2) var plotTex: texture_2d<f32>;

@fragment
fn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let bg = vec3<f32>(0.109803922, 0.094117647, 0.070588235); // #1c1812
  let clamped = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
  let texSample = textureSample(plotTex, plotSampler, clamped);
  let inBounds = f32(uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0);
  let color = mix(bg, texSample.rgb, texSample.a * inBounds);
  return vec4<f32>(color, 1.0);
}
