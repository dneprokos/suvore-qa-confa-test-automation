'use strict';

/**
 * registry.js — the index of GitHub questions this skill has already learned to answer.
 *
 * The loop the skill runs is: a question arrives, `find` says whether it has been answered before,
 * and either an existing script runs again or a new one is written and registered. This script owns
 * every read and every write of `registry.json`, for the same reason the workflow state file has an
 * owner: a registry the model hand-edits is a registry that silently disagrees with the scripts it
 * indexes, and nothing notices until a re-run produces the wrong answer.
 *
 * Registration is a gate, not a formality. `add` refuses an entry whose script is missing, whose
 * source can write to GitHub, whose id collides, whose intent duplicates one already registered, or
 * whose example argument is hard-coded into the script body — the last one because a script that
 * cannot take a different parameter is not a learned command, it is a transcript.
 *
 * Usage:
 *   node .claude/skills/gh-commands/scripts/registry.js list [--json] [--tag <t>]
 *   node .claude/skills/gh-commands/scripts/registry.js find "<free text request>" [--json]
 *   node .claude/skills/gh-commands/scripts/registry.js show <id> [--json]
 *   node .claude/skills/gh-commands/scripts/registry.js add --from-stdin | --from-file <p> [--date <iso>]
 *   node .claude/skills/gh-commands/scripts/registry.js update <id> --set <field>=<value>... [--date <iso>]
 *   node .claude/skills/gh-commands/scripts/registry.js remove <id> --reason "<why>"
 *   node .claude/skills/gh-commands/scripts/registry.js verify <id> | --all [--date <iso>]
 *   node .claude/skills/gh-commands/scripts/registry.js render
 *   node .claude/skills/gh-commands/scripts/registry.js doctor [--json]
 *
 * `--registry <path>` points every command at a different registry file, which is what the tests use.
 *
 * Exit codes:
 *   0  the command succeeded, and `find` found something at or above the reuse threshold
 *   1  a write was refused — validation, a safety hit, a duplicate, or a failed verification
 *   2  usage error
 *   3  nothing matched: an unknown id, or `find` with no candidate above the confirm threshold
 *   4  `doctor` found drift between the registry and the files on disk
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const lib = require('./lib');

const {
  SKILL_DIR,
  loadConfig,
  skillPath,
  readRegistry,
  writeRegistry,
  validateEntry,
  scanForWrites,
  rankEntries,
  renderTable,
  parseArgs,
  readStdin,
  today,
} = lib;

/* ------------------------------------------------------------------ output */

function die(message, code) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function resolveRegistryFile(args) {
  return args.registry ? path.resolve(args.registry) : skillPath('registry');
}

/* -------------------------------------------------------------------- list */

function cmdList(args) {
  const model = readRegistry(resolveRegistryFile(args));
  let commands = model.commands;
  if (args.tag) commands = commands.filter((c) => (c.tags || []).includes(args.tag));
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ count: commands.length, commands }, null, 2)}\n`);
    return 0;
  }
  if (!commands.length) {
    process.stdout.write('Registry is empty — nothing has been learned yet.\n');
    return 0;
  }
  const rows = commands.map((c) => [c.id, c.intent, (c.params || []).map((p) => p.name).join(' '), c.last_verified]);
  process.stdout.write(`${renderTable(['ID', 'INTENT', 'PARAMS', 'VERIFIED'], rows)}\n`);
  process.stdout.write(`\n${commands.length} command(s).\n`);
  return 0;
}

/* -------------------------------------------------------------------- find */

function cmdFind(args) {
  const request = args._.slice(1).join(' ').trim();
  if (!request) die('usage: registry.js find "<free text request>"', 2);
  const cfg = loadConfig();
  const model = readRegistry(resolveRegistryFile(args));
  const ranked = rankEntries(request, model.commands, cfg).slice(0, cfg.match.topN);
  const best = ranked[0];
  const decision = !best || best.score < cfg.match.confirmThreshold
    ? 'learn'
    : best.score >= cfg.match.reuseThreshold
      ? 'reuse'
      : 'confirm';

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ request, decision, thresholds: cfg.match, matches: ranked.map((r) => ({ id: r.entry.id, score: r.score, intent: r.entry.intent, script: r.entry.script, example: r.entry.example })) }, null, 2)}\n`);
  } else {
    process.stdout.write(`request:  ${request}\ndecision: ${decision}\n\n`);
    if (ranked.length) {
      process.stdout.write(`${renderTable(['SCORE', 'ID', 'INTENT'], ranked.map((r) => [r.score.toFixed(2), r.entry.id, r.entry.intent]))}\n`);
      if (decision !== 'learn') {
        process.stdout.write(`\nrun: node ${path.relative(process.cwd(), path.join(SKILL_DIR, best.entry.script)).replace(/\\/g, '/')} ${best.entry.example}\n`);
      }
    } else {
      process.stdout.write('(registry is empty)\n');
    }
  }
  return decision === 'learn' ? 3 : 0;
}

