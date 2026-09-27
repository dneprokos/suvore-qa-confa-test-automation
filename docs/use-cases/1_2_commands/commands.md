# Claude Code built-in commands

Type a command at the start of the prompt. Typing `/` on its own, or `/help`, shows the full list.

## Context and conversation

| Command | What it does | When to use it |
|---|---|---|
| `/context` | Shows how the context window is being used, split by system prompt, tools, MCP servers, memory files and messages. | Claude has started to feel slow or forgetful and you want to know what is taking up space. |
| `/compact [instructions]` | Replaces the conversation with a summary to free context. Optional instructions say what the summary must keep. | A long session where the earlier details still matter, e.g. `/compact keep the failing test names`. |
| `/clear` | Clears the conversation history and starts fresh in the same session. | You are moving to an unrelated task and don't want the old context steering the new one. |
| `/rewind` | Rolls the conversation and the code changes back to an earlier point. `Esc` `Esc` opens it too. | Claude went down the wrong path and you want to undo it rather than argue it back. |
| `/resume` | Lists previous conversations and reopens the one you pick. | You closed the terminal and want to carry on where you stopped. |
| `/export` | Exports the current conversation to a file or the clipboard. | Sharing a session with a colleague, or keeping it as a demo record. |

## Extending Claude

| Command | What it does | When to use it |
|---|---|---|
| `/agents` | Creates, edits and lists subagents: specialised assistants with their own prompt, tools and model. | Building a focused helper such as a flaky-test triager or a test reviewer. |
| `/skills` | Lists the skills available in this session: personal, project and plugin ones. | Checking that a skill you just added was picked up. |
| `/mcp` | Shows the connected MCP servers and their status, and handles authentication. | A Jira, Slack or GitHub tool is missing, or a server needs you to log in. |
| `/plugin` | Browses marketplaces and installs, enables or removes plugins. | Installing a packaged set of skills, agents and hooks in one step. |
| `/hooks` | Shows the configured hooks: which event runs which command. | Checking what runs automatically before or after Claude uses a tool. |

## Project and memory

| Command | What it does | When to use it |
|---|---|---|
| `/init` | Scans the repository and writes a `CLAUDE.md` describing it. | The first session in a new repository, so later sessions start with the project's commands and rules. |
| `/memory` | Opens the `CLAUDE.md` memory files for editing. | Adding a rule Claude keeps forgetting, e.g. "never use `waitForTimeout`". |
| `/add-dir` | Gives Claude access to another folder in addition to the current one. | The tests live in one repository and the application code in another. |

## Control and safety

| Command | What it does | When to use it |
|---|---|---|
| `/permissions` | Sets which tools and commands Claude may run without asking, and which are always denied. | Allowing `npx playwright test` without a prompt each time, while keeping `git push` behind approval. |
| `/model` | Switches the model for the session: Opus, Sonnet or Haiku. | A bigger model for design work, a cheaper one for routine edits. |
| `/config` | Opens the settings: theme, default model, notifications and more. | Adjusting Claude Code to your setup. |
| `/code-review` | Reviews the current changes for bugs. | A second opinion before you open a pull request. |

## Cost and health

| Command | What it does | When to use it |
|---|---|---|
| `/cost` | Shows the token usage and cost of the current session. | Seeing what one task actually cost. |
| `/usage` | Shows how much of your plan's usage limits you have used. | Before starting a long multi-agent run. |
| `/doctor` | Checks the installation and configuration for problems. | Something behaves oddly, e.g. on a freshly set-up demo machine. |
| `/exit` | Exits Claude Code. | Done for now. `/resume` brings the conversation back later. |

## Keyboard shortcuts and prefixes

| Input | What it does |
|---|---|
| `Shift+Tab` | Cycles the permission mode, including plan mode, where Claude plans without editing anything. |
| `Esc` | Stops Claude mid-answer. |
| `Esc` `Esc` | Opens `/rewind`. |
| `!` at the start of a prompt | Runs a shell command directly, and its output lands in the conversation. |
| `@` | Mentions a file or folder so it is pulled into context. |
