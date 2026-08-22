'use strict';

/**
 * Shared helpers for the gh-commands skill.
 *
 * The skill learns: a GitHub question that has been answered once becomes a script that answers
 * it again, and the registry is the index of what has already been learned. Two things in here
 * exist to keep that loop honest rather than merely convenient:
 *
 *   1. `gh()` refuses anything that is not a read. A registry of re-runnable scripts is only safe
 *      while every script in it is a query, so the restriction lives in the runner every learned
 *      script must use, not in prose asking the author to behave.
 *   2. `scanForWrites()` reads a candidate script's *source* before it is registered, so a script
 *      that shells out to `gh` some other way is caught at registration instead of at 3 a.m.
 *
 * No npm dependencies: Node stdlib only, same rule as the other scripts in this repository.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

/** Skill root, resolved from .claude/skills/gh-commands/scripts/. */
const SKILL_DIR = path.resolve(__dirname, '..');
/** Repository root, four levels up from the skill directory. */
const REPO_ROOT = path.resolve(SKILL_DIR, '..', '..', '..');

/* ------------------------------------------------------------------ config */

let _config = null;

/** Load config.json once. Every tunable value lives there, not in the scripts. */
function loadConfig() {
  if (_config) return _config;
  _config = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'config.json'), 'utf8'));
  return _config;
}

/** Absolute path to one of the configured paths. */
function skillPath(key) {
  const cfg = loadConfig();
  const rel = cfg.paths[key];
  if (!rel) throw new Error(`unknown config path key: ${key}`);
  return path.join(SKILL_DIR, rel);
}

/* ---------------------------------------------------------------- registry */

const EMPTY_REGISTRY = { version: 1, commands: [] };

function readRegistry(file) {
  const target = file || skillPath('registry');
  if (!fs.existsSync(target)) return { ...EMPTY_REGISTRY, commands: [] };
  const raw = fs.readFileSync(target, 'utf8').trim();
  if (!raw) return { ...EMPTY_REGISTRY, commands: [] };
  const model = JSON.parse(raw);
  if (!Array.isArray(model.commands)) throw new Error(`${target}: "commands" must be an array`);
  return model;
}

/**
 * Write the registry atomically, always re-emitting the whole document from the model.
 * No code path inserts a line into the existing file, so a half-written entry is unreachable.
 */
function writeRegistry(model, file) {
  const target = file || skillPath('registry');
  const sorted = {
    version: model.version || 1,
    commands: [...model.commands].sort((a, b) => a.id.localeCompare(b.id)),
  };
  const text = JSON.stringify(sorted, null, 2) + '\n';
  if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === text) return 'unchanged';
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  const fd = fs.openSync(tmp, 'w');
  fs.writeSync(fd, text);
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(tmp, target);
  return 'written';
}

/** The fields a registry entry must carry, and the check each one has to pass. */
const ENTRY_FIELDS = {
  id: (v) => (typeof v === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) ? null : 'must be a kebab-case slug'),
  intent: (v) => (typeof v === 'string' && v.trim().length >= 10 ? null : 'must be a sentence of at least 10 characters'),
  aliases: (v) => (Array.isArray(v) && v.length >= 1 && v.every((s) => typeof s === 'string' && s.trim()) ? null : 'must be a non-empty array of phrasings'),
  tags: (v) => (Array.isArray(v) && v.every((s) => typeof s === 'string') ? null : 'must be an array of strings'),
  script: (v) => (typeof v === 'string' && v.startsWith('scripts/learned/') && v.endsWith('.js') ? null : 'must be a path under scripts/learned/ ending in .js'),
  params: (v) => (Array.isArray(v) && v.every((p) => p && typeof p.name === 'string' && typeof p.description === 'string') ? null : 'must be an array of { name, description, required? }'),
  example: (v) => (typeof v === 'string' ? null : 'must be the argument string a verification run uses'),
  output: (v) => (['table', 'json', 'text'].includes(v) ? null : 'must be one of table | json | text'),
  read_only: (v) => (v === true ? null : 'must be true — this registry holds queries only'),
  created: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? null : 'must be an ISO date'),
  last_verified: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? null : 'must be an ISO date'),
};

