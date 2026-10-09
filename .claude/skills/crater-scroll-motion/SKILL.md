---
name: crater-scroll-motion
description: "Use when adding or reviewing GSAP scroll timelines, pinned stories, scene progress, responsive motion, or scroll cleanup in the Crater storefront."
---

# Cinematic scroll story

Read the motion table in `docs/design-brief.md` and the scene contract in
`docs/architecture.md`. Preserve native scrolling and useful content first.

Use one GSAP/ScrollTrigger timeline for the three-chapter formula story. Scope it
with `useGSAP`, clean up on unmount, and use `gsap.matchMedia` for responsive and
reduced-motion conditions. Limit the desktop pin to 2.5 viewport heights. Mobile
and reduced-motion layouts use normal document flow with all copy visible.

Map normalized progress 0–1 to authored bottle/camera poses; retain stable refs
instead of issuing React state updates every frame. Trigger R3F invalidation when
GSAP mutates scene objects under demand rendering. Assign each animated property
one owner. Keep normal interface motion in CSS unless it requires a timeline.

Reserve image and section dimensions. Refresh measured trigger geometry after
relevant fonts/assets settle, without an endless refresh loop. Handle viewport
resize, orientation, route navigation, browser back/forward, and a motion-preference
change. Remove observers, event listeners, and duplicated triggers on remount.

## Verification

Inspect forward/reverse scrolling, initial deep links, mobile chapter reading,
keyboard access, reduced motion, and returning via history. Profile active motion
on a representative device. Reduce quality or select a static poster on misses.

Do not introduce Lenis by default. If a measured requirement warrants it, integrate
one shared ticker/scroll source, document cleanup and policy branches, and repeat
history/mobile checks. Keep shopping controls outside any pinned or pointer-driven
surface that would interfere with them.

Return timeline ownership, breakpoint behavior, cleanup evidence, and observations.
