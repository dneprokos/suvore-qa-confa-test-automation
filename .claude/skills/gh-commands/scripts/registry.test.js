'use strict';

/**
 * Tests for the gh-commands registry.
 *
 * Run: node --test .claude/skills/gh-commands/scripts/registry.test.js
 *
 * What is actually under test is the registration gate. Everything else in this skill is a query
 * that a wrong answer makes obvious; the gate is the one part whose failure is silent — a script
 * that writes, or one that only answers the question it was born from, gets into the registry and
 * is then trusted by every later run.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lib = require('./lib');
const registry = require('./registry');

const SKILL_DIR = lib.SKILL_DIR;

function tmpFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-commands-test-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

/** A valid entry pointing at a real, registered script. */
function baseEntry(overrides = {}) {
  return {
    id: 'sample-command',
    intent: 'List something harmless from GitHub for testing',
    aliases: ['sample alias phrasing'],
    tags: ['test'],
    script: 'scripts/learned/repos-by-name-pattern.js',
    params: [{ name: '--pattern', required: true, description: 'a regex' }],
    example: '--pattern something',
    gh_calls: ['gh repo list'],
    output: 'table',
    read_only: true,
    created: '2026-01-01',
    last_verified: '2026-01-01',
    ...overrides,
  };
}

/* ------------------------------------------------------------ entry shape */

test('validateEntry accepts a well-formed entry', () => {
  assert.deepStrictEqual(lib.validateEntry(baseEntry()), []);
});

test('validateEntry names every field that is wrong', () => {
  const problems = lib.validateEntry(baseEntry({ id: 'Not Kebab', output: 'csv', read_only: false }));
  assert.ok(problems.some((p) => p.startsWith('id:')));
  assert.ok(problems.some((p) => p.startsWith('output:')));
  assert.ok(problems.some((p) => p.startsWith('read_only:')));
});

test('validateEntry rejects a script outside scripts/learned/', () => {
  const problems = lib.validateEntry(baseEntry({ script: 'scripts/lib.js' }));
  assert.ok(problems.some((p) => p.startsWith('script:')));
});

/* ----------------------------------------------------------- write safety */

test('scanForWrites catches gh write subcommands', () => {
  const source = ['const a = 1;', "gh(['pr', 'merge', '12']);", "run('gh repo delete foo');"].join('\n');
  const hits = lib.scanForWrites(source);
  assert.strictEqual(hits.length, 2);
  assert.ok(hits.every((h) => h.label.includes('write')));
});

test('scanForWrites catches a mutating gh api call in either flag form', () => {
  assert.strictEqual(lib.scanForWrites("gh api repos/x/y -X POST").length, 1);
  assert.strictEqual(lib.scanForWrites("gh api repos/x/y --method DELETE").length, 1);
});

test('scanForWrites ignores a forbidden verb inside a comment', () => {
  assert.deepStrictEqual(lib.scanForWrites('// never call gh pr merge from here'), []);
});

test('scanForWrites passes a read-only script', () => {
  assert.deepStrictEqual(lib.scanForWrites("gh(['repo', 'list', owner, '--json', 'name']);"), []);
});

/* --------------------------------------------------------- gh call runner */

test('isAllowedGhCall allows reads and refuses writes', () => {
  const cfg = lib.loadConfig();
  assert.strictEqual(lib.isAllowedGhCall(['repo', 'list', 'someone'], cfg).ok, true);
  assert.strictEqual(lib.isAllowedGhCall(['search', 'code', 'foo'], cfg).ok, true);
  assert.strictEqual(lib.isAllowedGhCall(['repo', 'delete', 'someone/thing'], cfg).ok, false);
  assert.strictEqual(lib.isAllowedGhCall(['pr', 'merge', '3'], cfg).ok, false);
});

test('isAllowedGhCall refuses gh api with a mutating method even though gh api is allowed', () => {
  const cfg = lib.loadConfig();
  assert.strictEqual(lib.isAllowedGhCall(['api', 'repos/a/b'], cfg).ok, true);
  assert.strictEqual(lib.isAllowedGhCall(['api', 'repos/a/b', '-X', 'POST'], cfg).ok, false);
  assert.strictEqual(lib.isAllowedGhCall(['api', 'repos/a/b', '--method', 'DELETE'], cfg).ok, false);
});

