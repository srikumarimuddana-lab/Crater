'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const hook = path.resolve(__dirname, '../../.claude/hooks/project-hook.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crater hook space-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Test project');
  fs.writeFileSync(path.join(root, '.claude/settings.json'), '{}');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(mode, input, root) {
  const result = spawnSync(process.execPath, [hook, mode], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CRATER_TEST_SECRET: 'never-echo-this-secret' },
    timeout: 2000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.ok(!result.stdout.includes('never-echo-this-secret'));
  const output = result.stdout.trim() ? JSON.parse(result.stdout) : null;
  assert.equal(output?.decision, undefined);
  assert.equal(output?.continue, undefined);
  return output;
}

test('SessionStart gives project context without reading secrets or transcripts', (t) => {
  const root = fixture(t);
  const output = run('session', { hook_event_name: 'SessionStart', cwd: root, transcript_path: '/does/not/exist' }, root);
  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(output.hookSpecificOutput.additionalContext, /CLAUDE\.md/);
  assert.match(output.hookSpecificOutput.additionalContext, /image/);
});

test('SubagentStart passes the bounded handoff contract to Crater agents', (t) => {
  const root = fixture(t);
  const output = run('agent', { hook_event_name: 'SubagentStart', cwd: root, agent_type: 'crater-commerce-engineer' }, root);
  assert.equal(output.hookSpecificOutput.hookEventName, 'SubagentStart');
  assert.match(output.hookSpecificOutput.additionalContext, /owned files/);
});

test('unrelated agents receive no injected context', (t) => {
  const root = fixture(t);
  assert.equal(run('agent', { hook_event_name: 'SubagentStart', cwd: root, agent_type: 'Explore' }, root), null);
});

test('malformed, null, array, and oversized input all fail open', (t) => {
  const root = fixture(t);
  for (const input of ['{broken', 'null', '[]', 'x'.repeat(1024 * 1024 + 1)]) {
    assert.equal(run('session', input, root), null);
  }
});

test('mismatched events and unknown modes are ignored', (t) => {
  const root = fixture(t);
  assert.equal(run('session', { hook_event_name: 'PostToolUse', cwd: root }, root), null);
  assert.equal(run('unknown', { hook_event_name: 'SessionStart', cwd: root }, root), null);
});

test('a normal edit is quiet and the file remains unchanged', (t) => {
  const root = fixture(t);
  const target = path.join(root, 'notes.md');
  fs.writeFileSync(target, '# Notes');
  assert.equal(run('edit', { hook_event_name: 'PostToolUse', cwd: root, tool_name: 'Write', tool_input: { file_path: target } }, root), null);
  assert.equal(fs.readFileSync(target, 'utf8'), '# Notes');
});

test('invalid configuration JSON gets an advisory without a blocking decision', (t) => {
  const root = fixture(t);
  const target = path.join(root, 'package.json');
  fs.writeFileSync(target, '{broken');
  const output = run('edit', { hook_event_name: 'PostToolUse', cwd: root, tool_name: 'Edit', tool_input: { file_path: target } }, root);
  assert.equal(output.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(output.hookSpecificOutput.additionalContext, /invalid JSON/);
  assert.equal(fs.readFileSync(target, 'utf8'), '{broken');
});

test('valid configuration JSON is quiet', (t) => {
  const root = fixture(t);
  const target = path.join(root, 'package.json');
  fs.writeFileSync(target, '{}');
  assert.equal(run('edit', { hook_event_name: 'PostToolUse', cwd: root, tool_name: 'Edit', tool_input: { file_path: target } }, root), null);
});

test('motion files get fallback and reduced-motion guidance', (t) => {
  const root = fixture(t);
  const target = path.join(root, 'apps/storefront/src/components/experience/BottleScene.tsx');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, 'export default function BottleScene() {}');
  const output = run('edit', { hook_event_name: 'PostToolUse', cwd: root, tool_name: 'Write', tool_input: { file_path: target } }, root);
  assert.match(output.hookSpecificOutput.additionalContext, /reduced motion/);
  assert.match(output.hookSpecificOutput.additionalContext, /poster/);
});

test('private environment contents never appear in hook output', (t) => {
  const root = fixture(t);
  const target = path.join(root, '.env.local');
  fs.writeFileSync(target, 'SHOPIFY_PRIVATE_TOKEN=never-echo-this-secret');
  const output = run('edit', { hook_event_name: 'PostToolUse', cwd: root, tool_name: 'Write', tool_input: { file_path: target } }, root);
  assert.match(output.hookSpecificOutput.additionalContext, /local/);
});

test('outside paths, missing paths, and non-file tools are ignored', (t) => {
  const root = fixture(t);
  for (const target of [path.join(root, '../outside.json'), path.join(root, 'missing.json'), null, 12]) {
    assert.equal(run('edit', { hook_event_name: 'PostToolUse', cwd: root, tool_name: 'Write', tool_input: { file_path: target } }, root), null);
  }
  assert.equal(run('edit', { hook_event_name: 'PostToolUse', cwd: root, tool_name: 'Bash', tool_input: { command: 'git push' } }, root), null);
});

test('linked-worktree cwd takes precedence over the original project directory', (t) => {
  const main = fixture(t);
  const worktree = fixture(t);
  const cwd = path.join(worktree, 'apps/storefront');
  fs.mkdirSync(cwd, { recursive: true });
  const target = path.join(worktree, 'package.json');
  fs.writeFileSync(target, '{broken');
  const output = run('edit', { hook_event_name: 'PostToolUse', cwd, tool_name: 'Write', tool_input: { file_path: target } }, main);
  assert.match(output.hookSpecificOutput.additionalContext, /invalid JSON/);
});

test('symlink paths cannot cause outside project files to be inspected', (t) => {
  const root = fixture(t);
  const outside = fixture(t);
  const target = path.join(outside, 'package.json');
  fs.writeFileSync(target, '{broken');
  const link = path.join(root, 'package.json');
  try {
    fs.symlinkSync(target, link, 'file');
  } catch (error) {
    if (error.code === 'EPERM') return t.skip('symlink creation requires additional Windows permissions');
    throw error;
  }
  assert.equal(run('edit', { hook_event_name: 'PostToolUse', cwd: root, tool_name: 'Write', tool_input: { file_path: link } }, root), null);
});
