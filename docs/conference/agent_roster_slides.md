# Agent & Skill Roster — Slide Notes

Key notes only. Full specs: [`agent_build_plan.md`](./agent_build_plan.md).

---

## Agents

### `qa-requirements-collector`
**In:** ticket id → **Out:** requirements doc + ticket In Progress
- Jira ticket → structured requirements document
- One of two agents with Jira access — the intake end
- Never invents an acceptance criterion

### `qa-requirements-reviewer`
**In:** requirements doc → **Out:** five QA sections appended to it
- Finds what the ticket forgot to say
- Append-only — holds `Edit`, not `Write`
- Reports gaps, never fills them

### `qa-scenario-generator`
**In:** requirements doc → **Out:** test design doc
- Requirements → traceable scenarios
- ISTQB techniques: EP, BVA, decision tables, state transition
- Scenarios derived from models, not invented then labelled
- Every status code traceable to the source

### `qa-scenario-classifier`
**In:** test design → **Out:** same doc, level per scenario
- Assigns the lowest practical test level
- Appends `Assigned Level:`, never overwrites the suggestion
- Routes non-E2E work out of this repo

### `qa-scenario-reviewer`
**In:** test design + requirements → **Out:** verdict + `[DESIGN-*]` findings
- Independent gate before a single test is written
- 18 criteria — 13 on scenarios, 5 on the models behind them
- Recomputes coverage; the document's own matrix is a claim, not evidence
- Pass / Needs Revision / Blocked

### `aqa-api-test-creator`
**In:** test design → **Out:** `tests/api/**` + implementation report
- E2E API scenarios → Playwright API tests
- Test design is the only spec it reads
- Reuses the existing facade and builder layers
- Runs the suite itself, reports what it observed

### `aqa-ui-test-creator`
**In:** test design → **Out:** `tests/ui/**`, `pages/**` + implementation report
- E2E UI scenarios → Playwright UI tests + page objects
- Explores the app for locators only, never expected values
- `getByTestId` / `getByRole` only
- A missing hook is a gap to report, not a CSS selector to write

### `aqa-api-test-reviewer` · `aqa-ui-test-reviewer`
**In:** implementation report + test design → **Out:** verdict + `[API-*]` / `[UI-*]` findings
- Two questions: everything implemented? code follows house style?
- No `Edit`, no `Write` — by design
- Re-runs the suite itself, does not trust the report
- Best check: "claimed implemented, but asserts something else"

### `git-change-analyst`
**In:** working tree → **Out:** proposed commit message + PR facts
- Reads the diff in its own context — main thread never sees it
- Proposes a commit message, commits nothing
- Secret in the change set → blocked, no message proposed

### `qa-jira-transition`
**In:** ticket id + PR URL → **Out:** PR comment + ticket In Review
- The return leg: the run ends on the ticket it started from
- The other agent with Jira access — and **no filesystem tools at all**
- Comment first, transition second: a failed move still leaves the link
- `pr_url` of `none` → abort before the first tool call
- Re-run → `EXISTS`. Reads the ticket's comments to know, never trusts the caller

---

## Skills

### `qa-workflow` — the lead orchestrator
**In:** ticket id + mode → **Out:** state file, a PR, and the ticket back in In Review
- Skill, not an agent: subagents cannot spawn subagents
- The only file that names one agent next to another
- **Manual mode** — pause after every agent, user picks the transition
- **Auto mode** — routes on the verdict, 2 iterations, then escalate
- Owns state and counters. Does none of the work

### `qa-ship-tests`
**In:** both reviews + both reports → **Out:** PR URL
- Gate: reviewed tests → one pull request
- Reads the files. Files beat a caller's claim
- Runs no git command of its own
- A red, documented test still ships

### `git-workflow-orchestrator`
**In:** branch name + commit message → **Out:** per-phase status + PR URL
- Branch → Commit → Push → PR
- Status per phase, stop on first failure
- Holds no QA knowledge — which is why it is reusable

### `git-branch-creator` · `git-commit-creator` · `git-push-creator` · `git-pr-creator`
**In:** one phase's parameters → **Out:** that phase, done
- One irreversible action each, each behind a human OK
- Auto mode does not strip the confirmations

### `playwright-cli`
**In:** a URL and a session name → **Out:** snapshots and selectors
- Browser access for the UI stream
- Rides on `Bash` — the tool table cannot express this boundary
- Reviewers hold it and must not use it

---

## Hooks

### `agent-metrics.mjs` — `PostToolUse` on `Task`
**In:** the harness's own result object → **Out:** one line in `.workflow/metrics/<TICKET-ID>.jsonl`, one line in the transcript
- Tokens, duration, tool count — per agent run
- **No agent can measure itself**: the numbers are computed after the subagent has already stopped
- Nor can the caller — the `Task` result hands the model text and nothing else
- So the measurement comes from outside the conversation. That is what a hook is for
- Emits `AGENT_RUN_METRICS:` as `additionalContext`, so it lands right after that agent's receipt
- Swallows every error, exits `0`. Metrics never fail a run

### `metrics-report.mjs` — the end-of-run table
**In:** ticket id → **Out:** cost table
- One row per run, in completion order — a 3-iteration loop is 3 rows
- `n/N` per agent, `Σ` total, wall clock
- Sum of durations > wall clock = the parallel Phase 2 streams
- Cost is reported, never routed on. Verdicts route; numbers narrate

---

## Five rules that hold it together

1. **No agent names another agent.** Routing lives in one skill.
2. **Reviewers hold no `Edit`.** One that can fix things returns Pass, and the signal disappears.
3. **`EXISTS`.** Re-invoked with nothing new, an agent changes nothing.
4. **Findings carry stable ids.** `[API-C1]` survives every iteration.
5. **The red-test rule.** Weakening an assertion to go green is Critical.

---

| | |
|---|---|
| Subagents | 11 |
| Skills | 8 |
| Hooks | 1 (+1 reporting script) |
| Agents that can write to Jira | 2 — one per end of the run |
| Agents that can write test code | 2 |
| Reviewers that can edit anything | 0 |
| Agents that can report their own cost | 0 |
| Review iterations before escalation | 2 |
| Pull requests per ticket | 1 |
