'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const problems = [];
const requireFile = (relative) => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) { problems.push('Missing: ' + relative); return null; }
  return file;
};
function readJson(relative) {
  const file = requireFile(relative);
  if (!file) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { problems.push('Invalid JSON: ' + relative); return null; }
}
function markdown(relative) {
  const file = requireFile(relative);
  return file ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
}
function frontmatter(relative) {
  const text = markdown(relative);
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]+)$/);
  if (!match) { problems.push('Missing frontmatter/body: ' + relative); return ''; }
  return match[1];
}
function listField(front, key) {
  const lines = front.split('\n');
  const start = lines.findIndex((line) => line === key + ':');
  if (start < 0) return [];
  const values = [];
  for (const line of lines.slice(start + 1)) {
    const item = line.match(/^\s+-\s+([a-z0-9-]+)\s*$/);
    if (!item) break;
    values.push(item[1]);
  }
  return values;
}
function namedList(manifest, key) {
  const values = manifest?.[key];
  if (!Array.isArray(values) || values.some((x) => typeof x !== 'string')) {
    problems.push('Invalid toolkit list: ' + key); return [];
  }
  if (new Set(values).size !== values.length) problems.push('Duplicate toolkit entry: ' + key);
  return values;
}

const toolkit = readJson('.claude/toolkit.json');
const settings = readJson('.claude/settings.json');
const pkg = readJson('package.json');
const mcp = readJson('.mcp.json.example');
if (toolkit?.schemaVersion !== 1) problems.push('Unsupported toolkit schemaVersion');
const skills = namedList(toolkit, 'skills');
const agents = namedList(toolkit, 'agents');
const rules = namedList(toolkit, 'rules');
const docs = namedList(toolkit, 'documents');
const events = namedList(toolkit, 'hookEvents');

for (const name of skills) {
  const relative = `.claude/skills/${name}/SKILL.md`;
  const front = frontmatter(relative);
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(name) || !front.includes('name: ' + name + '\n')) {
    problems.push('Skill name/folder mismatch: ' + relative);
  }
  const description = front.match(/^description:\s*(.+)$/m)?.[1];
  if (!description || !description.includes('Use when') || description.length > 1024) {
    problems.push('Invalid skill description: ' + relative);
  }
}

for (const name of agents) {
  const relative = `.claude/agents/${name}.md`;
  const front = frontmatter(relative);
  if (!front.includes('name: ' + name + '\n') || !/^description:\s*\S.+$/m.test(front)) {
    problems.push('Agent name/description mismatch: ' + relative);
  }
  for (const skill of listField(front, 'skills')) {
    if (!skills.includes(skill)) problems.push('Unknown agent skill: ' + name + ' -> ' + skill);
  }
  if (!/^model:\s*(inherit|sonnet|opus|haiku)$/m.test(front)) {
    problems.push('Invalid model alias: ' + relative);
  }
  if (name === 'crater-release-reviewer') {
    const tools = front.match(/^tools:\s*(.+)$/m)?.[1].split(',').map((x) => x.trim()) ?? [];
    if (!tools.length || tools.some((x) => !['Read', 'Glob', 'Grep'].includes(x))) {
      problems.push('Release reviewer must use only read/search tools');
    }
  }
}

for (const name of rules) {
  if (!/^paths:\n\s+- /m.test(frontmatter(`.claude/rules/${name}.md`))) {
    problems.push('Rule needs scoped paths: ' + name);
  }
}
for (const doc of docs) requireFile(doc);
for (const file of ['CLAUDE.md', 'AGENTS.md', 'README.md', 'docs/examples/storefront.env.example']) requireFile(file);

for (const event of events) {
  const entries = settings?.hooks?.[event];
  if (!Array.isArray(entries) || !entries.length) { problems.push('Missing hook event: ' + event); continue; }
  for (const entry of entries) {
    if (!Array.isArray(entry.hooks) || !entry.hooks.length) problems.push('Empty hook list: ' + event);
    for (const hook of entry.hooks ?? []) {
      if (hook.type !== 'command' || hook.command !== 'node' || hook.timeout !== 5 ||
          !Array.isArray(hook.args) || hook.args.length !== 2 ||
          hook.args[0] !== '${CLAUDE_PROJECT_DIR}/.claude/hooks/project-hook.cjs' ||
          hook.args[1] !== { SessionStart: 'session', PostToolUse: 'edit', SubagentStart: 'agent' }[event]) {
        problems.push('Unexpected hook command contract: ' + event);
      }
    }
  }
}
for (const event of Object.keys(settings?.hooks ?? {})) {
  if (!events.includes(event)) problems.push('Unreviewed hook event: ' + event);
}
if (settings?.permissions?.defaultMode === 'bypassPermissions') problems.push('Do not bypass permissions in project settings');
for (const name of ['prepare', 'precommit', 'prepush', 'pre-commit', 'pre-push']) {
  if (pkg?.scripts?.[name]) problems.push('Git-blocking lifecycle script: ' + name);
}
if (pkg?.dependencies || pkg?.devDependencies) problems.push('Root toolkit must remain dependency-free; app dependencies belong in apps/storefront');
for (const folder of ['.husky', '.githooks']) {
  if (fs.existsSync(path.join(root, folder))) problems.push('Unexpected Git-hook directory: ' + folder);
}
if (mcp?.mcpServers?.playwright?.args?.some((x) => x.includes('@latest'))) problems.push('Pin the optional Playwright MCP version');

for (const relative of [
  '.claude/hooks/project-hook.cjs', 'scripts/check-setup.cjs',
  'scripts/doctor.cjs', 'scripts/tests/hooks.test.cjs',
]) {
  const file = requireFile(relative);
  if (!file) continue;
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 3000 });
  if (result.status !== 0 || result.error) problems.push('Invalid Node script syntax: ' + relative);
}

for (const relative of ['README.md', ...docs]) {
  const text = markdown(relative);
  for (const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    if (!fs.existsSync(path.resolve(root, path.dirname(relative), target))) {
      problems.push('Broken local link in ' + relative + ': ' + target);
    }
  }
}

if (problems.length) {
  for (const problem of problems) process.stderr.write('FAIL ' + problem + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`Setup valid: ${skills.length} skills, ${agents.length} agents, ${rules.length} scoped rules, ${events.length} advisory hook events.\n`);
  process.stdout.write('Checked metadata, preloaded skill references, hook contracts, Node syntax, and local documentation links.\n');
}
