'use strict';

/**
 * env-file-inventory.js — which of an owner's repositories track a .env file, and which only
 * ship an example.
 *
 * The question this answers is not "does the repo use environment variables" but "is a real .env
 * committed" — a tracked `.env` is the file the whole convention exists to keep out of git, and an
 * `.env.example` beside a gitignore rule is the same convention working correctly. Both are
 * reported, because telling them apart is the entire point.
 *
 * Answered from shallow clones rather than the code search API: search only indexes the default
 * branch, misses dotfiles inconsistently, and is rate limited at a rate a full sweep cannot afford.
 *
 * Usage:
 *   node .claude/skills/gh-commands/scripts/learned/env-file-inventory.js [options]
 *
 *   --owner <login>   defaults to config.json defaultOwner
 *   --cache <dir>     clone cache directory (default: a gh-commands-cache folder under the temp dir)
 *   --include-forks   forks are excluded unless this is passed
 *   --json            machine-readable output
 *
 * Exit codes: 0 tracked env files found · 3 none found · 1 the gh call or the clones failed
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadConfig, ensureClones, renderTable, parseArgs } = require(path.join(__dirname, '..', 'lib'));

/** Tracked paths that look like an environment file, split into the two cases that matter. */
const REAL_ENV = /(^|\/)\.env($|\.(?!example|sample|template|dist)[a-z0-9.-]+$)/i;
const EXAMPLE_ENV = /(^|\/)(\.env\.(example|sample|template|dist)|env\.example|env\.sample|\.env\.example)$/i;

function trackedFiles(dir) {
  const res = spawnSync('git', ['-C', dir, 'ls-files'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (res.status !== 0) return [];
  return (res.stdout || '').split(/\r?\n/).filter(Boolean);
}

function gitignoresEnv(dir) {
  const file = path.join(dir, '.gitignore');
  if (!fs.existsSync(file)) return false;
  return /^\s*\*?\.?env/im.test(fs.readFileSync(file, 'utf8'));
}

function main(argv) {
  const args = parseArgs(argv);
  const cfg = loadConfig();
  const owner = args.owner && args.owner !== true ? args.owner : cfg.defaultOwner;

  let clones;
  try {
    clones = ensureClones(owner, {
      dest: args.cache && args.cache !== true ? path.resolve(args.cache) : undefined,
      includeForks: Boolean(args['include-forks']),
    });
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 1;
  }

  const rows = [];
  for (const repo of clones.cloned) {
    const tracked = trackedFiles(repo.dir);
    const real = tracked.filter((f) => REAL_ENV.test(f) || /(^|\/)\.env$/i.test(f));
    const examples = tracked.filter((f) => EXAMPLE_ENV.test(f));
    const ignored = gitignoresEnv(repo.dir);
    if (!real.length && !examples.length && !ignored) continue;
    rows.push({
      repo: repo.name,
      tracked_env: real,
      example_env: examples,
      gitignored: ignored,
      verdict: real.length ? 'TRACKED .env' : examples.length ? 'example only' : 'gitignored only',
    });
  }

  rows.sort((a, b) => (b.tracked_env.length - a.tracked_env.length) || a.repo.localeCompare(b.repo));
  const withTracked = rows.filter((r) => r.tracked_env.length);

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ owner, scanned: clones.cloned.length, failed: clones.failed, tracked_count: withTracked.length, rows }, null, 2)}\n`);
    return withTracked.length ? 0 : 3;
  }

  if (!rows.length) {
    process.stdout.write(`No repository of ${owner} tracks an environment file (${clones.cloned.length} scanned).\n`);
    return 3;
  }

  process.stdout.write(`${renderTable(
    ['REPO', 'VERDICT', 'TRACKED .env', 'EXAMPLE', '.gitignore'],
    rows.map((r) => [r.repo, r.verdict, r.tracked_env.join(', ') || '—', r.example_env.join(', ') || '—', r.gitignored ? 'yes' : 'no']),
  )}\n`);
  process.stdout.write(`\n${withTracked.length} repositor${withTracked.length === 1 ? 'y tracks' : 'ies track'} a real .env of ${clones.cloned.length} scanned.`);
  process.stdout.write(' A tracked .env is worth reading before it is worth panicking about — most hold test data.\n');
  if (clones.failed.length) process.stdout.write(`${clones.failed.length} repositor(y/ies) could not be cloned: ${clones.failed.map((f) => f.name).join(', ')}\n`);
  return withTracked.length ? 0 : 3;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main, REAL_ENV, EXAMPLE_ENV };
