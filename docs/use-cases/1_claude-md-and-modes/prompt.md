# CLAUDE.md and permission modes — onboarding once, then plan before you change

Two things to set up before the first real task: a `CLAUDE.md` so every session starts already knowing
the project, and plan mode so a big change is agreed before any file moves.

## A. CLAUDE.md — project memory

### Generate it

In a repository that has no `CLAUDE.md` yet (clone any small test project, or a scratch copy of this one
with the file deleted):

```text
/init
```

Claude reads the repo and writes a `CLAUDE.md`: commands, structure, conventions. Open it and point out
that this is the doc you would write for a new hire.

### Teach it a rule

```text
Add to CLAUDE.md under a "Test conventions" heading: never use waitForTimeout or networkidle; wait with
web-first assertions instead. Keep it to two lines.
```

`/memory` opens the same file for a manual edit.

### Prove it stuck

`/clear`, then:

```text
Write a UI test that opens the home page and checks that at least one game card is visible.
```

No `waitForTimeout` in the result, and nobody repeated the rule in the prompt. Compare with this repo's
own `CLAUDE.md`: the fixture chain, the import rule and the wait policy all live there, which is why the
prompts in the other use cases can stay short.

| File | Who gets it |
|---|---|
| `CLAUDE.md` in the repo | The whole team, committed. |
| `CLAUDE.local.md` | You, this project, not committed. |
| `~/.claude/CLAUDE.md` | You, in every project. |

## B. Plan mode — read, propose, wait

Press `Shift+Tab` until the status line says **plan mode**, then:

```text
Add API tests for the games search endpoint covering an empty query, a query with no matches and
the page size limit. Plan only.
```

Claude reads `tests/api/games-search-api.spec.ts`, the facade and the etalon, and returns a plan. It
does not create or edit a file. Approve the plan and the same session carries it out. Reject it and
nothing changed.

## C. The mode cycle

| Mode | What it does | When |
|---|---|---|
| Normal (default) | Asks before each edit and each non-allowed command. | Anything you want to watch. |
| Auto-accept edits | Edits without asking. Commands still follow your `allow`/`ask` rules. | A task you already planned. |
| Plan | Read-only. Proposes, changes nothing. | Anything larger than one file. |
| Bypass permissions | No prompts at all. Only with `--dangerously-skip-permissions`. | A sandbox or container, never your laptop. |

`deny` rules and `PreToolUse` hooks still apply in every mode, bypass included. See `1_settings` and
`5_1_hook-guardrail`.

## What to point at

- **CLAUDE.md is loaded every session.** Keep it short and specific: every line costs context on every call.
- **Plan first, then switch mode.** The expensive mistake is a wrong plan carried out fast, not a slow edit.
- **The mode is not the security boundary.** `deny` and hooks are.
