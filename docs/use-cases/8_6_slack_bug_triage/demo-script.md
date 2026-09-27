# Use case 7 — Slack bug triage: from a chat message to a Jira ticket

**Idea to land with the audience:** people report bugs in Slack, not in Jira. One command reads the
`#bug-reports` channel, turns each new message into a bug draft, asks Jira whether it already exists, and
then either files a new SCRUM bug or points the reporter at the existing one — replying in the thread and
marking the message with an emoji every time.

```
Slack message ──► draft ──► duplicate search in SCRUM ──► file new bug  ─┐
                                                      └─► "already tracked" ─┴─► threaded reply + emoji
```

Demo time: ~10 minutes (2 prep, 1 dry run, 5 real run, 2 show-and-tell).

---

## 0. Before the talk (once, off stage)

| Check | How |
|---|---|
| Slack env vars are set in the OS (not `.env`) | `SLACK_MCP_XOXB_TOKEN`, `SLACK_TRIAGE_CHANNEL_ID`, `SLACK_TRIAGE_SELF_USER_ID` |
| Posting and reacting are enabled | `SLACK_MCP_ADD_MESSAGE_TOOL` and `SLACK_MCP_REACTION_TOOL` = the channel id |
| The bot is in the channel | in `#bug-reports`: `/invite @<app-name>` |
| MCP servers are connected | in Claude Code: `/mcp` → `slack` and `atlassian` both *connected* |
| The ledger is healthy | `node scripts/slack-triage-journal.mjs validate` |

If `/mcp` shows `slack` missing, add `"slack"` to `enabledMcpjsonServers` in `.claude/settings.local.json`
and restart Claude Code.

---

## 1. Post bug reports to `#bug-reports`

Post them **from your own Slack user, not from the bot** — the run ignores messages written by
`SLACK_TRIAGE_SELF_USER_ID`, so that it never files a ticket about its own reply.

Post each block below as a **separate top-level message** (not in a thread). Each one shows a different
path through the workflow. Message A alone is enough for a short demo.

### Message A — an existing bug (→ duplicate path)

A copy of the report that became **SCRUM-173**. A new message has a new timestamp, so the ledger treats it
as untouched work, and the duplicate search should find SCRUM-173 at `high` confidence.

```text
PUT /api/games/:id copies req.body into the document wholesale, allowing fields the form never exposes to be overwritten

*Initial Condition:*
• Two Admin accounts exist, A and B.
• A game created by Admin A exists; note its `_id` and its `createdBy`.
• Signed in as Admin B.

*Steps to Reproduce:*
1. Read the game via GET /api/games/<gameId> and note the `createdBy` attribution.
2. As Admin B, send PUT /api/games/<gameId> with a body containing a field the Edit Game form does not expose: {"rating":9,"createdBy":"<adminB-userId>"}
3. Read the game again and compare `createdBy`.
4. Repeat with other non-form fields, e.g. {"createdAt":"1990-01-01T00:00:00.000Z"}.

*Expected Results:*
Only the fields the update contract declares — name, genre, platforms, releaseDate, hasMultiplayer, description, imageUrl, rating — are applied. `createdBy` and the timestamps are server-owned and ignored, or the request is rejected.

*Actual Results:*
Every property in the body is assigned to the document. `createdBy` is rewritten, so the audit trail now shows Admin B as the creator of Admin A's record. `createdAt` can likewise be backdated.
```

### Message B — a thin report (→ "tell me more" path)

No steps, no expected result. Nothing is filed; the bot asks one question in the thread, naming exactly the
missing fields.

```text
Owner panel is broken again, the admins table looks wrong after I add someone. Please fix asap
```

### Message C — optional, a new bug (→ file path)

The known `lastLogin` defect the UI suite asserts against (`tests/ui/owner.spec.ts`). If SCRUM already has a
ticket for it, the run will route it as a duplicate instead — both outcomes are a fine demo, just say which
one you expect before you run it.

```text
Owner Panel shows a login date for an admin who has never logged in

*Steps to Reproduce:*
1. Sign in as the Owner and open the Owner Panel.
2. Add a new admin with a fresh e-mail and a valid password.
3. Look at the "Last login" cell of the new admin's row, without ever signing in as that admin.

*Expected Results:*
"Last login" shows "Never" for an admin who has not signed in yet.

*Actual Results:*
"Last login" shows today's date — the moment the admin was created — as if they had already logged in.
```

---

## 2. Rehearse without side effects (optional, 1 minute)

```text
/slack-bug-triage --dry-run
```

Reads the channel and drafts the bugs for real, but writes **nothing** to Slack, Jira or the ledger. It
prints the JQL it would run, the Jira payload it would send and every Slack reply it would post. Good moment
to show the audience the drafts before anything is irreversible.