/** Validate one entry's shape. Returns an array of `field: problem` strings. */
function validateEntry(entry) {
  const problems = [];
  for (const [field, check] of Object.entries(ENTRY_FIELDS)) {
    if (!(field in entry)) {
      problems.push(`${field}: missing`);
      continue;
    }
    const problem = check(entry[field]);
    if (problem) problems.push(`${field}: ${problem}`);
  }
  return problems;
}

/* ------------------------------------------------------------ write safety */

/**
 * Patterns that mean a script changes GitHub state. Registration is refused on any hit.
 *
 * Local filesystem writes are deliberately not on this list — the clone-and-grep commands need a
 * scratch directory. What is forbidden is a script that can alter anything on the server side.
 */
const WRITE_PATTERNS = [
  [/\bgh\s+repo\s+(create|delete|edit|rename|archive|fork|sync|deploy-key)\b/i, 'gh repo write subcommand'],
  [/\bgh\s+pr\s+(create|merge|close|reopen|edit|review|comment|ready|lock)\b/i, 'gh pr write subcommand'],
  [/\bgh\s+issue\s+(create|close|reopen|edit|comment|delete|transfer|pin|lock)\b/i, 'gh issue write subcommand'],
  [/\bgh\s+release\s+(create|delete|edit|upload|download)\b/i, 'gh release write subcommand'],
  [/\bgh\s+(secret|variable)\s+(set|delete|remove)\b/i, 'gh secret/variable write subcommand'],
  [/\bgh\s+workflow\s+(run|enable|disable)\b/i, 'gh workflow write subcommand'],
  [/\bgh\s+run\s+(cancel|rerun|delete|watch)\b/i, 'gh run write subcommand'],
  [/\bgh\s+auth\s+(login|logout|refresh|token|setup-git)\b/i, 'gh auth mutation'],
  [/\bgh\s+gist\s+(create|delete|edit)\b/i, 'gh gist write subcommand'],
  [/\bgh\s+ruleset\s+(create|delete)\b/i, 'gh ruleset write subcommand'],
  // The same subcommands written as an argument array — `gh(['pr', 'merge', id])` — which is how a
  // learned script would actually call them, and which the prose forms above cannot see.
  [/["'](repo|pr|issue|release|secret|variable|workflow|run|gist|ruleset|auth)["']\s*,\s*["'](create|delete|edit|merge|close|reopen|set|remove|rename|archive|fork|transfer|pin|lock|comment|review|ready|upload|download|enable|disable|cancel|rerun|login|logout|refresh|token|setup-git)["']/i, 'gh write subcommand in array form'],
  [/-X\s*["']?(POST|PUT|PATCH|DELETE)\b/i, 'gh api with a mutating method'],
  [/--method[\s=]+["']?(POST|PUT|PATCH|DELETE)\b/i, 'gh api with a mutating method'],
  [/\bgit\s+(push|commit|tag\s+-\w*\s*\S*\s*&&)\b/i, 'git push/commit'],
];

/** Scan a candidate script's source for anything that writes to GitHub. */
function scanForWrites(source) {
  const hits = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // a comment naming a forbidden verb is not a call
    for (const [re, label] of WRITE_PATTERNS) {
      if (re.test(line)) hits.push({ line: i + 1, label, text: line.trim().slice(0, 120) });
    }
  });
  return hits;
}

/* -------------------------------------------------------------- gh runner */

/** True when `args` starts with a command pair the config allows. */
function isAllowedGhCall(args, cfg) {
  const positional = args.filter((a) => !a.startsWith('-'));
  const one = positional[0] || '';
  const two = positional.slice(0, 2).join(' ');
  const allowed = cfg.gh.allowedCommands;
  if (allowed.includes(two) || allowed.includes(one)) {
    if (one === 'api') {
      const joined = args.join(' ');
      for (const method of cfg.gh.deniedApiMethods) {
        if (new RegExp(`(-X|--method)[\\s=]+["']?${method}\\b`, 'i').test(joined)) {
          return { ok: false, reason: `gh api with ${method} is a write` };
        }
      }
    }
    return { ok: true };
  }
  return { ok: false, reason: `"gh ${two || one}" is not on the read-only allowlist in config.json` };
}

/**
 * Run `gh` with the arguments given, refusing anything that is not a read.
 *
 * Returns { ok, status, stdout, stderr, rateLimited }. Rate limiting is called out separately
 * because GitHub's code search allows about 10 queries a minute and a sweep hits it routinely;
 * a caller that cannot tell "no results" from "throttled" reports an empty result as an answer.
 */
function gh(args, opts = {}) {
  const cfg = loadConfig();
  const verdict = isAllowedGhCall(args, cfg);
  if (!verdict.ok) {
    return { ok: false, status: 2, stdout: '', stderr: `[gh-commands] refused: ${verdict.reason}`, refused: true };
  }
  const res = spawnSync(cfg.ghBinary, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
    timeout: opts.timeoutMs || 120000,
  });
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  const rateLimited = /rate limit exceeded|API rate limit/i.test(stderr);
  return { ok: res.status === 0, status: res.status === null ? 124 : res.status, stdout, stderr, rateLimited };
}

/** `gh` with `--json`, parsed. Throws with the stderr attached when the call fails. */
function ghJson(args) {
  const res = gh(args);
  if (!res.ok) {
    const hint = res.rateLimited ? ' (rate limited — wait for the reset and retry)' : '';
    throw new Error(`gh ${args.join(' ')} failed with ${res.status}${hint}\n${res.stderr.trim()}`);
  }
  return JSON.parse(res.stdout || '[]');
}

/* --------------------------------------------------------------- matching */

function tokenize(text, cfg) {
  const stop = new Set((cfg || loadConfig()).match.stopWords);
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !stop.has(t));
}

/** Every token an entry can be matched on, split into the two weights. */
function entryTokens(entry, cfg) {
  return {
    strong: new Set([...tokenize(entry.intent, cfg), ...(entry.aliases || []).flatMap((a) => tokenize(a, cfg))]),
    weak: new Set([...tokenize(entry.id.replace(/-/g, ' '), cfg), ...(entry.tags || []).flatMap((t) => tokenize(t, cfg))]),
  };
}

/**
 * Inverse document frequency over the registry.
 *
 * Without it "repository" — a word in every entry and in most requests — scored as heavily as
 * "playwright", and "rename the default branch of every repository" matched the secret sweep at 0.4
 * on the strength of `every` and `repository` alone. A token that every command shares distinguishes
 * nothing, so it is worth almost nothing here, and the weighting tightens on its own as the registry
 * grows rather than needing a hand-maintained list of generic words.
 */
function buildIdf(commands, cfg) {
  const total = commands.length;
  const df = new Map();
  for (const entry of commands) {
    const { strong, weak } = entryTokens(entry, cfg);
    for (const token of new Set([...strong, ...weak])) df.set(token, (df.get(token) || 0) + 1);
  }
  return (token) => Math.log((total + 1) / ((df.get(token) || 0) + 1)) + 0.1;
}

/**
 * Score how well a free-text request matches one registry entry.
 *
 * Weighted recall over the request's own tokens, so a long entry does not win by carrying many
 * words. Tags and the id count half of what the intent and aliases do, because those are the
 * phrasings a human wrote for this command specifically.
 */
function scoreEntry(request, entry, cfg, idf) {
  const config = cfg || loadConfig();
  const weight = idf || (() => 1);
  const wanted = tokenize(request, config);
  if (!wanted.length) return 0;
  const { strong, weak } = entryTokens(entry, config);
  let hit = 0;
  let total = 0;
  for (const token of wanted) {
    const w = weight(token);
    total += w;
    if (strong.has(token)) hit += w;
    else if (weak.has(token)) hit += w * 0.5;
  }
  return total === 0 ? 0 : Math.min(1, hit / total);
}

/** Rank every entry against a request, best first. */
function rankEntries(request, commands, cfg) {
  const config = cfg || loadConfig();
  const idf = buildIdf(commands, config);
  return commands
    .map((entry) => ({ entry, score: Number(scoreEntry(request, entry, config, idf).toFixed(3)) }))
    .sort((a, b) => b.score - a.score);
}

/* ---------------------------------------------------------------- output */

/** Render rows as a fixed-width table. `headers` is an array of column names. */
function renderTable(headers, rows) {
  if (!rows.length) return '(no rows)';
  const all = [headers, ...rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))))];
  const widths = headers.map((_, i) => Math.max(...all.map((r) => (r[i] || '').length)));
  const line = (cells) => cells.map((c, i) => (c || '').padEnd(widths[i])).join('  ').trimEnd();
  return [line(headers), line(widths.map((w) => '-'.repeat(w))), ...all.slice(1).map(line)].join('\n');
}

