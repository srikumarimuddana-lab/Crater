# Product asset workflow

## Inputs needed before final production assets

Collect real product names, packaging dimensions, front/back/side photographs,
approved label artwork, material references, product sizes, ingredient records,
and claims evidence. Record the brand's rights to photographs, fonts, models,
environment maps, and music before using them in a commercial release.

## Deliverables per product

| Asset | Convention | Acceptance |
| --- | --- | --- |
| Main packshot | `public/products/<handle>/packshot.webp` | Correct label and shape; responsive derivatives |
| Editorial crop | `public/products/<handle>/editorial.webp` | Useful desktop and mobile composition |
| Interactive model | `public/products/<handle>/product.glb` | Correct scale/pivot, label placement, compressed export |
| Scene poster | `public/products/<handle>/scene-poster.webp` | Matches the default scene pose and lighting |
| Manifest record | `src/lib/content/product-assets.ts` | Paths, dimensions, provenance, license, product reference |

Keep editable Blender/texture sources in a designated asset store or Git LFS
after the team chooses it. Avoid placing large uncompressed binaries in ordinary
Git commits. Runtime files must follow the budgets in `architecture.md`.

## Workflow

1. Produce an immediately usable packshot and record its provenance.
2. Build one procedural bottle only as a marked preview if measured packaging
   geometry is unavailable. A procedural approximation is not an approved model.
3. Create the real model from dimensions and references; share materials and
   studio lights, but preserve each product's actual shape and label.
4. Bake or simplify expensive glass/liquid effects, limit large textures, and
   export compressed GLB. Validate visual differences on the actual target device.
5. Render a matching poster. Optimize responsive photographs independently of
   the model; use a clear product photograph as the initial image.
6. Check label readability, pivot behavior, transparency, mobile cropping, color,
   fallback loading, and asset size before integration.

## Optional generated concept imagery

Use a connected image-generation tool only when available and suitable for concept
art. A useful prompt is: "Studio concept for a skincare bottle on a limestone
plinth, cool porcelain and mineral-green palette, directional softbox light,
realistic material detail, negative space for product copy; use the provided
packaging reference and preserve its geometry." Treat output as a concept until
the real label, product proportions, rights, and claims have been checked.

Image generation does not produce a production-ready GLB or verify a cosmetic
claim. Use Blender or an asset specialist for an accurate model; use typography
and supplied artwork for readable labels.