/* -------------------------------------------------------------------- show */

function cmdShow(args) {
  const id = args._[1];
  if (!id) die('usage: registry.js show <id>', 2);
  const model = readRegistry(resolveRegistryFile(args));
  const entry = model.commands.find((c) => c.id === id);
  if (!entry) die(`no command with id "${id}"`, 3);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(`${entry.id}\n${'='.repeat(entry.id.length)}\n`);
  process.stdout.write(`intent:   ${entry.intent}\n`);
  process.stdout.write(`script:   ${entry.script}\n`);
  process.stdout.write(`example:  node .claude/skills/gh-commands/${entry.script} ${entry.example}\n`);
  process.stdout.write(`output:   ${entry.output}\n`);
  process.stdout.write(`verified: ${entry.last_verified} (created ${entry.created})\n`);
  process.stdout.write(`aliases:\n${entry.aliases.map((a) => `  · ${a}`).join('\n')}\n`);
  if ((entry.params || []).length) {
    process.stdout.write(`params:\n${entry.params.map((p) => `  ${p.name}${p.required ? ' (required)' : ''} — ${p.description}`).join('\n')}\n`);
  }
  if ((entry.gh_calls || []).length) process.stdout.write(`gh calls:\n${entry.gh_calls.map((g) => `  ${g}`).join('\n')}\n`);
  if (entry.notes) process.stdout.write(`notes:    ${entry.notes}\n`);
  return 0;
}

/* --------------------------------------------------------------------- add */

/**
 * The registration gate. Every check here answers a way the loop has an obvious failure mode:
 * a script that is not there, a script that writes, an id already taken, an intent already
 * covered by a script with a parameter, and a "script" that only answers the one question asked.
 */
