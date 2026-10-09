---
name: crater-nextjs-storefront
description: "Use when scaffolding or implementing the Crater Next.js storefront, routes, server/client boundaries, product controls, or shared frontend components."
---

# Next.js progressive storefront

Read `docs/architecture.md` and the current phase. Keep the app in
`apps/storefront`; preserve the root toolkit scripts. Inspect existing code and
its installed versions before edits. At scaffolding, select compatible stable
Next.js/React/R3F releases and commit the exact lockfile.

Render routes, product facts, editorial content, images, and metadata as Server
Components. Add narrow client islands for variants, cart interaction, and motion.
Keep commerce transport and private tokens in server-only modules. Separate public
catalog caching from private, uncached cart/buyer state.

## 3D boundary

Implement a client `product-experience.tsx` wrapper that lazily imports the scene
with `next/dynamic` and `ssr: false`. Keep that option in the client wrapper, not
the Server Component. Render a correctly sized responsive image immediately;
show the scene only after a successful frame, and keep a failure fallback.

Build semantic controls with keyboard focus, descriptive labels, loading/error
states, and a drawer with Escape handling, focus management, and focus restoration.
Use the shared commerce contract rather than embedding GraphQL inside components.
Represent money with decimal strings and the provider currency.

Run app typecheck/lint/build when relevant. Verify affected layouts and purchase
interactions in the browser when available. If scaffolding has not happened,
report that app checks are unavailable instead of treating toolkit validation as
an application build.

Return changed paths, interface decisions, observed checks, and any asset or
commerce dependency. Do not adopt global client rendering to make 3D integration
simpler.
