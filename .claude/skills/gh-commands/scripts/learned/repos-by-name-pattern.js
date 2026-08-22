'use strict';

/**
 * repos-by-name-pattern.js — list an owner's repositories whose name matches a pattern.
 *
 * `gh repo list` has no name filter, and `gh search repos` matches the description and the README
 * as well as the name, so it answers a different question than the one usually asked. This lists
 * every repository once and filters on the name itself.
 *
 * Usage:
 *   node .claude/skills/gh-commands/scripts/learned/repos-by-name-pattern.js --pattern <regex> [options]
 *
 *   --pattern <regex>   required; case-insensitive, matched against the repository name
 *   --owner <login>     defaults to config.json defaultOwner
 *   --include-forks     forks are excluded unless this is passed
 *   --limit <n>         how many repositories to list before filtering (default 500)
 *   --json              machine-readable output
 *
 * Exit codes: 0 matches found · 3 no match · 2 usage error · 1 the gh call failed
 */

const path = require('path');
const { loadConfig, ghJson, renderTable, parseArgs } = require(path.join(__dirname, '..', 'lib'));

function main(argv) {
  const args = parseArgs(argv);
  const cfg = loadConfig();

  if (!args.pattern || args.pattern === true) {
    process.stderr.write('usage: repos-by-name-pattern.js --pattern <regex> [--owner <login>] [--include-forks] [--json]\n');
    return 2;
  }

  let re;
  try {
    re = new RegExp(args.pattern, 'i');
  } catch (err) {
    process.stderr.write(`--pattern is not a valid regular expression: ${err.message}\n`);
    return 2;
  }

  const owner = args.owner && args.owner !== true ? args.owner : cfg.defaultOwner;
  const limit = String(Number(args.limit) > 0 ? Number(args.limit) : 500);

  let repos;
  try {
    repos = ghJson(['repo', 'list', owner, '--limit', limit, '--json', 'name,description,visibility,isFork,isArchived,pushedAt,primaryLanguage,stargazerCount,url']);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 1;
  }

  const matches = repos
    .filter((r) => re.test(r.name))
    .filter((r) => (args['include-forks'] ? true : !r.isFork))
    .sort((a, b) => String(b.pushedAt).localeCompare(String(a.pushedAt)));

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ owner, pattern: args.pattern, scanned: repos.length, count: matches.length, repos: matches }, null, 2)}\n`);
    return matches.length ? 0 : 3;
  }

  if (!matches.length) {
    process.stdout.write(`No repository of ${owner} matches /${args.pattern}/i (${repos.length} scanned).\n`);
    return 3;
  }

  const rows = matches.map((r) => [
    r.name,
    r.visibility,
    r.isFork ? 'fork' : '',
    r.isArchived ? 'archived' : '',
    (r.primaryLanguage && r.primaryLanguage.name) || '',
    String(r.pushedAt || '').slice(0, 10),
    (r.description || '').slice(0, 60),
  ]);
  process.stdout.write(`${renderTable(['REPO', 'VIS', 'FORK', 'STATE', 'LANG', 'PUSHED', 'DESCRIPTION'], rows)}\n`);
  process.stdout.write(`\n${matches.length} of ${repos.length} repositories match /${args.pattern}/i.\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main };