## 3. Run it for real

Manual mode — asks you before every ticket, which is what you want on stage:

```text
/slack-bug-triage --since 1d --max-triage 3
```

Auto mode — routes on the duplicate verdict with no approval, capped at `--max-files`:

```text
/slack-bug-triage --auto --since 1d --max-triage 3 --max-files 1
```

`--since 1d` keeps older channel history out of the demo. `--max-triage 3` matches the three messages above (it is not in the argument hint, but the skill reads it as a named parameter; default is 5 anyway).

---

## 4. What to show, in order

### 4.1 The parameter banner (terminal)

Printed before anything runs. Point at the **source** column — `request`, `env`, `default` — and at
*Non-default settings this run*: every value nobody chose is visible, e.g. `detection_phase Production`.

### 4.2 The claim mark (Slack)

Within seconds every claimed message gets 👀 `eyes`. That is the "somebody is on it" signal for the reporter.

### 4.3 The routing decision (terminal)

For each message the run shows the draft summary, the Jira candidates it found and the verdict:

| Message | Expected verdict | What happens |
|---|---|---|
| A | `duplicate`, `high`, SCRUM-173 | no ticket; thread reply "already tracked as SCRUM-173"; 💡 `bulb` |
| B | `thin` — missing `steps`, `expected`, `actual` | no ticket; one thread question listing the missing fields; ❓ `question` |
| C | `new` (or duplicate if already filed) | manual mode asks *Create / Mark duplicate / Skip this one / Decline the rest of the run*; on Create → new SCRUM bug; ✅ `white_check_mark` |

In manual mode you get one question per message: pick *Mark duplicate* for A and *Create* for C, and let
the audience read the preview (summary, priority, phase, verdict, the reply to be posted) before you click.

### 4.4 The Slack thread replies

Open each message's thread. Every reply ends with `_(automated triage)_` — that marker is how the next run
knows not to triage its own replies.

### 4.5 The Jira ticket (browser)

Open the new SCRUM bug from the filed-reply link. Point at:

- the `slack-<channel>-<ts>` label — idempotency: the run searches for it before every create, so even a
  lost ledger or a second laptop cannot file the same message twice;
- **Defect Detection Phase = Production** — set by the run, not left to Jira's `Development` default;
- the Slack permalink under evidence.

### 4.6 The ledger and the run folder (repo)

```bash
tail -n 6 .slack-triage/journal.jsonl
ls .slack-triage/runs/<BUGTRIAGE-YYYYMMDD-NN>/
```

`journal.jsonl` is the real state (tracked in git); the emoji are only decoration, because the Slack MCP
server cannot read reactions back. The run folder holds `intake.json`, the drafts and `verdicts.json` — the
full paper trail of the decision.

### 4.7 The punchline — run it again

```text
/slack-bug-triage --since 1d
```

Nothing new is triaged, nothing is re-filed, nobody is asked the same question twice. The skip filter is a
script (`scripts/slack-triage-journal.mjs plan`), not the model's judgement.

---

## 5. Talking points

- **Five small agents, one orchestrator.** Split by tool grant: Slack read, drafting (no external access at
  all), Jira read, Jira create, Slack write. The agent that files a bug can file exactly one and nothing else.
- **Humans stay in control of anything irreversible.** Manual mode asks before every ticket; auto mode acts
  only on a `high`-confidence duplicate, escalates `medium`/`low`, and caps new tickets with `--max-files`.
- **A duplicate never touches the existing ticket** — no comment, no transition. A wrong match is undone by
  removing one emoji.
- **Thin reports get one question, once.** The missing-field set is hashed, so the bot never nags.

---

## 6. Reset between rehearsals

- Delete the demo messages in Slack (their threads go with them).
- Delete or close any SCRUM bug the rehearsal filed — otherwise message C becomes a duplicate next time.
- **Do not hand-edit `.slack-triage/journal.jsonl`.** New messages get new timestamps, so the old rows never
  block a fresh demo.

## 7. If something goes wrong on stage

| You see | Meaning | Fix |
|---|---|---|
| `not_in_channel` | the bot was never invited | `/invite @<app-name>` in the channel, run again |
| `SLACK_WRITE_FORBIDDEN` | the token reads but cannot post or react | check the two `SLACK_MCP_*_TOOL` variables, restart Claude Code |
| nothing in scope | messages older than `--since`, or posted by the bot user | post again from your own user, or widen `--since` |
| `claim` exits `4` | another run still holds a 30-minute lease | wait for the lease to expire, then run the same command again |
| duplicate at `medium`/`low` in auto mode | escalated, no reply | expected behaviour — show it as the safety net |
