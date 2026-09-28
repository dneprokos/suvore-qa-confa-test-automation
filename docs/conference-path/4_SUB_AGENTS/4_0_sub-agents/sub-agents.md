# Claude Code sub-agents

## Presentation

![SUB-AGENTS](slides/36-sub-agents.png)

![THE PROBLEM](slides/37-the-problem.png)

![DEFINITION](slides/38-definition.png)

![DELEGATION](slides/39-delegation.png)

![PRACTICE: SUB-AGENTS](slides/practice.png)

## Live demo slides

![LIVE: SUB-AGENT ANATOMY](slides/40-live-sub-agent-anatomy.png)

A sub-agent is a specialist Claude hands a task to through the `Agent` tool. It starts with a clean
context of its own, works with only the tools it was given, and returns one final message. Everything it
read along the way stays in its context, not yours. Use one when a task reads a lot to produce a little
(a code review, a search across the repo), when it should run in parallel with other work, or when it
must be limited: a reviewer that cannot edit, a Jira agent that cannot touch files.

## Architecture

```text
main conversation
   │  Agent(subagent_type: "aqa-api-test-reviewer", prompt: "...")
   ▼
sub-agent: own context window, own system prompt (the .md body), own tool list
   │  Read, Grep, Bash … (only what `tools:` allows)
   ▼
one final message back to the main conversation
```

| Property | What it means in practice |
|---|---|
| Own context | The main conversation doesn't fill up with the files the agent read. |
| Only the prompt goes in | It does not see your conversation. Everything it needs goes in the delegation prompt. |
| Only the result comes out | Ask for a short, fixed-shape answer, because that's all you get back. |
| Limited nesting | A sub-agent can start its own sub-agents, up to three layers below the main conversation (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, `1` turns nesting off). Remove `Agent` from `tools` to stop one agent delegating. Keeping orchestration in the main thread is still the easier design to debug. |

Where an agent lives decides who gets it:

| Location | Available |
|---|---|
| `~/.claude/agents/<name>.md` | You, in every project. |
| `.claude/agents/<name>.md` | Everyone who works in this repository. |
| a plugin's `agents/` folder | Everyone who installs the plugin. |

`/agents` creates, edits and lists them.

## File and frontmatter fields

One Markdown file: frontmatter, then the body, which becomes the agent's system prompt.

```markdown
---
name: aqa-api-test-reviewer
description: Reviews new Playwright API tests against the test design and the house style,
  re-runs the API suite and returns a Pass / Needs Revision / Blocked verdict. Use when an
  API implementation report exists and the code needs a quality gate before the PR.
tools: Read, Grep, Glob, Bash
model: opus
color: orange
---

You are a Senior QA Automation Engineer reviewing Playwright API tests.

## Process
1. ...
```

| Field | Required | What it does |
|---|---|---|
| `name` | yes | The id used to call it: `subagent_type: "aqa-api-test-reviewer"`. Lowercase, hyphens. |
| `description` | yes | What it does and **when to use it**. Claude reads this to decide when to delegate. |
| `tools` | no | Allow-list of tools. Leave it out and the agent inherits all of them, MCP tools included. |
| `model` | no | `sonnet`, `opus`, `haiku`, `fable`, a full model id, or `inherit` to use the main conversation's model. |
| `color` | no | Colour of the agent's label in the terminal, useful when several run in parallel. |

`tools` is the field that matters most. This reviewer has no `Edit` or `Write` on purpose: a reviewer
that can fix what it finds returns `Pass`, and the finding disappears.

### More fields: permissions, skills, MCP, memory

The five fields above are enough for most agents. The rest control what the agent is **allowed** to do,
what it **knows** at start-up and how it **runs**.

```markdown
---
name: ui-test-writer        # a demo agent: every field at once
description: Writes Playwright UI tests for the given scenarios ...
tools: Read, Write, Edit, Glob, Grep, Bash
disallowedTools: Bash(git push *)
model: sonnet
permissionMode: acceptEdits
skills:
  - playwright-cli
mcpServers:
  - playwright
memory: project
maxTurns: 60
effort: high
---
```

**Permissions: what it may do without asking**

