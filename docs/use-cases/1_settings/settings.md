# Claude Code settings

Settings are JSON files that control how Claude Code behaves: which tools run without asking, which are
always blocked, which scripts run automatically around a tool call, which environment variables and model
a session gets. They are read at startup, so the same rules apply in every session without repeating them
in the prompt. `/config` opens the common ones, `/permissions` edits the permission rules, and
`/hooks` shows what runs automatically.

## Where settings live

| File | Scope | In git? | Use it for |
|---|---|---|---|
| `~/.claude/settings.json` | You, in every project | no | Personal defaults: model, theme, rules you want everywhere. |
| `.claude/settings.json` | Everyone on this project | yes | Team rules: shared hooks, commands the whole team may run. |
| `.claude/settings.local.json` | You, in this project only | no (gitignored) | Your own allowances for this repo, e.g. the Jira tools you use. |

When the same key is set in more than one place, the more specific file wins: local over project, project
over user. An organisation can also push a managed policy that overrides all three.

## Permissions

```json
{
  "permissions": {
    "allow": [
      "Glob",
      "Grep",
      "Bash(npx playwright test:*)",
      "Bash(npx tsc:*)",
      "Edit(tests/**)",
      "Write(pages/**)",
      "mcp__atlassian__getJiraIssue"
    ],
    "ask": [
      "Bash(git push:*)"
    ],
    "deny": [
      "Read(.env)",
      "Bash(rm -rf:*)"
    ]
  }
}
```

| List | What it does |
|---|---|
| `allow` | Runs without a prompt. |
| `ask` | Always asks first, even if a broader rule would allow it. |
| `deny` | Never runs. `deny` beats `ask`, and `ask` beats `allow`. |

A rule is a tool name, optionally narrowed in brackets: a command prefix for `Bash`, a path pattern for
`Read`/`Edit`/`Write`, a domain for `WebFetch` (`WebFetch(domain:playwright.dev)`), or the full
`mcp__<server>__<tool>` name for an MCP tool.

Start narrow: allow the test runner and the type check, keep `git push` on `ask`, and deny reading
`.env`, so credentials never enter the conversation.

## Hooks

Hooks run a command of yours at a fixed point, every time, without Claude deciding to. This repository's
`.claude/settings.json` uses them to measure the cost of each subagent run:

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

`matcher` picks the tool, the event (`PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`, …) picks the
moment. Typical uses: run the linter after every `Edit`, block a command in `PreToolUse`, log each run.

## Other useful keys

| Key | What it does | Example |
|---|---|---|
| `model` | Default model for sessions. | `"model": "sonnet"` |
| `env` | Environment variables for every session. | `"env": { "HEADLESS_BROWSER": "true" }` |
| `permissions.defaultMode` | The mode a session starts in. | `"plan"` to read and propose before editing, `"acceptEdits"` to skip file-edit prompts. |
| `permissions.additionalDirectories` | Extra folders Claude may work in. | The application repo next to the test repo. |
