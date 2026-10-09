'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const report = (kind, message) => process.stdout.write(`${kind} ${message}\n`);
const command = (program, args) => spawnSync(program, args, { cwd: root, encoding: 'utf8', timeout: 3000 });

report('INFO', 'Crater setup diagnostics are read-only; no installs or Git changes.');
const major = Number(process.versions.node.split('.')[0]);
report(major >= 22 ? 'OK' : 'FAIL', 'Node ' + process.version + ' (toolkit requires Node 22+).');
if (major < 22) process.exitCode = 1;

const claude = command('claude', ['--version']);
report(claude.status === 0 ? 'OK' : 'WARN', claude.status === 0
  ? 'Claude Code CLI found: ' + claude.stdout.trim()
  : 'Claude Code CLI is not on PATH here. Use a current install with exec-form hook arguments.');

const checkout = command('git', ['rev-parse', '--is-inside-work-tree']);
if (checkout.status === 0) {
  const hookPath = command('git', ['config', '--get', 'core.hooksPath']);
  report(hookPath.status === 0 ? 'INFO' : 'OK', hookPath.status === 0
    ? 'An existing core.hooksPath is configured: ' + hookPath.stdout.trim() + '. This toolkit did not set or change it.'
    : 'No core.hooksPath override is configured.');
  const activePath = command('git', ['rev-parse', '--git-path', 'hooks']);
  if (activePath.status === 0) {
    const directory = path.resolve(root, activePath.stdout.trim());
    const hooks = fs.existsSync(directory)
      ? fs.readdirSync(directory).filter((name) => !name.endsWith('.sample') && fs.statSync(path.join(directory, name)).isFile())
      : [];
    report('INFO', hooks.length ? 'Existing Git hook files: ' + hooks.join(', ') + '. Inspect those separately if Git is failing.' : 'No active Git hook files found.');
  }
} else {
  report('WARN', 'This directory is not a Git checkout; inspect Git settings in your cloned repository.');
}

report('INFO', fs.existsSync(path.join(root, 'apps/storefront/package.json'))
  ? 'Storefront manifest found; run its relevant app checks separately.'
  : 'Storefront has not been scaffolded. Toolkit checks do not build a website.');
report('INFO', fs.existsSync(path.join(root, '.mcp.json'))
  ? 'A local MCP configuration exists; check connection state with /mcp in Claude Code.'
  : 'Optional browser MCP is not enabled. See .mcp.json.example.');
report('INFO', 'To disable project advisory hooks, set disableAllHooks: true in ignored .claude/settings.local.json.');
