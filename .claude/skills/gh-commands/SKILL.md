---
name: gh-commands
description: >-
  Answer a GitHub question about repositories, and remember how. Looks the request up in a registry
  of commands already learned, re-runs the matching script when there is one, and otherwise answers
  it with the `gh` CLI, turns the answer into a parameterised script and registers it for next time.
  Read-only: it lists, searches, counts and audits, and never creates, edits, merges or deletes.
  Use when asked things like "give me repos containing playwright in the name", "which of my repos
  have secrets", "which projects use environment variables", "list my archived repositories",
  "how many stars across my repos", or "/gh-commands <question>". Not for opening pull requests,
  pushing branches or any other write — those belong to the git skills.
argument-hint: "<question about GitHub> [--owner <login>] [--no-learn]"
---

# GitHub Commands

A GitHub question answered twice should not be worked out twice. This skill keeps a registry of the
questions it has already answered, each one backed by a script that takes the varying part as a
parameter, so the second asking is a one-line re-run rather than a fresh investigation.

It performs no write of any kind. Every registered command is a query, the runner refuses any `gh`
subcommand that is not on a read-only allowlist, and registration is refused for a script whose
source can change anything on GitHub. Opening a pull request, pushing, committing and creating repos
belong to the `git-*` skills; this one reports.

## The flow

```
question  →  registry.js find  ──reuse──→  run the registered script  →  answer
                     │
                   learn
                     ↓
            answer it with gh  →  generalise into a script  →  registry.js add  →  answer
```

## Inputs

| Parameter | Required | Form | If absent |
|---|---|---|---|
| question | yes | free text, as the user phrased it | ask for it and stop |
| `--owner` | no | a GitHub login | `defaultOwner` from `config.json` |
| `--no-learn` | no | flag | learning is on; the flag answers once and registers nothing |

## Step 1 — Look it up before doing anything

```bash
node .claude/skills/gh-commands/scripts/registry.js find "<the user's question, verbatim>"
```

The command prints a decision and exits on it. **Route on the decision, not on your own reading of
the table** — the whole point of the registry is that the lookup is the same every time.

| Decision | Exit | What it means | What you do |
|---|---|---|---|
| `reuse` | 0 | a registered command scores at or above 0.6 | go to Step 2 with that command |
| `confirm` | 0 | something is close but not certain | show the user the top match and ask whether to run it or learn a new one |
| `learn` | 3 | nothing above 0.3 | go to Step 3 |

Pass the question as the user wrote it. Rewording it into what you think the command is called is
how a match gets missed.

## Step 2 — Reuse

`find` prints the exact invocation. Run it, with the user's value substituted into the parameter:

```bash
node .claude/skills/gh-commands/scripts/learned/<id>.js --pattern <what the user asked for>
```

Two failure modes, two different answers:

- **The script fails** (a non-zero exit that is not one of its documented result codes) — GitHub or
  `gh` has moved under it. Say so, answer the question ad hoc, then repair the script and
  `registry.js update <id> --verified`. Do not register a second command for the same question.
- **The script runs and returns nothing** — that is an answer. Report it as one.

Never paraphrase a registered script's output into numbers you did not see. Show what it printed.

## Step 3 — Learn

Only after `find` said `learn`, and only for a read-only question.

**3a. Answer it first, ad hoc.** Use `gh` directly and get the real answer for the user. A script
written before the question has been answered once is a guess about an API you have not seen.

**3b. Read the contract.** Read [`references/authoring.md`](references/authoring.md) before writing
the script. It carries the file shape, the argument conventions, the exit-code contract and the
checks registration will apply — working from memory here produces a script the gate rejects.

**3c. Generalise.** Identify the part of the question that was a *value* — the name fragment, the
owner, the language, the date window — and make it a flag with a default. A script that only answers
the question as first asked is refused at registration, by name.

**3d. Verify before registering.** Run the new script and check it reproduces the ad-hoc answer from
3a. A script that disagrees with the answer you already gave is wrong; fix it, do not register it.

**3e. Register.**

```bash
node .claude/skills/gh-commands/scripts/registry.js add --from-stdin <<'JSON'
{ "id": "...", "intent": "...", "aliases": ["..."], "script": "scripts/learned/....js", ... }
JSON
```

Write the `aliases` as the phrasings a person would actually use, including the one the user just
used. They are what `find` matches on, so a registry entry with one bookish alias never matches
again and the command is learned a second time under a different name.

Registration prints `REGISTERED <id>` or `REFUSED` with a reason per problem. **A refusal is a fact
about the script, not an obstacle** — fix what it names and re-run. Never hand-edit `registry.json`
to get past one.

## Step 4 — Return

Answer the user's question first, in the shape they asked for it. Then, in one line, say which
command answered it and whether it was reused or newly learned:

```
_Answered by `repos-by-name-pattern` (reused). 11 of 78 repositories match._
```

If a command was learned this run, name it and its parameters so the user knows what they now have.

## Maintenance

```bash
node .claude/skills/gh-commands/scripts/registry.js list                      # what has been learned
node .claude/skills/gh-commands/scripts/registry.js show <id>                 # one command in full
node .claude/skills/gh-commands/scripts/registry.js verify <id> | --all       # re-run and re-date
node .claude/skills/gh-commands/scripts/registry.js update <id> --verified    # after a repair
node .claude/skills/gh-commands/scripts/registry.js remove <id> --reason "…"  # retire one
node .claude/skills/gh-commands/scripts/registry.js doctor                    # registry vs disk
node --test .claude/skills/gh-commands/scripts/registry.test.js               # the gate's own tests
```

`doctor` exits `4` on drift — a registered script missing from disk, a script that has gained a write
operation since it was registered, or a script in `scripts/learned/` that nothing registered. Run it
after any hand-editing of the skill directory.

The current registry is rendered at [`references/registry.md`](references/registry.md); it is
generated from `registry.json`, so edit the JSON through the script and let it re-render.

## Hard rules

- **`registry.json` is written by `registry.js` and by nothing else.** It re-emits the whole document
  from a parsed model and validates before writing, so a hand edit is the one way to get an entry
  that disagrees with the script it indexes.
- **Read-only, with no exceptions granted at run time.** If a question needs a write, say so and hand
  it to the skill that owns that write. Do not add a write verb to `config.json`'s allowlist to get a
  question answered.
- **Never register a script that has not been run.** The example in the entry is what `verify`
  replays; an example that has never worked makes every later verification meaningless.
- **Never present a rate-limited or partial sweep as a complete answer.** `gh` search throttles at
  about ten queries a minute; the clone-based commands say how many repositories they could not
  clone. Report that number rather than dropping it.
- **A registered command's scope is part of its answer.** `secret-scan` reads the working tree at
  clone depth 1 and not the git history — say so when you report its result, every time.
