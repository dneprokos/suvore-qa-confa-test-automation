# Claude Code hooks

A hook is a command of yours that Claude Code runs at a fixed moment: before a tool call, after it, when
you submit a prompt, when Claude stops. Claude does not decide to run it and cannot skip it. That is the
difference from a rule in `CLAUDE.md`, which Claude may follow or forget: a hook always fires. Use one when
something must happen every time: run the linter after an edit, block a dangerous command, log what
each subagent cost, add context to every prompt.

## Architecture

```text
event happens (e.g. Claude is about to call Bash)
   │
   ▼
settings.json → hooks → <event> → matcher matches the tool?
   │ yes
   ▼
your command runs, gets the event as JSON on stdin
   │
   ▼
exit code + stdout tell Claude Code what to do next
```

Hooks live in the same settings files as permissions, so the same scopes apply:

| File | Hook applies to |
|---|---|
| `~/.claude/settings.json` | You, in every project. |
| `.claude/settings.json` | Everyone on this project (in git). |
| `.claude/settings.local.json` | You, in this project only. |
| a plugin's `hooks/hooks.json` | Everyone who installs the plugin. |

`/hooks` shows what is configured and where it came from.

## Configuration fields

This repository's `.claude/settings.json` measures every subagent run with three hooks. One of them:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Task|Agent",
        "hooks": [
          {
            "type": "command",
            "timeout": 10,
            "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/agent-metrics.mjs\" --post"
          }
        ]
      }
    ]
  }
}
```

| Field | What it does |
|---|---|
| event key (`PostToolUse`) | When the hook fires. See the table below. |
| `matcher` | Which tool it fires for, on tool events. A name (`Bash`), an alternation (`Edit\|Write`), or empty for all. |
| `type` | `command`: run a shell command. |
| `command` | What to run. `$CLAUDE_PROJECT_DIR` points at the project root, so the path works from any folder. |
| `timeout` | Seconds before the hook is killed. |

## Events

| Event | Fires | Typical use |
|---|---|---|
| `SessionStart` | A session starts, resumes or is cleared. | Load context: the current branch, open tickets. |
| `UserPromptSubmit` | You submit a prompt, before Claude sees it. | Add context, block a prompt carrying a secret. |
| `PreToolUse` | Before a tool call. | Block `rm -rf`, block edits to `.env`. |
| `PostToolUse` | After a tool call succeeds. | Run Prettier or `tsc` after an `Edit`. |
| `PostToolUseFailure` | After a tool call fails. | Log the failure. |
| `Notification` | Claude Code needs your attention. | A desktop or Slack notification. |
| `Stop` | Claude finishes its answer. | Summaries, sounds, the `@Prompted by` banner. |
| `SubagentStop` | A subagent finishes. | Check its result. |

## Input and output

The hook gets the event as JSON on stdin: session id, the tool name, the tool's input, and on
`PostToolUse` its response too. It answers with its exit code:

| Exit code | Meaning |
|---|---|
| `0` | Success. On `UserPromptSubmit` and `SessionStart`, stdout is added to Claude's context. |
| `2` | Block. On `PreToolUse` the tool call is cancelled and stderr goes to Claude as the reason. |
| anything else | A non-blocking error: shown to you, Claude carries on. |

A hook can also print JSON instead, e.g. `{ "systemMessage": "…" }` to show a line to the user. That is
what `.claude/hooks/prompted-by.mjs` does on `Stop`.

## Rules of thumb

- **Keep it fast.** A hook runs on every matching call; a slow one slows down every step.
- **Fail loudly, exit calmly.** Log why a hook bailed, but don't crash a tool call over a metric.
- **Hooks run with your permissions.** Read a hook before you enable it, especially one from a plugin.
