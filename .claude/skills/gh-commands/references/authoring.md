# Writing a learned command

Read this before writing a script for `scripts/learned/`. It is the contract registration enforces —
every rule here corresponds to a check in `registry.js`, so a script written from memory usually
comes back `REFUSED` with the rule quoted at it.

## The shape

```js
'use strict';

/**
 * <id>.js — one sentence saying what question this answers.
 *
 * Then a paragraph on why it is done this way rather than the obvious way — which gh command was
 * not enough, which API lies, which limit bites. That paragraph is the reason the script exists
 * instead of a one-liner someone retypes.
 *
 * Usage:
 *   node .claude/skills/gh-commands/scripts/learned/<id>.js [options]
 *
 *   --thing <value>   what it does; required or defaulted
 *   --json            machine-readable output
 *
 * Exit codes: 0 <result> · 3 <no result> · 2 usage error · 1 the call failed
 */

const path = require('path');
const { loadConfig, ghJson, renderTable, parseArgs } = require(path.join(__dirname, '..', 'lib'));

function main(argv) {
  const args = parseArgs(argv);
  const cfg = loadConfig();
  // ...
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main };
```

CommonJS, `'use strict'`, no npm dependencies, no shebang — the same rules as the other Node scripts
in this repository. `main(argv)` returns the exit code and is exported, so the script can be required
by a test without running.

## Arguments

Long GNU-style flags only, parsed by `parseArgs` from `lib.js`. `--flag value`, `--flag=value` and a
bare `--flag` (which arrives as `true`) all work, which is why every optional string value is read as
`args.x && args.x !== true ? args.x : <default>`.

Three flags recur and should keep their meaning:

| Flag | Meaning |
|---|---|
| `--owner <login>` | whose repositories; defaults to `config.json` `defaultOwner` |
| `--json` | machine-readable output on stdout, nothing else |
| `--cache <dir>` | where clones live, for commands that sweep file contents |

**The value the user asked about is always a flag.** A script with `playwright` in its body answers
one question forever; registration refuses it, naming the line. The example in the registry entry is
what proves the flag works.

## Talking to GitHub

Use `ghJson(args)` or `gh(args)` from `lib.js`. Both refuse any subcommand that is not on the
read-only allowlist in `config.json`, and `gh api` with a mutating method is refused even though
`gh api` itself is allowed. Do not shell out to `gh` some other way — the allowlist is the only thing
standing between a registry of queries and a registry of surprises, and `registry.js doctor` scans
the source for exactly that.

**Choose the transport deliberately.** `gh api` and `gh repo list` are cheap and precise. The code
search API (`gh search code`) is neither: it indexes only the default branch, misses dotfiles, and
throttles at roughly ten queries a minute — a sweep across an account hits `403 rate limit exceeded`
part-way and returns a *plausible* partial answer, which is worse than an error. For anything that
needs file contents across many repositories, shallow-clone into the cache with `ensureClones` and
read the files; the first run pays for the clones and every later one is free.

## Output

Default output is for a person: `renderTable(headers, rows)` and a closing sentence with the count
and the denominator (`11 of 78 repositories match`). `--json` is for a machine and prints one JSON
object, including the counts a caller would otherwise have to recompute.

Say what was not covered. A sweep that failed to clone four repositories, a search that was
throttled, a scope that stops at the working tree — each goes in the output, in both formats. A
number with a silent hole in it is the failure mode this whole skill is meant to avoid.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | ran, and found something |
| 3 | ran, and found nothing — an answer, not a failure |
| 2 | usage error: a missing or malformed argument |
| 1 | the call failed: `gh` errored, the network died, the clones failed |
| 5+ | a command-specific verdict, e.g. `secret-scan` returns 5 when a high-confidence hit exists |

Whatever a successful run can exit with goes in the entry's `ok_exit_codes`, or `verify` will read a
correct "nothing found" as a broken script.

## The registry entry

```json
{
  "id": "kebab-case-id",
  "intent": "One sentence: what question this answers",
  "aliases": ["how a person would ask it", "another phrasing", "the phrasing that was just used"],
  "tags": ["nouns", "for", "matching"],
  "script": "scripts/learned/kebab-case-id.js",
  "params": [{ "name": "--thing", "required": true, "description": "what it selects" }],
  "example": "--thing value",
  "gh_calls": ["gh repo list <owner> --json name,..."],
  "output": "table",
  "ok_exit_codes": [0, 3],
  "read_only": true,
  "notes": "What this does not cover, and why it is built this way"
}
```

`aliases` are what matching runs on, weighted by how rare each word is across the registry — so a
word that appears in every entry (`repository`, `github`) contributes almost nothing, and the
distinguishing noun is what makes the match. Write three to five real phrasings, including the one
the user just used. One bookish alias means the command is never found again and gets learned twice.

`example` must be an invocation that has actually run.

## What registration refuses

| Refusal | Why |
|---|---|
| `invalid entry — <field>` | a field is missing or malformed against the schema in `lib.js` |
| `missing script` | the path does not exist; write the script first |
| `write operation at <file>:<line>` | the source can change GitHub state; this registry is queries only |
| `hard-coded parameter` | the example's value appears as a literal in the script |
| `duplicate id` | that id is registered; use `update` |
| `duplicate intent` | an existing command already covers this — parameterise it instead |

The last one is the one worth taking seriously. Two commands that answer nearly the same question
are how a registry stops being an index and becomes a pile: `find` splits its score between them and
matches neither well. Extending an existing command with one more flag is almost always the right
move.
