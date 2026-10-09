---
name: crater-quality-review
description: "Use when checking a Crater milestone, reviewing a storefront diff, investigating a broken experience, or assessing preview readiness with limited verification time."
---

# Focused storefront quality review

Read the current milestone and changed files. Match verification to the change.
For configuration/docs, check syntax and references. For commerce, exercise valid
and rejected mutations and recovery. For motion, inspect the affected viewport,
reduced-motion path, remount cleanup, and static fallback. Report unavailable
browser or device checks as unrun.

## Review order

1. Purchase correctness: variant, quantity, authoritative price, cart privacy,
   failure recovery, and a valid fresh checkout destination.
2. Access: keyboard/focus, readable errors, no-WebGL, reduced motion, mobile normal
   flow, and product information outside canvas.
3. Stability: slow/missing assets, stale stock, expired cart, overlapping user
   intent, navigation back/forward, and listeners/resources after remount.
4. Visual quality: product label, light, crop, type, action placement, and quiet
   surroundings; compare screenshots at 390px, 768px, and 1440px where affected.
5. Performance: record measured budgets from `docs/architecture.md`; do not equate
   a fast local computer or a lint pass with acceptable real-device behavior.

Run relevant checks once after the final change; repeat only for new changes,
failures, or unresolved concerns. Avoid full-suite or browser runs on every small
edit. Never install mandatory pre-commit/pre-push hooks to enforce this skill.

Return a concise verdict, blockers with file references, observed check commands
and results, unrun checks, and the smallest next fix. Reviewers report findings
without editing implementation. Use a scoped implementer to fix confirmed issues.

For a preview, explicitly identify fixture data and missing store/asset/business
inputs. Toolkit validation cannot establish that a website exists or is ready
for production sales.
