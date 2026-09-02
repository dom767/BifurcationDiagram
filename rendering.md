# Rendering — logistic bifurcation diagram

How the bifurcation diagram is computed and drawn.

## Map

**Logistic map:**

\[
x_{n+1} = r \cdot x_n \cdot (1 - x_n)
\]

| Parameter | Default | Role |
|---|---|---|
| `rMin`, `rMax` | 2.5, 4.0 | Horizontal data range in current frame |
| `xMin`, `xMax` | 0.0, 1.0 | Vertical data range in current frame |
| `x0` | 0.5 | Initial state for every column |
| `burnIn` | 256 | Transient iterations discarded before plotting |
| `plotSamples` | 512 | Attractor samples recorded per column after burn-in |
| `samplesPerPass` (N) | 64 | Iterations per accumulation step |

## Camera and frame model

Two concepts drive the viewer:

| Concept | Meaning |
|---|---|
| `renderBounds` | Data window baked into the last frame: `{ rMin, rMax, xMin, xMax }` |
| `viewDelta` | Temporary pan/zoom applied while interacting: `{ panX, panY, scale }` |

**During interaction:** the last frame is blitted with `viewDelta` transform — no recomputation.

**After 200 ms idle:** `commitView()` merges `viewDelta` into `renderBounds`, resets delta to identity, and recomputes a fresh canvas-sized frame.

See [js/math/camera.js](js/math/camera.js).

## Pass order

1. **CPU accumulate (fp64)** — For each column, run N logistic iterations in JavaScript `Float64Array` state. Each plotted sample increments a per-pixel density buffer.
2. **Normalize** — Convert density to grayscale display pixels.
3. **GPU blit** — Upload plot texture and draw a fullscreen triangle to the canvas.

```text
Float64Array state (× canvasWidth)
       ↓↑
  CPU accumulate  →  Float64Array density (canvasWidth × canvasHeight)
                           ↓ normalize
                    Uint8ClampedArray plot pixels
                           ↓ upload
                    blit pass → canvas
```

The plot texture is always **canvas-sized** (device pixels). Each refresh fills the full frame with the current `renderBounds`.

## Density accumulation

Each time a plotted iteration lands in a pixel, that pixel's density is incremented by 1. After each accumulation step, density is normalized for display:

\[
\text{intensity} = \frac{\text{density}}{\text{plottedIterations} \times (xMax - xMin)}
\]

| Term | Meaning |
|---|---|
| `plottedIterations` | `min(max(iterationOffset − burnIn, 0), plotSamples)` |
| `xMax − xMin` | Visible vertical span in data space |

Zooming in 10× vertically shrinks the visible span by 10, so the same orbit density appears 10× brighter — compensating for the narrower window.

Display value: `min(255, round(intensity × 255))` per channel.

## Column mapping

Column `i` maps to \( r = rMin + \frac{i}{width-1}(rMax - rMin) \).

Vertical row from attractor value \(x\):

\[
t = \frac{x - xMin}{xMax - xMin}, \quad row = \mathrm{round}((1 - t) \cdot (height - 1))
\]

## Blit shader

During interaction, `viewDelta` produces blit offset/scale:

- `uv.x = (px - panX) / (scale × canvasWidth)`
- `uv.y = (py - panY) / (scale × canvasHeight)`

Fragment shader samples the plot texture with linear filtering, reads the max RGB channel as intensity, and mixes toward white on background `#1c1812`.

## Shaders

Source: [js/render/shaders/logistic.wgsl](js/render/shaders/logistic.wgsl)

Blit vertex and fragment modules only; accumulation runs on the CPU.

## Multi-pass state

Each animation frame runs one CPU step of `iterationsPerFrame` logistic iterations. State and density are preserved across frames; density is re-normalized after each step for progressive display.

| Setting | Default | Role |
|---|---|---|
| Iterations per frame | 64 | Logistic steps per animation frame |
| Total frames | 2000 | Animation frames to accumulate before stopping |
| Horizontal scale | 1× | Relative stretch of the current r span around the view centre |

Total plotted iterations after burn-in: `totalFrames × iterationsPerFrame`. Burn-in (`256`) iterations at the start of each accumulation pass are not plotted.

After pan/zoom idle (200 ms), accumulation restarts for the new visible bounds.