function checkCandidate(entry, model, opts = {}) {
  const cfg = loadConfig();
  const problems = validateEntry(entry).map((p) => `invalid entry — ${p}`);
  if (problems.length) return problems;

  if (model.commands.some((c) => c.id === entry.id) && !opts.allowExisting) {
    problems.push(`duplicate id — "${entry.id}" is already registered; use \`update\` instead`);
  }

  const scriptPath = path.join(SKILL_DIR, entry.script);
  if (!fs.existsSync(scriptPath)) {
    problems.push(`missing script — ${entry.script} does not exist; write it before registering it`);
    return problems;
  }

  const source = fs.readFileSync(scriptPath, 'utf8');
  const writes = scanForWrites(source);
  for (const hit of writes) {
    problems.push(`write operation at ${entry.script}:${hit.line} (${hit.label}) — this registry holds read-only commands: ${hit.text}`);
  }

  const exampleValues = String(entry.example || '')
    .split(/\s+/)
    .filter((token) => token && !token.startsWith('-') && token.length >= 4);
  for (const value of exampleValues) {
    const quoted = new RegExp(`['"\`]${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
    const offending = source
      .split(/\r?\n/)
      .findIndex((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && !/default/i.test(line) && quoted.test(line));
    if (offending !== -1) {
      problems.push(`hard-coded parameter at ${entry.script}:${offending + 1} — the example value "${value}" is baked into the script; take it as an argument instead`);
    }
  }

  const near = rankEntries(`${entry.intent} ${entry.aliases.join(' ')}`, model.commands.filter((c) => c.id !== entry.id), cfg)[0];
  if (near && near.score >= cfg.match.duplicateIntentThreshold) {
    problems.push(`duplicate intent — "${near.entry.id}" already covers this at score ${near.score}; parameterise that command instead of adding a second one`);
  }

  return problems;
}

function cmdAdd(args) {
  const raw = args['from-file'] ? fs.readFileSync(path.resolve(args['from-file']), 'utf8') : args['from-stdin'] ? readStdin() : null;
  if (!raw) die('usage: registry.js add --from-stdin | --from-file <path>', 2);

  let entry;
  try {
    entry = JSON.parse(raw);
  } catch (err) {
    die(`the entry is not valid JSON: ${err.message}`, 2);
  }

  const file = resolveRegistryFile(args);
  const model = readRegistry(file);

  entry.read_only = true;
  entry.tags = entry.tags || [];
  entry.params = entry.params || [];
  entry.gh_calls = entry.gh_calls || [];
  entry.ok_exit_codes = entry.ok_exit_codes || [0];
  entry.created = entry.created || today(args.date);
  entry.last_verified = entry.last_verified || today(args.date);
  entry.runs = entry.runs || 0;

  const problems = checkCandidate(entry, model);
  if (problems.length) {
    process.stderr.write(`REFUSED — ${entry.id || '(no id)'}\n${problems.map((p) => `  · ${p}`).join('\n')}\n`);
    return 1;
  }

  model.commands.push(entry);
  const result = writeRegistry(model, file);
  renderRegistryMarkdown(model, args);
  process.stdout.write(`REGISTERED ${entry.id} (${result})\n`);
  return 0;
}

/* ------------------------------------------------------------------ update */

function cmdUpdate(args) {
  const id = args._[1];
  if (!id) die('usage: registry.js update <id> --set <field>=<value>...', 2);
  const file = resolveRegistryFile(args);
  const model = readRegistry(file);
  const entry = model.commands.find((c) => c.id === id);
  if (!entry) die(`no command with id "${id}"`, 3);

  const sets = Array.isArray(args.set) ? args.set : args.set ? [args.set] : [];
  if (!sets.length && !args.verified) die('nothing to update — pass --set <field>=<value> or --verified', 2);
  for (const pair of sets) {
    const eq = String(pair).indexOf('=');
    if (eq === -1) die(`--set expects <field>=<value>, got "${pair}"`, 2);
    const field = String(pair).slice(0, eq);
    const value = String(pair).slice(eq + 1);
    if (field === 'id') die('the id is what every reference cites — remove and re-add instead', 2);
    entry[field] = ['aliases', 'tags', 'gh_calls'].includes(field) ? value.split(',').map((s) => s.trim()).filter(Boolean) : value;
  }
  if (args.verified) entry.last_verified = today(args.date);

  const problems = checkCandidate(entry, model, { allowExisting: true });
  if (problems.length) {
    process.stderr.write(`REFUSED — ${id}\n${problems.map((p) => `  · ${p}`).join('\n')}\n`);
    return 1;
  }
  const result = writeRegistry(model, file);
  renderRegistryMarkdown(model, args);
  process.stdout.write(`UPDATED ${id} (${result})\n`);
  return 0;
}

/* ------------------------------------------------------------------ remove */

function cmdRemove(args) {
  const id = args._[1];
  if (!id) die('usage: registry.js remove <id> --reason "<why>"', 2);
  if (!args.reason || args.reason === true) die('--reason is required — a command removed without one is indistinguishable from one lost', 2);
  const file = resolveRegistryFile(args);
  const model = readRegistry(file);
  const before = model.commands.length;
  model.commands = model.commands.filter((c) => c.id !== id);
  if (model.commands.length === before) die(`no command with id "${id}"`, 3);
  writeRegistry(model, file);
  renderRegistryMarkdown(model, args);
  process.stdout.write(`REMOVED ${id} — ${args.reason}\nThe script file is left on disk; delete it yourself if it is dead.\n`);
  return 0;
}

/* ------------------------------------------------------------------ verify */

function runEntry(entry, extraArgs) {
  const scriptPath = path.join(SKILL_DIR, entry.script);
  const argv = (extraArgs !== undefined ? extraArgs : entry.example).split(/\s+/).filter(Boolean);
  const res = spawnSync(process.execPath, [scriptPath, ...argv], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 600000 });
  return { status: res.status === null ? 124 : res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function cmdVerify(args) {
  const file = resolveRegistryFile(args);
  const model = readRegistry(file);
  const targets = args.all ? model.commands : model.commands.filter((c) => c.id === args._[1]);
  if (!targets.length) die(args.all ? 'the registry is empty' : `no command with id "${args._[1] || ''}"`, 3);

  const results = [];
  for (const entry of targets) {
    const run = runEntry(entry);
    // A command that answers "none found" with its own exit code has still run correctly, so the
    // codes that count as success are the entry's to declare. Anything else is a real failure.
    const okCodes = Array.isArray(entry.ok_exit_codes) && entry.ok_exit_codes.length ? entry.ok_exit_codes : [0];
    const ok = okCodes.includes(run.status);
    if (ok) entry.last_verified = today(args.date);
    results.push({ id: entry.id, ok, status: run.status, stderr: run.stderr.trim().split('\n').slice(-2).join(' ') });
  }
  writeRegistry(model, file);
  renderRegistryMarkdown(model, args);

  if (args.json) process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
  else process.stdout.write(`${renderTable(['ID', 'RESULT', 'EXIT', 'LAST STDERR'], results.map((r) => [r.id, r.ok ? 'ok' : 'FAILED', r.status, r.stderr.slice(0, 80)]))}\n`);
  return results.every((r) => r.ok) ? 0 : 1;
}

/* ------------------------------------------------------------------ render */

function renderRegistryMarkdown(model, args) {
  if (args && args.registry) return; // a test registry does not own the committed reference file
  const target = skillPath('renderedRegistry');
  const rows = model.commands.map((c) => [
    `\`${c.id}\``,
    c.intent,
    `\`${(c.params || []).map((p) => p.name).join(' ') || '—'}\``,
    `\`${c.example}\``,
    c.last_verified,
  ]);
  const table = rows.length
    ? ['| Command | Answers | Parameters | Example | Verified |', '|---|---|---|---|---|', ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n')
    : '_Nothing learned yet._';

  const text = `# Learned commands

<!-- GENERATED by scripts/registry.js — do not edit by hand. Regenerate with:
     node .claude/skills/gh-commands/scripts/registry.js render -->

${model.commands.length} command(s) registered. Each row is a script that has been run and verified;
running it again is the cheap path, and is what the skill does before it writes anything new.

${table}

## Detail

${model.commands.map((c) => `### \`${c.id}\`

${c.intent}

- **Script** — \`${c.script}\`
- **Run** — \`node .claude/skills/gh-commands/${c.script} ${c.example}\`
- **Recognised phrasings** — ${c.aliases.map((a) => `"${a}"`).join(', ')}
- **Parameters** — ${(c.params || []).length ? c.params.map((p) => `\`${p.name}\`${p.required ? ' (required)' : ''} — ${p.description}`).join('; ') : 'none'}
- **gh calls** — ${(c.gh_calls || []).length ? c.gh_calls.map((g) => `\`${g}\``).join(', ') : '—'}
${c.notes ? `- **Notes** — ${c.notes}\n` : ''}`).join('\n')}
`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === text) return;
  fs.writeFileSync(target, text);
}

