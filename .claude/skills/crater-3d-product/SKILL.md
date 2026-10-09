---
name: crater-3d-product
description: "Use when building, tuning, or reviewing a Three.js or React Three Fiber skincare product scene, model loading, lighting, GPU resources, or 3D fallbacks."
---

# Product scene implementation

Read `docs/architecture.md` for numerical budgets and `docs/asset-brief.md` for
model provenance. Match real dimensions and approved labels. Without source
assets, build a marked procedural preview and preserve its approximation status.

Use one lazy R3F canvas for the hero, with a separate image/HTML layer. Implement
poster/loading/ready/failed states, an error boundary, model-load failure, and
WebGL context loss. Preserve the image until a scene frame is ready. Keep all
purchase controls outside canvas and useful while the scene fails or loads.

## Runtime contract

Accept a stable normalized scroll progress ref and a motion policy. Mutate mesh
and camera transforms in frame work; do not set React state each frame. If using
`frameloop="demand"`, call `invalidate()` after external GSAP mutations. Pause
continuous animation when offscreen or the page is hidden; resume without jumps.

Start with a single compressed GLB, shared materials/geometries, baked or modest
lighting, 1024 textures, and DPR no greater than 1.5. Use the exact initial
budgets in the architecture doc: GLB 2 MiB, environment map 1 MiB, 50,000 visible
triangles, and 80 draw calls. Treat them as project targets and measure reality.
Avoid expensive transmission, multiple dynamic shadows, and postprocessing until
profiling justifies them. Dispose only resources this scene owns.

Check model 404/slow loading, context loss, no-WebGL, reduced motion, route
remount, and constrained devices. Record asset sizes, renderer counters, and
actual device observations. Use a poster when quality cannot meet the budget.

Return the scene interface, asset dependencies, fallback evidence, and measured
limitations rather than calling every canvas a production-quality model.
