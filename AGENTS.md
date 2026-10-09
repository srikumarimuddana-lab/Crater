# Crater agent instructions

Read `CLAUDE.md` for shared project contracts and commands. Read the relevant
design, architecture, asset, and implementation documents before changing the app.

Claude-specific skills live in `.claude/skills/`; other assistants may read those
`SKILL.md` files as task guidance. Claude-specific agents live in `.claude/agents/`.
They are definitions for future development, not permission to run all roles for
every change.

Keep work within the user's requested milestone. Use one implementer for small
tasks; use independent specialists only when delegation serves the task. Give
each worker owned paths and a clear contract. The coordinator owns shared
manifests, dependencies, integration, and publishing.

Run only relevant verification and report the commands and results. Do not claim
the storefront exists or is launch-ready from toolkit checks alone. Preserve
image, reduced-motion, mobile, and purchase-path fallbacks while adding effects.
Never create blocking Git hooks or silently change `core.hooksPath`.