test('gh() refuses a write without spawning anything', () => {
  const res = lib.gh(['repo', 'delete', 'someone/thing']);
  assert.strictEqual(res.refused, true);
  assert.strictEqual(res.status, 2);
});

/* ------------------------------------------------------- registration gate */

test('checkCandidate accepts a valid candidate against an empty registry', () => {
  assert.deepStrictEqual(registry.checkCandidate(baseEntry(), { commands: [] }), []);
});

test('checkCandidate refuses a missing script', () => {
  const problems = registry.checkCandidate(baseEntry({ script: 'scripts/learned/does-not-exist.js' }), { commands: [] });
  assert.ok(problems.some((p) => p.includes('missing script')));
});

test('checkCandidate refuses a script that writes to GitHub', () => {
  const file = path.join(SKILL_DIR, 'scripts', 'learned', '__gate-test-writer.js');
  fs.writeFileSync(file, "'use strict';\nconst x = \"gh pr merge 12\";\nmodule.exports = x;\n");
  try {
    const problems = registry.checkCandidate(baseEntry({ script: 'scripts/learned/__gate-test-writer.js' }), { commands: [] });
    assert.ok(problems.some((p) => p.includes('write operation')));
  } finally {
    fs.unlinkSync(file);
  }
});

test('checkCandidate refuses a script with the example value hard-coded', () => {
  const file = path.join(SKILL_DIR, 'scripts', 'learned', '__gate-test-hardcoded.js');
  fs.writeFileSync(file, "'use strict';\nconst pattern = 'something';\nmodule.exports = pattern;\n");
  try {
    const problems = registry.checkCandidate(baseEntry({ script: 'scripts/learned/__gate-test-hardcoded.js' }), { commands: [] });
    assert.ok(problems.some((p) => p.includes('hard-coded parameter')));
  } finally {
    fs.unlinkSync(file);
  }
});

test('checkCandidate refuses a duplicate id', () => {
  const model = { commands: [baseEntry()] };
  const problems = registry.checkCandidate(baseEntry({ intent: 'A different sentence entirely about branches' }), model);
  assert.ok(problems.some((p) => p.includes('duplicate id')));
});

test('checkCandidate refuses a second command covering an intent already registered', () => {
  const model = { commands: [baseEntry({ id: 'first-command' })] };
  const twin = baseEntry({ id: 'second-command', intent: 'List something harmless from GitHub for testing', aliases: ['sample alias phrasing'] });
  const problems = registry.checkCandidate(twin, model);
  assert.ok(problems.some((p) => p.includes('duplicate intent')));
});

/* ------------------------------------------------------------- matching */

test('rankEntries puts the intended command first for a natural phrasing', () => {
  const model = lib.readRegistry();
  const ranked = lib.rankEntries('give me repos containing playwright in the name', model.commands);
  assert.strictEqual(ranked[0].entry.id, 'repos-by-name-pattern');
  assert.ok(ranked[0].score >= lib.loadConfig().match.reuseThreshold);
});

test('rankEntries scores an unrelated request below the confirm threshold', () => {
  const model = lib.readRegistry();
  const ranked = lib.rankEntries('rename the default branch of every repository', model.commands);
  assert.ok(ranked[0].score < lib.loadConfig().match.confirmThreshold);
});

/* ------------------------------------------------------------ persistence */

test('writeRegistry is idempotent by value and sorts by id', () => {
  const file = tmpFile('registry.json', '');
  const model = { version: 1, commands: [baseEntry({ id: 'zulu' }), baseEntry({ id: 'alpha' })] };
  assert.strictEqual(lib.writeRegistry(model, file), 'written');
  assert.strictEqual(lib.writeRegistry(model, file), 'unchanged');
  assert.deepStrictEqual(lib.readRegistry(file).commands.map((c) => c.id), ['alpha', 'zulu']);
});

test('add writes an entry into a registry file and refuses the same id twice', () => {
  const file = tmpFile('registry.json', '');
  const entryFile = tmpFile('entry.json', JSON.stringify(baseEntry()));
  const argv = ['add', '--from-file', entryFile, '--registry', file, '--date', '2026-01-01'];
  assert.strictEqual(registry.main(argv), 0);
  assert.strictEqual(lib.readRegistry(file).commands.length, 1);
  assert.strictEqual(registry.main(argv), 1);
});

test('the committed registry is clean — every script present and read-only', () => {
  assert.strictEqual(registry.main(['doctor', '--json']), 0);
});