function cmdRender(args) {
  const model = readRegistry(resolveRegistryFile(args));
  renderRegistryMarkdown(model, args);
  process.stdout.write(`rendered ${model.commands.length} command(s) into references/registry.md\n`);
  return 0;
}

/* ------------------------------------------------------------------ doctor */

function cmdDoctor(args) {
  const cfg = loadConfig();
  const file = resolveRegistryFile(args);
  const model = readRegistry(file);
  const findings = [];

  for (const entry of model.commands) {
    const scriptPath = path.join(SKILL_DIR, entry.script);
    if (!fs.existsSync(scriptPath)) {
      findings.push({ id: entry.id, problem: 'registered script is missing from disk', detail: entry.script });
      continue;
    }
    const hits = scanForWrites(fs.readFileSync(scriptPath, 'utf8'));
    for (const hit of hits) findings.push({ id: entry.id, problem: 'script now contains a write operation', detail: `${entry.script}:${hit.line} ${hit.label}` });
  }

  const learnedDir = path.join(SKILL_DIR, cfg.paths.learnedDir);
  if (fs.existsSync(learnedDir)) {
    const registered = new Set(model.commands.map((c) => path.basename(c.script)));
    for (const name of fs.readdirSync(learnedDir)) {
      if (!name.endsWith('.js') || name.endsWith('.test.js')) continue;
      if (!registered.has(name)) findings.push({ id: '—', problem: 'orphan script — on disk but not registered', detail: `${cfg.paths.learnedDir}/${name}` });
    }
  }

  if (args.json) process.stdout.write(`${JSON.stringify({ count: findings.length, findings }, null, 2)}\n`);
  else if (!findings.length) process.stdout.write(`clean — ${model.commands.length} command(s), every script present and read-only\n`);
  else process.stdout.write(`${renderTable(['ID', 'PROBLEM', 'DETAIL'], findings.map((f) => [f.id, f.problem, f.detail]))}\n`);
  return findings.length ? 4 : 0;
}

/* -------------------------------------------------------------------- main */

const COMMANDS = {
  list: cmdList,
  find: cmdFind,
  show: cmdShow,
  add: cmdAdd,
  update: cmdUpdate,
  remove: cmdRemove,
  verify: cmdVerify,
  render: cmdRender,
  doctor: cmdDoctor,
};

function main(argv) {
  const args = parseArgs(argv);
  const command = args._[0];
  if (!command || !COMMANDS[command]) {
    die(`usage: registry.js <${Object.keys(COMMANDS).join('|')}> [...]`, 2);
  }
  return COMMANDS[command](args);
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    die(`[gh-commands] ${err.message}`, 1);
  }
}

module.exports = { main, checkCandidate, renderRegistryMarkdown, runEntry };