/** Minimal flag parser: `--key value`, `--key=value`, `--flag`, plus positionals. */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

/** Read all of stdin as a string. */
function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** Today as an ISO date, overridable so tests are not clock-dependent. */
function today(override) {
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(String(override))) return String(override);
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------ clone cache */

/**
 * Shallow-clone every repository of an owner into a cache directory, skipping ones already there.
 *
 * The sweep commands need file contents across every repository, and GitHub's code search API is
 * rate limited at a rate that makes a full sweep impossible — clone-and-grep is both faster and
 * complete, and the cache means the second sweep of the day costs nothing.
 */
function ensureClones(owner, options = {}) {
  const cfg = loadConfig();
  const dest = options.dest || path.join(os.tmpdir(), 'gh-commands-cache', owner);
  fs.mkdirSync(dest, { recursive: true });
  const repos = ghJson(['repo', 'list', owner, '--limit', String(options.limit || 500), '--json', 'name,isFork,visibility,defaultBranchRef']);
  const selected = repos.filter((r) => (options.includeForks ? true : !r.isFork));
  const cloned = [];
  const failed = [];
  // Sequential on purpose: spawnSync blocks, so a "concurrency" loop here would only look parallel.
  // The first sweep of the day pays for the clones; every later one hits the cache and pays nothing.
  selected.forEach((repo, i) => {
    const target = path.join(dest, repo.name);
    if (fs.existsSync(path.join(target, '.git'))) {
      cloned.push({ name: repo.name, dir: target, cached: true });
      return;
    }
    if (options.progress !== false) process.stderr.write(`  cloning ${i + 1}/${selected.length} ${repo.name}\r`);
    const child = spawnSync('git', ['clone', '--depth', String(cfg.clone.depth), '--quiet', `https://github.com/${owner}/${repo.name}.git`, target], {
      encoding: 'utf8',
      timeout: options.timeoutMs || 300000,
    });
    if (child.status === 0) cloned.push({ name: repo.name, dir: target, cached: false });
    else failed.push({ name: repo.name, error: (child.stderr || '').trim().split('\n').slice(-1)[0] });
  });
  if (options.progress !== false) process.stderr.write(`${' '.repeat(60)}\r`);
  return { dest, repos: selected, cloned, failed };
}

/** Walk a directory, yielding file paths, skipping the directories a scan never wants. */
function walkFiles(root, options = {}) {
  const skip = new Set(options.skip || ['.git', 'node_modules', 'dist', 'build', 'coverage', '__pycache__', 'bin', 'obj']);
  const maxBytes = options.maxBytes || 512 * 1024;
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        if (fs.statSync(full).size > maxBytes) continue;
      } catch {
        continue;
      }
      out.push(full);
    }
  }
  return out;
}

module.exports = {
  SKILL_DIR,
  REPO_ROOT,
  loadConfig,
  skillPath,
  readRegistry,
  writeRegistry,
  validateEntry,
  ENTRY_FIELDS,
  scanForWrites,
  WRITE_PATTERNS,
  gh,
  ghJson,
  isAllowedGhCall,
  tokenize,
  scoreEntry,
  buildIdf,
  rankEntries,
  renderTable,
  parseArgs,
  readStdin,
  today,
  ensureClones,
  walkFiles,
};
