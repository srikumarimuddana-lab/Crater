'use strict';

// Advisory Claude lifecycle hooks. No subprocesses, network, writes, or decisions.
const fs = require('node:fs');
const path = require('node:path');

function context(event, message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: event, additionalContext: message },
  }) + '\n');
}

function projectRoot(cwd) {
  if (typeof cwd === 'string' && path.isAbsolute(cwd)) {
    let directory = path.resolve(cwd);
    for (let depth = 0; depth < 16; depth++) {
      if (fs.existsSync(path.join(directory, 'CLAUDE.md')) &&
          fs.existsSync(path.join(directory, '.claude/settings.json'))) {
        return fs.realpathSync(directory);
      }
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  const fallback = process.env.CLAUDE_PROJECT_DIR;
  return fallback ? fs.realpathSync(fallback) : null;
}

function editedFile(input, root) {
  if (!['Write', 'Edit'].includes(input.tool_name)) return null;
  const supplied = input.tool_input?.file_path;
  if (typeof supplied !== 'string' || !path.isAbsolute(supplied) || !root) return null;
  const target = fs.realpathSync(supplied);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return null;
  if (!fs.statSync(target).isFile()) return null;
  return { target, relative: relative.split(path.sep).join('/') };
}

function handle(input, mode) {
  const event = input.hook_event_name;
  if (mode === 'session' && event === 'SessionStart') {
    context(event, 'Crater: read CLAUDE.md and the relevant docs before work. Use /crater-kickoff for a milestone. Preserve the product image and purchase path while 3D loads. Run checks appropriate to the change and report actual results. These hooks only advise; they do not run builds or block Git.');
    return;
  }
  if (mode === 'agent' && event === 'SubagentStart' &&
      typeof input.agent_type === 'string' && input.agent_type.startsWith('crater-')) {
    context(event, 'Crater handoff: work within your assigned owned files and interfaces. Read the relevant docs and preloaded skills. Return changed files, evidence, unresolved issues, and the next dependency. Keep edits reversible and use preview data until live commerce work is explicitly requested.');
    return;
  }
  if (mode !== 'edit' || event !== 'PostToolUse') return;
  const file = editedFile(input, projectRoot(input.cwd));
  if (!file) return;

  if (['package.json', '.claude/settings.json', '.mcp.json'].includes(file.relative)) {
    if (fs.statSync(file.target).size > 256 * 1024) return;
    try { JSON.parse(fs.readFileSync(file.target, 'utf8')); }
    catch { context(event, 'Crater: the edited configuration contains invalid JSON. Repair its syntax before running the next setup command. This is an advisory only.'); }
    return;
  }
  if (/(^|\/)\.env(?:\.|$)/.test(file.relative)) {
    context(event, 'Crater: keep real credentials in ignored local environment files. Keep Stripe secret keys, webhook secrets, and DATABASE_URL server-side; do not place them in NEXT_PUBLIC variables.');
    return;
  }
  if (file.relative.startsWith('apps/storefront/src/components/experience/')) {
    context(event, 'Crater experience check: preserve the poster, reduced motion, mobile document flow, and no-WebGL fallback. Clean up timelines, observers, and GPU resources on unmount. Verify the changed interaction at the affected viewport.');
  } else if (file.relative.startsWith('apps/storefront/src/lib/commerce/') ||
             file.relative.startsWith('apps/storefront/src/app/api/cart/')) {
    context(event, 'Crater commerce check: use server-side variant validation and server-calculated totals, return Storefront-style userErrors/warnings, and keep purchase state private and uncached. Report the relevant error-path check.');
  }
}

// Bound stdin even if a future Claude event includes a very large tool response.
let bytes = 0;
let oversized = false;
const chunks = [];
process.stdin.on('data', (chunk) => {
  bytes += chunk.length;
  if (bytes > 1024 * 1024) { oversized = true; chunks.length = 0; return; }
  if (!oversized) chunks.push(chunk);
});
process.stdin.on('error', () => { oversized = true; });
process.stdin.on('end', () => {
  if (oversized) return;
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!input || typeof input !== 'object' || Array.isArray(input)) return;
    handle(input, process.argv[2]);
  } catch {
    // Fail open. Never echo event payloads, file contents, or secret-bearing errors.
  }
});