| Field | What it does | QA example |
|---|---|---|
| `disallowedTools` | Deny-list, applied before `tools`. Same syntax, MCP tools included. | Give the creator `Bash`, but never `git push`. |
| `permissionMode` | `default` (ask), `acceptEdits` (file edits without asking), `auto`, `dontAsk`, `plan` (read-only, proposes a plan), `bypassPermissions` (never ask). | A test creator with `acceptEdits` writes specs without a prompt for every file. A planner with `plan` cannot change anything. |

`permissionMode` is not a way around the user. When the main conversation already runs in
`acceptEdits`, `auto` or `bypassPermissions`, the sub-agent takes that mode and its own field is ignored.
And an agent cannot promote itself: one that declares `bypassPermissions` keeps the main conversation's
mode instead (Claude Code v2.1.267+).

**Knowledge: what it knows before the first step**

| Field | What it does | QA example |
|---|---|---|
| `skills` | A list of skills whose **full content** is loaded into the agent's context at start-up. This only preloads: without it the agent can still find and run project, user and plugin skills through the `Skill` tool. Remove `Skill` from `tools` to stop that. | A UI test creator preloads `playwright-cli`, so it already knows how to explore the page. |
| `mcpServers` | MCP servers for this agent only: a name of a configured server, or a full inline definition. | Only the Jira agent gets the Atlassian server. The main conversation does not pay its context cost. |
| `memory` | A memory folder that survives between runs. `user` → `~/.claude/agent-memory/<name>/`, `project` → `.claude/agent-memory/<name>/` (in git, shared with the team), `local` → `.claude/agent-memory-local/<name>/` (not in git). | A reviewer writes down recurring findings ("login tests forget cleanup") and checks them first next time. |

`memory` changes the rule "every run starts from zero". Without it an agent never learns: it makes the
same mistake in every run. With `project` memory the lessons go into git and the whole team gets them.
Review that folder like code, because the agent writes it and reads it as truth.

**Run control: how long, how hard, where**

| Field | What it does | QA example |
|---|---|---|
| `maxTurns` | Stops the agent after N turns. | A test-fix loop that cannot spin forever on a test that will not go green. |
| `effort` | `low` … `max`. How hard the model thinks, overriding the session setting. | `high` for a reviewer, `low` for an agent that moves a Jira ticket. |
| `background` | `true` always runs the agent in the background. | A long regression analysis while you keep working. |
| `isolation` | `worktree` runs the agent in a temporary git worktree, removed if nothing changed. | Two agents change test files in parallel without touching each other's files. |
| `hooks` | Hooks that fire only while this agent runs (`PreToolUse`, `PostToolUse`, `Stop`…). | Run `tsc --noEmit` every time the test creator edits a file. |

**Rarely needed, good to know**

| Field | What it does | QA example |
|---|---|---|
| `omitClaudeMd` | `true` starts the agent without the user, project and local `CLAUDE.md`. It works only from its prompt. | A Jira mover does not need 300 lines of repo rules. Smaller context, cheaper run. |
| `initialPrompt` | Sent as the first turn when the agent runs as the **main** session (`claude --agent <name>`). Commands and skills in it are run. | `claude --agent qa-lead` starts and runs `/qa-workflow` without typing it. |
| `experimental.cacheTtl` | `5m` or `1h`: how long this agent's prompt stays in the prompt cache. | `1h` for a long audit that pauses between steps, so the next step reads the cache cheaply. |

> **Plugin agents ignore `permissionMode`, `mcpServers` and `hooks`.** Somebody else wrote a plugin, so it
> cannot give itself permissions, servers or scripts. To use them, copy the agent into `.claude/agents/`.

### What a sub-agent does not get

- **Your conversation.** Only its prompt.
- **Your loaded skills.** A skill you ran in the main conversation is not in its context. It can load
  skills itself through the `Skill` tool, or start with the ones in `skills:`.
- **Your auto-memory.** Only its own `memory:` folder, if it has one.
- **Questions to the user.** It cannot ask you anything halfway through. When information is missing, it
  must stop and say so in its final message.

## Skill or sub-agent?

| | Skill | Sub-agent |
|---|---|---|
| Runs in | the main conversation | its own context |
| Sees your conversation | yes | no, only its prompt |
| Tools | yours | its own `tools:` list |
| Good for | a procedure you follow with the user | a self-contained task that returns one answer |
