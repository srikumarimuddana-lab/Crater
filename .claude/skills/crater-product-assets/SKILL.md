---
name: crater-product-assets
description: "Use when commissioning, generating, organizing, optimizing, or validating packshots, packaging labels, model exports, or matching scene posters for Crater products."
---

# Reusable product asset pipeline

Read `docs/asset-brief.md` and the budgets in `docs/architecture.md`. Collect
measured dimensions, packaging photographs, approved label artwork, material
references, usage rights, and the product handle before final asset production.

Produce the packshot first so frontend work is independent of model availability.
Then produce an accurate GLB and a matching poster. Share studio lights and common
materials across products while retaining their actual geometry and labels.
A procedural bottle without measured references remains a marked preview.

## Manifest and export

Use the asset conventions in the asset brief. Record each asset's product handle,
path, dimensions, source/provenance, license, and approval status in the planned
`src/lib/content/product-assets.ts` manifest. Keep editable large sources in the
agreed asset store or Git LFS; ordinary Git contains only suitable runtime files.

Export compressed models with correct scale, stable origin/pivot, modest texture
sizes, and verified transparency. Start with 1024 textures, 2 MiB compressed GLB,
1 MiB environment map, and a delivered mobile packshot at most 250 KiB. Measure
bytes and visual quality, including the label on mobile, rather than declaring
compression successful from a file extension.

If a connected image-generation tool is available, use it for concepts or suitable
image assets with supplied packaging references. Check geometry, label accuracy,
rights, and claims before approval. Generated raster art is not a GLB; use Blender
or an asset specialist for the interactive model.

Validate crop, color, label, asset loading, poster/scene match, performance budgets,
and product-to-file mapping. If inputs are absent, deliver a clear asset request
and an immediately usable marked preview, without inventing approval.

Return the manifest, optimized files, remaining source inputs, and measured sizes.
