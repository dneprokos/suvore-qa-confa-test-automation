# Claude Code and MCP

MCP (Model Context Protocol) is an open standard for plugging tools and data into a model. An MCP
**server** wraps a system — Jira, Slack, GitHub, a database, your own API — and offers it as named tools.
Claude Code is the **host**: it starts one **client** per server, discovers the tools, and lets the model
call them like its built-in `Read` or `Bash`. Write the server once and every MCP host can use it:
M clients × N tools becomes M + N.

## Architecture

```text
Claude Code (host)
├── client ──stdio──► slack-mcp-server       local process, started by Claude Code
├── client ──sse────► mcp.atlassian.com      remote, OAuth sign-in through /mcp
└── client ──stdio──► countries-mcp          your own FastMCP server (3_extend-mcp-tools)

1 initialize  → agree on capabilities
2 discover    → list tools, resources, prompts
3 call        → the model picks a tool, you approve it
4 result      → structured response returns to the context
```

| Server offers | What it is | Example in this repo |
|---|---|---|
| **tools** | Actions the model can call. | `mcp__atlassian__createJiraIssue` |
| **resources** | Read-only context, addressed by URI. | `countries://codes` in countries-mcp |
| **prompts** | Templates the server ships, exposed as slash commands. | `compare(a, b)` in countries-mcp |

A tool is always named `mcp__<server>__<tool>`. That name is what goes into permissions and into an
agent's `tools:` line.

## Transports

| Transport | Where the server runs | Use |
|---|---|---|
| `stdio` | A local process Claude Code starts. | Your own servers, npm or Python packages. |
| `http` | A remote URL, streamable, usually with OAuth. | Hosted SaaS servers. |
| `sse` | Remote, older protocol. | Deprecated. Use `http` if the server offers it. |

## Scopes — where a server is written

| Scope | File | Who gets it |
|---|---|---|
| `local` (default) | `~/.claude.json`, under this project's path | You, this project only. |
| `project` | `.mcp.json` at the repo root, committed | Everyone who clones the repo (they approve it once). |
| `user` | `~/.claude.json`, global section | You, in every project. |

Same name in two scopes: local beats project, project beats user. Team servers go in `.mcp.json`;
anything carrying your own key stays `local`.

This repo's `.mcp.json` keeps the secret out of git by expanding environment variables:

```json
"slack": {
  "command": "npx",
  "args": ["-y", "slack-mcp-server@latest", "--transport", "stdio"],
  "env": {
    "SLACK_MCP_XOXB_TOKEN": "${SLACK_MCP_XOXB_TOKEN}",
    "SLACK_MCP_ADD_MESSAGE_TOOL": "${SLACK_TRIAGE_CHANNEL_ID}"
  }
}
```

`SLACK_MCP_ADD_MESSAGE_TOOL` holds a channel id, not `true`: the server may post to that channel and no
other. That's least privilege set in the server itself, before the model is involved.

## Commands

```bash
claude mcp add --transport sse atlassian https://mcp.atlassian.com/v1/sse           # remote, local scope (as in .mcp.json)
claude mcp add --scope project countries -- python path/to/countries_mcp.py          # stdio, shared
claude mcp add --scope user github --env GITHUB_TOKEN=... -- npx -y @modelcontextprotocol/server-github
claude mcp list                      # what resolved, from which scope
claude mcp get atlassian             # one server's config
claude mcp remove countries
```

Inside a session: `/mcp` shows each server's status, signs you in to OAuth servers and lists their tools.

## Demo — the add, check, use, approve loop

```text
/mcp
```

Show Atlassian and Slack connected, and the tool count per server.

```text
Which SCRUM bugs are open and have no Defect Detection Phase set? One line each: key, summary, age.
```

No tool named in the prompt. The model picks `mcp__atlassian__searchJiraIssuesUsingJql` itself, asks
you to approve the first call, and answers from live data.

```text
/context
```

The MCP tools cost **no context until they are called**. They are loaded on demand.

## What to point at

- **The model never changes.** Adding a server adds tools. Nothing is retrained or re-prompted.
- **A server is code you run.** Read the source of a community server before you connect it. The
  catalogues are `github.com/modelcontextprotocol/servers`, `modelcontextprotocol.io` and `smithery.ai`.
- **Tool results are untrusted input.** A Jira description or a Slack message can carry instructions.
  See `9_security`.
- Next: `3_extend-mcp-tools` adds a tool to your own FastMCP server, and `3_mcp_and_skill` combines a
  server with a skill.
