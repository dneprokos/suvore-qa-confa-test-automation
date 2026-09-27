# Claude clients — one model, many front doors

The model is the same everywhere. What changes is the client around it: which tools it can reach, where
it runs, and whose files it can touch. Everything in this talk runs in **Claude Code**, because it is the
client that works inside a repository.

## Chat clients — talk to Claude

| Client | Where | Good for |
|---|---|---|
| **claude.ai** | Browser | Questions, drafts, reviewing a pasted ticket or log, artifacts. |
| **Claude desktop app** | macOS, Windows | The same chat, plus local MCP servers, a built-in browser pane and computer use. |
| **Claude mobile** | iOS, Android | Quick questions and voice on the go. |

## Claude Code — let Claude work in your repo

One agent, several surfaces. `CLAUDE.md`, skills, sub-agents, hooks, MCP servers and plugins work the same
way in each.

| Surface | Where | Good for |
|---|---|---|
| **CLI** | Any terminal: `claude` | The full feature set. Everything in this talk. |
| **IDE extensions** | VS Code, JetBrains | The same agent next to your editor, with diffs shown in the IDE. |
| **Desktop app** | macOS, Windows | Claude Code sessions without a terminal. |
| **Web** | `claude.ai/code` | Runs in a cloud sandbox against a GitHub repo. Nothing installed locally. |

## Claude inside other tools

| Client | Where | Good for |
|---|---|---|
| **Claude in Chrome** | Browser extension | Claude drives your real Chrome, with your own sign-ins. |
| **Claude in Slack** | Slack workspace | Mention Claude in a channel or thread. |

## Build your own client

| Option | Good for |
|---|---|
| **Claude API** | Calling the model from your own code: a test-data generator, an LLM-as-judge check. |
| **Claude Agent SDK** | Building your own agent on the same loop that runs Claude Code. |

## Which one for QA work

- **Asking, explaining, drafting:** any chat client.
- **Reading the code, writing tests, running them, opening the PR:** Claude Code. Only it sits in the repo
  and can run `npx playwright test`.
- **A check that runs in CI with no human present:** the API or the Agent SDK.
