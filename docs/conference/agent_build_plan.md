# Agent Build Plan

Implementation plan for the roles defined in [`agentic_workflow.txt`](./agentic_workflow.txt).

That document is the **specification** — what each agent is for. This document is the **build order** — how each agent gets created, in what sequence, and what proves it works.

Rule for every agent below: its `.claude/agents/<slug>.md` body is derived from the matching `Goal / Inputs / Outputs / Done when / Must not` block in the workflow spec. If the two disagree, the workflow spec wins and the agent file gets fixed.

One exception, decided after the spec was written: the **agent interface contract** below overrides both documents. Where the spec describes an agent by naming its neighbours, the agent file describes the same behavior without them.

---

## Agent Interface Contract

No agent knows another agent exists. Each one is a pure function of its parameters and the files on disk.

This is not a style preference — it is what makes an agent independently callable, independently testable, and replaceable without editing its siblings. An agent that ends with `NEXT: qa-scenario-classifier` has hard-coded a routing decision that belongs to the orchestrator, and it becomes wrong the moment the workflow changes shape.

Every agent body therefore carries:

1. **An `# Inputs` table** — parameter name, required or not, accepted form, and the fallback when absent. The caller may be a human typing a slash-style request or the orchestrator passing parameters; the agent cannot tell the difference and must not care.
2. **Path parameters with visible defaults.** The canonical path template stays written out in the body (`requirements/<TICKET-ID>-requirements.md`), with the parameter as an override: *"or `requirements_path` when your caller supplied one."* Dropping the template in favour of a bare parameter name makes the agent unusable without an orchestrator — the conventions must stay readable in the file.
3. **No sibling agent names** in the description, the body, the receipt, or the `Must not` list. Documents are referred to by path and shape; other actors are "your caller", "whoever produced it", "a later classification step".
4. **No `NEXT:` field.** Each receipt ends with `Your caller decides what happens next. Do not name a next step, and do not recommend one.`
5. **Ownership rules stated structurally.** "Do not overwrite `Suggested Level:`" is enforceable by any reader; "that is `qa-scenario-classifier`'s job" is not.

Self-reference is fine and stays: `generated_by: qa-scenario-generator` in front matter, `_Inferred by qa-requirements-collector._` in provenance markers. An agent may name itself; it may not name a peer.

**Consequence for the orchestrator.** All routing knowledge now lives in one place — the `qa-workflow` skill. It owns which agent runs when, what `review_findings` get passed back to whom, and the iteration counter. That concentration is the point.

---

## Current State

_Last refreshed: 2026-08-06._

| Item | Status |
|---|---|
| `playwright.config.ts` | `baseURL` and `headless` wired to `Config`, `testDir: ./tests`, `fullyParallel`. Still a single `chromium` project — the api/ui project split in §0.2 was **not** done and is no longer needed; the streams are separated by directory (`tests/api`, `tests/ui`) instead. |
| `tests/api/` | `login-api.spec.ts` — 3 real tests |
| `tests/ui/` | `login.spec.ts`, `owner.spec.ts` — real tests, including the `lastLogin` known-defect assertion |
| `tests/example.spec.ts` | Deleted |
| `package.json` | Still no scripts. Commands are run directly: `npx playwright test tests/api`, `npx playwright test tests/ui`, `npx tsc --noEmit`. §0.3 was **not** done; the agents are written against the real commands. |
| Framework | `fixtures/` (api + pages), `pages/` (3 page objects), `services/api/` (facade → controllers → builders → `endpoints.ts` → `toApiResult`), `framework/configuration/config.ts` (Joi-validated `.env`). Note the shape differs from §0.1 — there is no `tests/fixtures/` and no `tests/pages/`. |
| `.mcp.json` | `atlassian` SSE server, enabled in `.claude/settings.local.json` |
| `.claude/agents/` | All five Phase 1 agents built: `qa-requirements-collector`, `qa-requirements-reviewer`, `qa-scenario-generator`, `qa-scenario-classifier`, `qa-scenario-reviewer`. All four Phase 2 agents built: `aqa-api-test-creator`, `aqa-ui-test-creator`, `aqa-api-test-reviewer`, `aqa-ui-test-reviewer`. All nine carry the `# Inputs` contract and name no sibling. A tenth, `git-change-analyst`, was added after the ship-phase split (see below) — read-only, `Read, Grep, Glob, Bash`, writes nothing. |
| `.claude/skills/` | In-repo: `git-branch-creator`, `git-commit-creator`, `git-pr-creator`, `git-push-creator`, `git-workflow-orchestrator`, `playwright-cli`, `qa-ship-tests`, `requirements-reviewer` (interactive copy), `skill-creator`, `skill-validator`. Phase 0.7 is **done**. `qa-workflow` (the orchestrator) is the one skill still missing. |
| `requirements/` | `SCRUM-139-requirements.md` present, in the canonical `qa-requirements-collector` shape (front matter, `### FR-11.x` / `### AC-1` blocks). |
| `test-design/` | Does not exist yet — created by the first `qa-scenario-generator` run. Both SDETs abort with `NO_TEST_DESIGN` until it does. |
| `.workflow/` | Does not exist yet — created by the first SDET run, which writes `.workflow/reports/<TICKET-ID>-<stream>-implementation.md`. Add it to `.gitignore` before the first commit. |
| `.claude/settings.local.json` | `permissions.allow` covers `Write`/`Edit` on `requirements/**`, `test-design/**`, `tests/**`, `pages/**`, `services/**`, `fixtures/**`, `.workflow/**`, plus `npx playwright *`, `npx tsc *`, the `curl` preflight, the read-only Atlassian tools and `transitionJiraIssue`. |
| `CLAUDE.md` | Written. Covers the fixture chain import rule, the API facade layering, locator and wait policy, and the test conventions — this is what §0.4 asked for, and it is what both SDETs and both reviewers key off. |

---

## Phase 0 — Prerequisites

`aqa-api-test-creator` and `aqa-ui-test-creator` are instructed to "follow existing project conventions." No conventions exist yet, so they would invent a new structure on every run and the reviewers would have no standard to review against. Phase 0 removes that.

> **Superseded, 2026-08-06.** §0.1–§0.4 were written before the suite existed. The suite that got built
> does not have the shape they sketch: fixtures live in `fixtures/`, page objects in `pages/`, the API
> layer in `services/api/`, there are no npm scripts, and there is no api/ui project split — the streams
> are separated by directory. The intent of Phase 0 is satisfied (real reference tests exist, `CLAUDE.md`
> is written), and the Phase 2 agents are written against the **actual** repository, not against these
> sections. Read §0.1–§0.3 as history. The commands the agents use are:
>
> ```bash
> npx playwright test tests/api --reporter=line
> npx playwright test tests/ui --reporter=line
> npx tsc --noEmit
> ```

### 0.1 Framework skeleton

Hand-write these. Do not generate them with an agent — they are the reference shape everything else copies.

```text
tests/
  api/
    resources/create-resource.spec.ts     # 1 real API test
  ui/
    resources/resource-list.spec.ts       # 1 real UI test
  fixtures/
    api-client.ts                         # request wrapper, auth, base path
    test-data.ts                          # factory + cleanup helpers
  pages/
    resource-list.page.ts                 # 1 page object
```

Requirements for the skeleton:

* One API test and one UI test that pass against a real target.
* Each demonstrates the assertion style, naming style, and data cleanup you want repeated.
* No `page.waitForTimeout`, no CSS/XPath selectors in specs — role/label-based locators only.

### 0.2 `playwright.config.ts`

* Set `baseURL` (and an API base URL, via env).
* Split into two projects, `api` and `ui`, with `testDir` scoped to `tests/api` and `tests/ui`.
  Reviewers and SDETs both key off this split; without it the "must not touch the other stream" boundary is unenforceable.
* Delete or relocate `tests/example.spec.ts` — it sits directly in `testDir` and would be picked up by both projects.

### 0.3 `package.json` scripts

Agents need one command per action. Free-form `npx playwright test --grep ...` invention is a review nightmare.

```json
{
  "scripts": {
    "test:api": "playwright test --project=api",
    "test:ui": "playwright test --project=ui",
    "test": "playwright test",
    "lint": "tsc --noEmit"
  }
}
```

### 0.4 `CLAUDE.md`

Single conventions file both SDETs write against and both reviewers review against. Must cover:

* Directory layout and where a new test file goes.
* Naming convention for test titles and files.
* Locator policy (roles/labels; no raw CSS/XPath in specs).
* Wait policy (auto-waiting and web-first assertions only; no fixed sleeps).
* Test data policy (create own data, clean up, no shared mutable state).
* Which npm script to run for which change.
* Secrets policy — env vars only, never literals.

### 0.5 Working directories

```text
requirements/          # qa-requirements-collector output
test-design/           # qa-scenario-generator + qa-scenario-classifier output
.workflow/             # qa-lead state, one <TICKET-ID>.yaml per ticket
```

Add `.workflow/` and `playwright-report/`, `test-results/` to `.gitignore`.

### 0.6 Demo Jira ticket

One real ticket in the configured Todo queue, with a description and acceptance criteria substantial enough to produce ~10 scenarios across all five testing levels. Everything downstream is validated against this ticket.

**Selected: `SCRUM-139`** — "List and create admin accounts" (epic `SCRUM-94`, F-11 Owner Panel). Four functional requirements covering list ordering, creation, field validation, and cross-role uniqueness, plus one UI acceptance criterion. Good demo shape: it splits naturally into E2E API (FR-11.1–11.4) and E2E UI (the AC) streams, and its single acceptance criterion against four FRs is a real coverage gap for `qa-requirements-reviewer` to find.

`requirements/SCRUM-139-requirements.md` is already written and serves as the `qa-requirements-collector` output reference.

### 0.7 Skill portability decision — **done**

The four `git-*` skills and `git-workflow-orchestrator` have been copied into `.claude/skills/`, so a fresh clone has a working git workflow phase. Verified present: `git-branch-creator`, `git-commit-creator`, `git-pr-creator`, `git-push-creator`, `git-workflow-orchestrator`.

They arrived pointing at `./.github/skills/...`, a folder this repository does not have, which meant the orchestrator's script-driven path could not run at all — `run-git-ship-workflow.ps1` resolved its four child scripts under `.github/skills` and died on "Missing script". Every path in all five skills is now hard-coded to `.claude/skills`, and the same fix is applied to the user-level copies under `~/.claude/skills/git-*` so the two installs match. A three-root resolver (`.claude` → `.github` → `.cursor`) was built and then dropped in favour of the single literal path: this repository is Claude-only, and one hard-coded root is easier to read from a stage than a probe.

The consequence to keep in mind: a Copilot or Cursor checkout that stores skills under `.github/skills` or `.cursor/skills` will not resolve these scripts. That is accepted.

Still worth re-checking before the conference: the fresh-clone test under [Cross-Cutting Checks](#cross-cutting-checks) is what actually proves portability, since a skill can be present but still reference a user-level path.

The `requirements-reviewer` skill is no longer part of this decision — the reviewer is built as the agent `qa-requirements-reviewer` instead, and the installed skill stays where it is, under its original name, for interactive use.

---

## Roster: Build vs Reuse

| Slug | Action |
|---|---|
| `qa-lead` | **Build as a skill, not a subagent** — see note below |
| `qa-requirements-collector` | Build |
| `qa-requirements-reviewer` | **Build** — the existing skill does not fit a subagent (see below) |
| `qa-scenario-generator` | Build |
| `qa-scenario-classifier` | Build |
| `qa-scenario-reviewer` | Build |
| `aqa-api-test-creator` | Built |
| `aqa-ui-test-creator` | Built |
| `aqa-api-test-reviewer` | Built |
| `aqa-ui-test-reviewer` | Built |
| `git-workflow-agent` | **Reuse** existing `git-workflow-orchestrator` skill, wrapped by `qa-ship-tests` |
| `git-change-analyst` | **Build** — not in the workflow spec; the read-only half of the git-row split |

10 agents to build — all 10 built. 1 orchestrator skill (`qa-workflow`, not yet built), 1 reused skill.

### Why the git row became a skill, not an agent

The workflow spec lists `git-workflow-agent` as an actor, but nothing about it wants to be a subagent.
It performs no analysis, produces no judgement, and needs to invoke four other skills — which a subagent
cannot do, because no agent file grants `Skill` and skills are invisible to them.

`.claude/skills/qa-ship-tests/SKILL.md` is the deliverable instead: a main-thread skill that owns the
**gate** (both reviews `Pass`, both reports current, every reported file on disk), the **naming**
(`test/<TICKET-ID>-e2e-automation`), and the **PR body** built from the reports and the test design.
The git operations themselves are delegated phase by phase to `git-workflow-orchestrator`, unchanged.

Splitting it this way keeps the reusable git skills free of QA-workflow knowledge, and puts the one
irreversible action in the workflow behind a gate that reads files rather than trusting a caller's
claim that both reviews passed.

### …and why one read-only agent came back

The split above is right about the mutations and wrong about the reading. Committing needs two user
confirmations (stage-all, then message OK / Not OK) and opening a PR needs a third; a subagent can ask for
none of them, which is why the four `git-*` skills stay skills and stay on the main thread.

But the *reading* — `git status`, the staged diff, the commit subjects ahead of base — has the opposite
shape. It is the single largest context cost in the ship phase, it produces a short answer, and it needs no
human. That is precisely what a subagent is for. `git-change-analyst` runs in its own context, reads the
change set, and returns one receipt: a proposed Conventional Commits message, the file lists, the PR facts
and a secret warning. The main thread never sees the diff, and both confirmations stay exactly where they
were.

It is deliberately **not** wired into `qa-ship-tests` composition. That skill builds its message from the
implementation reports and the test design — scenario ids, execution counts and review verdicts that appear
in no diff — so a diff-reading agent would produce a worse message from more work. Its use there is the
narrow one: confirming the working tree holds nothing neither report claims.

Its primary consumer is `git-commit-creator` step 2a, not `git-workflow-orchestrator`. The orchestrator
reads no diff of its own — its agent-driven Phase 2 says "follow `git-commit-creator`" — so the delegation
belongs one level down, where the read actually happens, and the ad-hoc `/git-commit-creator` case gets it
too. It is a **preferred path, not a dependency**: the four `git-*` skills are cross-tool in origin (their
READMEs call them Copilot skills) and a runner without subagents has nothing to delegate to, so step 2b
keeps the preview script as the fallback. In this repository the point is now partly moot — script paths
are hard-coded to `.claude/skills`, so a Copilot or Cursor checkout would not resolve them anyway — but the
2a/2b split costs nothing and keeps the skill runnable wherever its scripts are.

### Why `qa-requirements-reviewer` is built, not reused

Note the two names. The **agent** is `qa-requirements-reviewer`; the **skill** keeps its original name, `requirements-reviewer`. Before the `qa-` prefix was introduced they collided, and every sentence in this section had to say which one it meant. Now the slug does that work.

The installed `~/.claude/skills/requirements-reviewer/SKILL.md` was written for a human in a chat window. Four properties make it unusable as-is inside this workflow:

| Skill as written | What the workflow needs |
|---|---|
| Step 1 asks the user to supply requirements if none are attached | Path is always known: `requirements/<TICKET-ID>-requirements.md` |
| Step 3 pauses to ask two context questions before grading | A subagent has no user to answer. It will either stall or answer itself |
| Emits a standalone 5-section report | Must **append** `QA Review Notes`, `Missing Information`, `Identified Risks`, `Assumptions`, `Open Questions` to the existing file |
| Grades on 8 characteristics of requirement text | Workflow spec asks for 12 QA gap checks — validation rules, error handling, permissions, boundaries, integration, data, observability |

The two rubrics are complementary, not competing: the 8 characteristics judge *how the requirement is written*, the 12 gap checks judge *what testing detail is missing*. The agent needs both, so it carries its own copy of the 8-characteristic table (8 rows — cheaper to inline than to load a 278-line skill) and adds the gap checklist on top.

Keep the skill installed for interactive human use. It is not on the workflow's critical path, which also removes it from the Phase 0.7 portability decision.

### Skill audit — `requirements-reviewer`

Findings from reading the current file (278 lines, 15.4 KB):

* **Three dead cross-references.** "Do not use it for" points at `api-test-scenario-generator`, `ut-analyst`, and `jira-mcp-assistant`. None of the three exist in `~/.claude/skills/`. Delete the lines or repoint them.
* **Output is bigger than its signal.** Of the five report sections, §1 *Extracted Requirements* restates the input verbatim, and §3 *Characteristics Grading Table* emits N×8 cells that are mostly ✅. For a 5-requirement input that is ~40 grading cells and a full copy of the input to carry ~6 real findings. §2 (issues) and §5 (recommendations) hold nearly all the value.
* **Suggested trim:** drop §1 and reference requirements by ID; collapse §3 to non-passing cells only (`Req 3 — Verifiable ❌, Complete ⚠️`); keep §4 aggregate (9 compact rows) and §2/§5 unchanged. Roughly 60% smaller with no finding lost.
* **No date or version marker**, so staleness is invisible. Add one.

The agent version dodges the size problem structurally: the long-form findings are written **into the requirements file**, and only a short summary returns to `qa-workflow`. Nothing bulky lands in main-thread context.

### Why `qa-lead` is a skill

Claude Code subagents cannot spawn other subagents. Only the main thread delegates. An orchestrator written as `.claude/agents/qa-lead.md` would be unable to call any of the agents it is supposed to coordinate.

Build it as `.claude/skills/qa-workflow/SKILL.md`, invoked as `/qa-workflow ABC-123`, running on the main thread. It owns the state file, the iteration counter, and every delegation decision.

---

## Build Order

| Step | Deliverable | Proves |
|---|---|---|
| 0 | Phase 0 prerequisites | Agents have conventions to follow |
| 1 | `qa-requirements-collector` | Atlassian MCP read + transition works |
| 1.5 | `qa-requirements-reviewer` | Append-only editing of an existing artifact |
| 2 | `qa-scenario-generator`, `qa-scenario-classifier` | Document → document handoff in fresh context |
| 3 | `qa-scenario-reviewer` | Verdict format + revision loop |
| 4 | `qa-workflow` skill (Phase 1 only) | State file, iteration cap, routing |
| 5 | `aqa-api-test-creator`, `aqa-api-test-reviewer` | **The entire Phase 2 pattern** — built |
| 6 | `aqa-ui-test-creator`, `aqa-ui-test-reviewer` | Clone of step 5 — built |
| 7 | `qa-workflow` Phase 2 + `qa-ship-tests` | End to end, ticket to pull request — `qa-ship-tests` built, `qa-workflow` outstanding |

Step 5 carries the design risk — implement/review/revise loop, iteration cap, report format. Step 6 is largely a copy once step 5 is stable. Do not build steps 5 and 6 in parallel.

Steps 5 and 6 were built in that order and share one report contract
(`docs/automation/implementation-report.md`), so the UI stream inherited the format rather than
re-inventing it. Neither has been exercised yet: both SDETs abort with `NO_TEST_DESIGN` until
`qa-scenario-generator` and `qa-scenario-classifier` have produced and classified
`test-design/SCRUM-139-test-design.md`. That run is the next thing to do, and it is what makes the
step 5–7 acceptance tests runnable.

---

## Tool Scoping

The most consequential decision per agent.

**Naming rule.** Phase 1 agents are namespaced `qa-*` and write only to `requirements/` and `test-design/`. Phase 2 agents carry the `aqa-` prefix — every agent that writes or reviews test code — then the stream (`aqa-api-*`, `aqa-ui-*`), and they are the only agents that write to `tests/`. The prefix and the tool grant must always agree — if a new agent's slug does not tell you which directories it may modify, one of the two is wrong.

An agent that modifies **nothing** is exempt from the directory half of that rule — there is no write scope for its prefix to announce. It takes the name of the **domain it reads and the skills it feeds**, so it sorts next to them: `git-change-analyst` reads the working tree for the `git-*` skills. What makes it read-only is the withheld `Write` and `Edit`, plus the mutating-verb list in its `# Must not` — not the prefix. Do not read `git-*` as a mutation promise: on the skill side those names all mutate, on the agent side this one does not, and the tool grant is the thing that settles which.

| Agent | Tools |
|---|---|
| `qa-requirements-collector` | `Read, Write, mcp__atlassian__*` |
| `qa-requirements-reviewer` | `Read, Edit` |
| `qa-scenario-generator` | `Read, Write, Edit, Glob, Bash` |
| `qa-scenario-classifier` | `Read, Edit, Glob` |
| `qa-scenario-reviewer` | `Read, Grep, Glob` |
| `env-explorer` (not built yet) | `Read, Write, Glob, Bash` |
| `aqa-api-test-creator` | `Read, Write, Edit, Glob, Grep, Bash` |
| `aqa-ui-test-creator` | `Read, Write, Edit, Glob, Grep, Bash` |
| `aqa-api-test-reviewer` | `Read, Grep, Glob, Bash` |
| `aqa-ui-test-reviewer` | `Read, Grep, Glob, Bash` |
| `git-change-analyst` | `Read, Grep, Glob, Bash` |

**Reviewers get no `Edit` or `Write`.** A reviewer that can edit will fix what it finds and return `Pass`, and the Needs-Revision signal disappears — which is the one thing the review step exists to produce. Reviewers keep `Bash` so they can run `npm run test:api` / `lint` to verify claims independently.

`qa-requirements-reviewer` gets `Edit` but **not** `Write`. Its contract is append-only — `Write` on an existing path overwrites the whole file, which is exactly the "must not remove or rewrite `qa-requirements-collector`'s sections" rule the workflow spec states. Withholding the tool enforces it instead of asking the prompt to.

`qa-scenario-generator` gets **both** `Write` and `Edit`, which looks like a contradiction of the rule above until you follow the revision loop. It uses `Write` once, to create the test design. Every later revision — `qa-scenario-reviewer` returned `Needs Revision`, missing scenarios routed back — must be `Edit`, because by then `qa-scenario-classifier` has written `Assigned Level:` lines into the same document and a `Write` would erase them. The tool grant cannot express "Write once, then Edit", so the agent body carries that rule and Step 9's self-check enforces it. `Glob` is for the existence guards, matching both sibling agents.

`qa-requirements-collector` is the only agent with Atlassian access. No other agent should be able to modify Jira.

### Browser access rides on `Bash`

Agents reach the running application through `playwright-cli` (installed globally; vendored into `.claude/skills/playwright-cli/` for portability). There is no separate tool for it — **any agent holding `Bash` can open the AUT**, which means the tool table above cannot express this boundary at all. It is enforced by two things instead:

1. `docs/automation/browser-exploration.md` — the protocol every browser-using agent reads first: preflight, named-session discipline, the `snapshot` → `eval` discovery loop, the `getByTestId`/`getByRole` translation table, and the must-not list.
2. The agent body — each agent restates what *it* specifically may look at and why.

Note the consequence: the four Phase 2 agents already hold `Bash` for `npm run test:api` and lint, so they gained browser access the moment `playwright-cli` was wired in. That is intended for `aqa-ui-test-creator`, incidental for the reviewers, and useless for `aqa-api-test-creator`. Reviewers must not use it — a reviewer that explores the app to check a selector is reproducing the SDET's work rather than reviewing it, and the `must not` block in each reviewer says so.

**A skill does not reach subagents.** Every agent in `.claude/agents/` declares an explicit `tools:` list, none of which include `Skill`, so `.claude/skills/playwright-cli/SKILL.md` is invisible to them — it serves the orchestrator and human readers. Agent-facing browser knowledge must live in a file they `Read`, which is why `docs/automation/browser-exploration.md` exists as a doc and not as a skill.

**Read-only git rides on `Bash` too.** `.claude/settings.local.json` allows `Bash(git:*)` and `Bash(gh:*)` project-wide, and its `deny` list stops force-push, reset, rebase, clean and restore — but not `commit`, `add`, `push`, `merge`, `tag`, `stash` or `config`. So `git-change-analyst`'s read-only contract is **not** enforced by the tool grant. It is enforced by its Step 0 command allow-list and by the mutating-verb list in its `# Must not`, exactly as browser access is. Narrowing `Bash(git:*)` is not available as a fix: the four `git-*` skills need those verbs on the main thread, and permissions are project-scoped, not agent-scoped.

`qa-scenario-generator` is the one Phase 1 agent with `Bash`, granted solely for its Step 4b carve-out: opening the app read-only to confirm that a UI control named in the requirements exists and to capture its selector. It may not source a requirement, error string, status code, or limit from the DOM — that would reverse-engineer the test design out of the implementation and make the suite tautological, which is exactly what its "do not read application source" rule prevents. If Phase 1 should stay strictly document-driven, drop this grant and let `env-explorer` hand the generator a selector map instead.

`env-explorer` writes to `docs/automation/` only, per the naming rule above — it produces selector maps, never test code. It gets `Write` but not `Edit` because each run replaces its map wholesale, and no `Grep` because it reads the app, not the repo.

### Ownership boundary inside `tests/` — resolves Open Decision 4

The tool grant says `Write` and stops. It cannot say *where*, and both SDETs run in parallel against one
repository, so "both may write test code" is not a boundary — it is a race. The partition below is
stated in all four agent bodies and in `docs/automation/implementation-report.md` §4, and each reviewer
checks the other side of it as a Critical finding.

| Owner | May create or modify | Reads |
|---|---|---|
| `aqa-api-test-creator` | `tests/api/**`, `services/api/**`, `fixtures/api-fixture.ts` | everything |
| `aqa-ui-test-creator` | `tests/ui/**`, `pages/**`, `fixtures/pages-fixture.ts` | everything |
| neither | `playwright.config.ts`, `framework/**`, `tsconfig.json`, `package.json`, `.env`, `requirements/**`, `test-design/**`, `docs/**` | — |

`fixtures/pages-fixture.ts` extends `fixtures/api-fixture.ts`, so the UI stream consumes the API stream's
fixtures without being able to edit them. A need across the line becomes a `Shared Change Requested`
entry in the implementation report — visible to the reviewer, the orchestrator and the pull request —
rather than a silent edit landing on top of work another agent has in flight.

The neither-row exists because a config or `framework/` change alters every test in the repository at
once, including tests neither stream is reviewing. That is an orchestrator- or human-level decision.

---

## Per-Agent Specs

### 1. `qa-requirements-collector`

**Status: built.** `.claude/agents/qa-requirements-collector.md`. The shipped version differs from the sketch below: it also carries `Glob` (existence guard), an `# Environment` block with the site/cloudId/status ids, and a `QA_REQUIREMENTS_COLLECTOR_RESULT` receipt block.

```markdown
---
name: qa-requirements-collector
description: Retrieves a Jira ticket and produces a structured, testing-oriented requirements document. Use when a Jira ticket ID needs to be turned into a local requirements file at the start of the QA workflow.
tools: Read, Write, mcp__atlassian__getJiraIssue, mcp__atlassian__searchJiraIssuesUsingJql, mcp__atlassian__getJiraIssueRemoteIssueLinks, mcp__atlassian__getTransitionsForJiraIssue, mcp__atlassian__transitionJiraIssue
model: sonnet
---
```

Body outline:

1. Resolve the ticket by ID; abort with a clear message if not found or not in the expected queue.
2. Collect description, acceptance criteria, comments, subtasks, linked issues, attachments.
3. Derive dependencies and affected components — mark as *derived*, never as if stated in the ticket.
4. Transition to `In Progress` **only after** retrieval succeeds and the ticket is workable.
5. Write `requirements/<TICKET-ID>-requirements.md` using the section template from the workflow spec.
6. Return a short summary: path written, AC count, ticket status.

Must not: invent acceptance criteria; edit the Jira description; transition a ticket it could not fully read.

**Acceptance test:** run against the demo ticket. Every AC in Jira appears in the file, the ticket moves to `In Progress`, and nothing appears in the `Acceptance Criteria` section that is not in the ticket.

---

### 2. `qa-requirements-reviewer`

**Status: built.** `.claude/agents/qa-requirements-reviewer.md`. Shipped with `Glob` added for the existence guard.

```markdown
---
name: qa-requirements-reviewer
description: Reviews a local requirements document for testing-relevant gaps and appends QA review sections to it. Use after qa-requirements-collector has written a requirements file and before scenario generation.
tools: Read, Edit
model: sonnet
---
```

Body outline:

1. Read `requirements/<TICKET-ID>-requirements.md`. Abort if the file is missing or has no `Acceptance Criteria` section — do not review a document `qa-requirements-collector` did not finish.
2. Grade each requirement and acceptance criterion against the 8 characteristics (table inlined in the agent body: Clear, Complete, Consistent, Verifiable, Feasible, Traceable, Atomic, Positive).
3. Check the same set for the 12 testing gaps from the workflow spec: ambiguity, missing AC, validation rules, error handling, permissions, boundaries, integration detail, data requirements, observability, risks, assumptions, open questions.
4. **Append** the five spec-mandated sections to the end of the file. Never touch existing content:

   ```text
   # QA Review Notes
   # Missing Information
   # Identified Risks
   # Assumptions
   # Open Questions
   ```
5. Every finding names the specific requirement (`FR-11.3`) or criterion it came from, and quotes the problematic phrase. No general advice.
6. Return a short summary only — counts per section, plus any question severe enough to block scenario generation. The long form stays in the file.

Must not: rewrite, reorder, or delete `qa-requirements-collector`'s sections; invent acceptance criteria (that is the same prohibition `qa-requirements-collector` has — a reviewer that fills gaps by inventing removes the gap signal); ask the user clarifying questions mid-run; edit Jira.

**Output budget.** Findings go in the file; the return value is a summary. Cap the return at roughly 15 lines. If a run returns a full grading table to `qa-workflow`, the agent is misbehaving — that is the failure mode inherited from the interactive skill.

**Acceptance tests:**

* Run against `requirements/SCRUM-139-requirements.md`. It must flag at least the password-rule gap (no max length or complexity stated) and the unspecified email-format rule, and must not invent a second acceptance criterion — the ticket has exactly one.
* Diff the file before and after. Only additions below the original last line. Any modified or removed line is a failure.
* Run it twice on the same file. The second run must not duplicate the five sections.

---

### 3. `qa-scenario-generator`

**Status: built.** `.claude/agents/qa-scenario-generator.md`.

```markdown
---
name: qa-scenario-generator
description: Derives a complete, traceable set of test scenarios from requirements/<TICKET-ID>-requirements.md and writes them to test-design/<TICKET-ID>-test-design.md, covering happy path, negative, boundary, validation, error, permission, data, integration, retry/timeout, state-transition, non-functional and regression-impact cases. Use after qa-requirements-collector (and optionally qa-requirements-reviewer) have produced a requirements document, or when asked to "generate scenarios", "create test design", "run qa-scenario-generator", or "design test cases" for a ticket.
tools: Read, Write, Edit, Glob
model: sonnet
color: blue
---
```

The deliverable here is not really an agent — it is a **document contract**. `qa-scenario-classifier` edits single lines in the test design, `qa-scenario-reviewer` audits it, and both SDETs (`aqa-api-test-creator`, `aqa-ui-test-creator`) grep it for their stream's scenarios. Those four agents break if the block format drifts, so the format is specified tightly and checked by the agent itself before it returns. When the block grew from ten fields to twelve to carry `Technique:` and `Coverage Item:`, `qa-scenario-classifier`'s field list was updated in the same change — its parse is strict about missing or reordered fields, so it would otherwise have aborted `MALFORMED_DOCUMENT` on every new document. The two SDETs address fields by name and were unaffected.

Body outline (10 steps, same skeleton as `qa-requirements-collector` and `qa-requirements-reviewer`):

1. **Resolve the ticket ID** — the shared regex guard. Also detect a regenerate token, and separately detect *review findings* in the prompt, which select revision mode.
2. **Guard: validate the source** — `Glob` + `Read` `requirements/<TICKET-ID>-requirements.md`. Ten level-1 headings in order, plus at least one `### FR-` or `### AC-` block, or `ABORT: MALFORMED_DOCUMENT`. Strict parse, no bullet-scraping fallback — a document without those headings is stale or hand-written, and generating from it produces untraceable scenarios. Zero ACs but FRs present is not an abort; it becomes a coverage gap.
3. **Guard: idempotency and mode** — a four-row table over {document exists} × {regenerate token} × {review findings} selecting `first_run` / `revision` / `regenerate` / `EXISTS`.
4. **Extract source material** — FR/AC ids verbatim, plus `# Testing-Relevant Information`, `# Known Constraints`, and any `qa-requirements-reviewer` sections. Every reviewer finding must land as a scenario, a `Notes:` line, or a `# Coverage Gaps` entry.
5. **Model the test basis with the ISTQB black-box techniques** — equivalence partitioning, boundary value analysis, decision table testing, state transition testing (ISTQB CTFL v4.0 §4.2), one subsection each, emitting numbered **coverage items** (`EP-NN`, `BV-NN`, `DT-NN/RN`, `ST-NN/TN`). Scenarios are derived *from* these models rather than invented and labelled afterwards, which is what turns coverage from a judgement call into arithmetic. Key rules: every partition set carries its invalid partitions and targets Each Choice; 3-value BVA is the default and 2-value must name the infeasible neighbour; decision tables are required wherever an outcome depends on two or more conditions, and removed or merged columns must be recorded because they change the coverage denominator; state transition testing emits a state *table* so the invalid transitions are visible, targets all-transitions coverage, and allows at most one invalid transition per scenario to avoid defect masking.
5b. **Sweep the twelve coverage categories** — the original table, unchanged, now positioned as the completeness check *over* the models: it catches what no partition, rule column or transition would have produced. The default failure mode of this agent is happy paths plus one token negative case, and the sweep is what prevents it.
6. **Scenario block format** — twelve fields, one per line, under `## SCN-NNN: <title>`. This is the contract; see below.
7. **Write the document** — front matter, `# Test Basis Analysis`, `# Scenarios`, `# Traceability Matrix`, `# Coverage Matrix`, `# Technique Coverage Matrix`, `# Coverage Gaps`. All three matrices are derived from the blocks, never written from memory; the technique percentages in particular are counted, never asserted.
8. **Revision mode (append-only)** — `Edit` only. Numbering continues from the highest existing id, never renumbers, and every pre-existing block stays byte-identical including `qa-scenario-classifier`'s `Assigned Level:` lines. `# Test Basis Analysis` is append-only on the same terms — a wrong model is superseded by a new id plus a coverage-gap note, never edited out from under the scenarios citing it.
9. **Self-check** — traceability complete, every `Requirement:` id real, ids unique and sequential, all twelve fields present, all twelve categories accounted for, all four technique subsections present, every coverage item exercised or declared a gap, every `Coverage Item:` id real, every technique percentage recountable, every status code and error string traceable to the requirements. Failure returns `SELF_CHECK_FAILED` rather than a broken document.
10. **Return summary** — house-style receipt block. `NEXT: qa-scenario-classifier`.

Scenario block format:

```markdown
## SCN-001: Owner creates Admin with valid payload

Requirement: FR-11.2, AC-1
Category: Happy path
Technique: Decision Table Testing
Coverage Item: DT-01/R1, EP-01, EP-03
Priority: High
Preconditions: An authenticated Owner session exists. No Admin with the target e-mail exists.
Action: Send a create-Admin request with a valid e-mail, a 6+ character password and a matching confirmation.
Expected: HTTP 201 is returned, the response contains no password data, and the new account appears first in the Admin list with last login "Never".
Suggested Level: E2E API
Automation Suitability: High
Notes: —
```

`Suggested Level:` is a suggestion and stays as an audit trail; `qa-scenario-classifier` appends `Assigned Level:` alongside it rather than overwriting. `Action:` is written in behavior terms — no endpoints, selectors or HTTP verbs, because the SDETs own the mechanics.

`Technique:` and `Coverage Item:` sit directly after `Category:` on purpose — deliberately *above* `Suggested Level:`, so `qa-scenario-classifier`'s insertion point between `Suggested Level:` and `Automation Suitability:` is untouched by the format growth. `Technique:` takes one of the four §4.2 technique names, plus `Experience-based (error guessing)` as the single escape hatch for scenarios no model produces (regression impact, an implied non-functional risk) — and that value requires its reason in `Notes:`, because an unpoliced escape hatch becomes the default and the field stops meaning anything.

Must not: touch Jira; read `tests/`, `playwright.config.ts` or any application source; finalize a testing level or write an `Assigned Level:` line; invent a requirement, error message, status code or numeric limit absent from the source; invent a partition, boundary value, condition or state the requirements do not support; use 2-value BVA without naming the infeasible neighbour, or drop or merge a decision-table column without recording it; claim a coverage percentage that cannot be recounted from the blocks; renumber or delete an existing scenario in revision mode, or edit a `# Test Basis Analysis` row scenarios already cite; edit the requirements document; return the scenarios in its final message instead of the receipt.

**Acceptance tests:**

* Every FR and AC id from the requirements file appears in at least one scenario's `Requirement:` field; `UNCOVERED_REQUIREMENTS: none`.
* Negative and boundary scenarios exist, not only happy paths — concretely, on SCRUM-139: the 6-character password boundary at 5/6/7, malformed e-mail, mismatched confirmation carrying the exact string `"Passwords must match"`, duplicate e-mail carrying `"User with this email already exists"`, and a non-Owner role against both operations.
* **Boundary modelling** — the 6-character password minimum appears as a `BV-` row marked `3-value` with values `5, 6, 7`, and each of the three values is exercised by a scenario. A `2-value` row here is a failure: the requirement says "at least 6", and only the third value distinguishes a correct `>= 6` from a `> 6` off-by-one.
* **Decision-table modelling** — Owner-only access × e-mail uniqueness × password validity appears as a decision table whose every feasible column has a scenario. This is the case the twelve-category sweep alone produced only by luck: the sweep asks for "a permission scenario", the table asks for the specific combination of authorized-but-duplicate and unauthorized-and-invalid.
* No fabrication — every status code and error string in the output appears verbatim in the requirements file. The unstated maximum password length surfaces as a coverage gap, never as an invented limit or an invented partition.
* Format contract — every block has all twelve fields, in order, one per line. `grep "Suggested Level: E2E API"` returns the count reported in the receipt, and `grep -c "^Coverage Item: "` equals `scenario_count`.
* Coverage arithmetic — every `EP-`/`BV-`/`DT-`/`ST-` id declared in `# Test Basis Analysis` appears in a `Coverage Item:` field or in `# Coverage Gaps`, and the `# Technique Coverage Matrix` percentages survive a manual recount.
* Idempotency — a second run with no regenerate token returns `EXISTS` and leaves the file byte-identical.
* Revision mode — hand-add an `Assigned Level:` line, then re-run with a review finding. The new scenario continues the numbering, both matrices are patched, `revision:` bumps, and every pre-existing block including the hand-added line is byte-identical under diff. **This is the test that matters** — it is the only check that the Phase-1 revision loop will not destroy `qa-scenario-classifier`'s work, and it is the reason this agent holds `Edit`.

---

### 4. `qa-scenario-classifier`

**Status: built.** `.claude/agents/qa-scenario-classifier.md`. Shipped with `Glob` added for the existence guard, an `# Inputs` table (`ticket_id`, `test_design_path`, `implemented_levels`, `reclassify`, `review_findings`), and two lines written per scenario rather than one — `Assigned Level:` plus a one-line `Level Rationale:`, inserted between `Suggested Level:` and `Automation Suitability:`. The 50% E2E figure is a self-check that forces a written justification, not a quota that rewrites assignments — a hard cap would corrupt the judgement it is meant to audit. `implemented_levels` exists so the follow-up-work list can be computed, and is explicitly barred from influencing any assignment. When the block format grew to twelve fields, this agent's strict field list gained `Technique:` and `Coverage Item:` — mandatory, or it aborts `MALFORMED_DOCUMENT` on every document the generator now produces — and one assignment rule: `Technique:` is a signal for factor 1 (an EP or BVA scenario over a single self-contained parameter rule is the archetypal Unit candidate; a decision-table or state-transition scenario rarely settles below Integration), never a verdict that overrides what `Expected:` makes decidable.

```markdown
---
name: qa-scenario-classifier
description: Assigns each test scenario to the appropriate testing level (Unit, Component, Integration, E2E API, E2E UI). Use after scenarios are generated and before automation begins.
tools: Read, Edit
model: sonnet
---
```

Body outline:

1. Read the test design document.
2. Assign each scenario to the lowest practical level, using the eight decision factors from the workflow spec.
3. Multiple levels only where genuinely different aspects are verified.
4. Record a one-line rationale per assignment.
5. Edit levels in place; add a summary count per level at the end of the document.

Must not: duplicate scenarios across all levels by default; drop or reword scenarios; classify everything as E2E.

**Acceptance test:** on the demo ticket, fewer than half the scenarios land on E2E, and at least one is assigned Unit or Integration — proving it can route work away from this repo.

---

### 5. `qa-scenario-reviewer`

**Status: built.** `.claude/agents/qa-scenario-reviewer.md`. Shipped with an `# Inputs` table (`ticket_id`, `test_design_path`, `requirements_path`, `expect_levels_assigned`, `expect_technique_analysis`, `focus`) and explicit severity-to-verdict rules: `Blocked` means *cannot review* (missing, malformed, or mismatched inputs), `Needs Revision` requires at least one Critical or Major, `Pass` tolerates Minor findings. It derives coverage from each scenario's `Requirement:` field and treats the document's own traceability matrix as a claim under review rather than as evidence — a matrix disagreeing with the blocks is itself a Major finding. Report capped at ~70 lines.

The criteria list runs **eighteen**, not the original thirteen. Criteria 1–13 audit the scenarios against the requirements; 14–18 audit the §4.2 models themselves — EP rigor (missing invalid partitions, overlapping or empty partitions, Each Choice unmet), BVA rigor (a stated limit with no `BV-` row, unjustified 2-value), decision-table rigor (an uncovered feasible rule, an unrecorded column removal), state-transition rigor (an uncovered valid transition, no invalid transition attempted, two invalid transitions in one scenario), and coverage-item traceability (a cited id that does not exist, a declared item nothing exercises, a percentage that fails a recount). The distinction matters because a design can cover every requirement and still miss the defect class a technique exists to find — criterion 5 asks whether a boundary *scenario* exists, criterion 15 asks whether the boundary was *modelled* correctly enough for that scenario to be the right one.

`expect_technique_analysis` defaults to `true`; a document with no `# Test Basis Analysis` is a Major finding rather than `Blocked`, so a pre-technique design still gets a full review. The report gained two sections, `Technique Coverage:` (exercised-over-total per technique, counted from the blocks, uncovered ids spelled out) and `Technique Findings:` (model-level defects that are not themselves a missing scenario). A technique matrix claiming 100% while a declared item is exercised by nothing is Critical, on the same footing as an invented status code — both make an unfinished design look finished.

```markdown
---
name: qa-scenario-reviewer
description: Independently reviews a test design for coverage gaps, duplicates, and incorrect testing-level assignments. Returns Pass, Needs Revision, or Blocked. Use before starting test automation.
tools: Read, Grep, Glob
model: sonnet
---
```

Body outline:

1. Read requirements and test design documents.
2. Evaluate against the eighteen criteria — the thirteen from the workflow spec, plus five auditing the ISTQB §4.2 models.
3. Return the exact structured report block from the spec — `Review Status` first.
4. Every finding names a specific scenario ID or AC ID. No general advice.

Must not: edit either document; be run in the same context as `qa-scenario-generator` or `qa-scenario-classifier`.

**Acceptance test:** delete one scenario from an approved test design and re-run. It must return `Needs Revision` and name the uncovered AC. A reviewer that returns `Pass` on a known gap is not usable.

---

### Phase 2 shared contract

Four agents, two streams, one document format between them. The report is the handoff: an SDET writes
it, its reviewer parses it, and the ship skill builds the pull request body out of both copies.

`docs/automation/implementation-report.md` holds that format — path, front matter, the nine mandatory
sections, the ownership boundary, and the red-test rule. It is a **doc, not a skill**, for the same
reason `docs/automation/browser-exploration.md` is: every agent file declares an explicit `tools:` list,
none include `Skill`, so a skill is invisible to a subagent. Agent-facing shared knowledge has to live
somewhere they can `Read`.

Report path: `.workflow/reports/<TICKET-ID>-<stream>-implementation.md`. Not `test-design/` — that
directory belongs to Phase 1, and the naming rule says Phase 2 agents do not write there. Not the repo
either: the report is workflow state and stays out of the pull request.

**The red-test rule** is the one design decision worth arguing about. `CLAUDE.md` requires that a known
application defect be asserted against the *specification*, with a comment naming the defect — so a
finished SDET run can legitimately end with `failed=1`. That collides with the workflow spec's "done
when the new tests pass". The resolution, encoded in all four agents:

* A failure whose assertion matches the scenario's `Expected:`, documented under `Suspected Application
  Defects` with the scenario id, is **finished work**. The reviewer records it under `Validation Results`
  and does not fail the verdict on it.
* Weakening the assertion, deleting the test, or `.skip`-ing it to turn the run green is **Critical**.
* A red test with no entry in the report is **Major** — either the code is wrong or the report is.

Without this, the cheapest way for an SDET to satisfy its reviewer is to delete the evidence of a bug.

---

### 6. `aqa-api-test-creator`

**Status: built.** `.claude/agents/aqa-api-test-creator.md`.

```markdown
---
name: aqa-api-test-creator
description: Implements the E2E API scenarios of a test design as Playwright API tests under tests/api/, reusing the existing fixture, facade and builder layers, then runs the API suite and the type check and writes an implementation report. …
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
color: green
---
```

Inputs: `ticket_id` (required), `test_design_path`, `scenario_ids`, `review_findings` (selects revision
mode), `report_path`, `run_tests`. There is deliberately **no `requirements_path`** — see below.

Outputs: tests under `tests/api/`, the report file, and an `API_SDET_RESULT` receipt carrying
`SELECTED_SCENARIOS`, `IMPLEMENTED_SCENARIOS`, `SKIPPED_SCENARIOS`, `CREATED_TESTS`, `CHANGED_FILES`,
`EXECUTION`, `TYPECHECK`, `DEFECT_SUSPECTED`, `SHARED_CHANGE_REQUESTED`.

Body: 10 steps — resolve ticket and mode; load the test design; select `Assigned Level: E2E API` blocks;
read `CLAUDE.md` and inventory `fixtures/`, `services/api/`, `tests/api/`; `curl` preflight; implement;
run `npx playwright test tests/api` + `npx tsc --noEmit` with a three-cycle fix cap; revision mode;
self-check; write report and receipt.

**The test design is the only specification the stream reads.** Step 2 loads it and nothing else; the
agent does not open `requirements/` at all. That document was written, reviewed by
`qa-requirements-reviewer` and closed in Phase 1, and the test design already encodes what it decided.
Reading both invites the SDET to assert a requirement the design deliberately left out, and makes it the
one deciding which document wins when they disagree — a decision that belongs to the design phase. So
every expected value comes from the scenario's `Expected:` field, verbatim. A vague `Expected:` is a
`Known Limitations` entry and, if nothing assertable remains, a skipped scenario. The `Requirement:` ids
stay in the traceability comments, but they are labels copied forward from the design, not a pointer to
follow. Both reviewers apply the same rule from the other side.

Two guards are worth noting. A test design with no `Assigned Level:` lines anywhere aborts
`LEVELS_NOT_ASSIGNED` — `Suggested Level:` is the proposal, not the decision, and implementing from it
would silently bypass classification. Zero E2E API scenarios returns `OK` with
`IMPLEMENTED_SCENARIOS: none`, because "nothing to do" is a valid outcome and must not look like a
failure to the orchestrator.

Must not: implement a non-API scenario or write under `tests/ui/`, `pages/`, `fixtures/pages-fixture.ts`;
modify config or `framework/`; read `requirements/` or assert a value taken from it; open a browser (no
DOM is involved in an HTTP contract); report an execution result it did not observe; weaken an assertion
to go green; invent a status code or error string the test design does not state; leave a created record
behind.

**Acceptance test:** given 2–3 E2E API scenarios, the created tests appear only under `tests/api/`, every
reported file path exists, every reported test title is the exact `test(...)` string, and the receipt's
counts match a fresh run.

---

### 7. `aqa-api-test-reviewer`

**Status: built.** `.claude/agents/aqa-api-test-reviewer.md`.

```markdown
---
name: aqa-api-test-reviewer
description: Independently reviews new E2E API test code against its implementation report and test design … returns a Pass / Needs Revision / Blocked verdict with findings cited by file and line.
tools: Read, Grep, Glob, Bash
model: sonnet
color: orange
---
```

Inputs: `ticket_id` (required), `implementation_report_path` (default
`.workflow/reports/<id>-api-implementation.md`), `implementation_report` (inline fallback so the agent
stays callable with no file on disk), `test_design_path`, `changed_files`, `run_validation`, `focus`.
Neither report form present -> `Blocked NO_REPORT`. There is deliberately **no `requirements_path`** —
see below.

Outputs: the workflow spec's review block, plus `E2E API Scenarios in Test Design`, `Scenarios Claimed` /
`Verified` / `Unverified` / `Missing`.

Body: guard and load; **verify the report's claims** before judging quality; a 22-row API checklist;
run `npx playwright test tests/api` and `npx tsc --noEmit` itself; severity and verdict; report.

**The review is scoped to two questions**, stated at the top of the body: (1) was every scenario the test
design assigns to `E2E API` implemented and actually asserted, and (2) does the code follow the style of
`tests/api/login-api.spec.ts` and `CLAUDE.md`. Checklist rows 1–4 answer the first, rows 5–22 the second.

The test design is the **only** specification the reviewer reads. It does not open `requirements/` at
all: that document was already reviewed by `qa-requirements-reviewer` in Phase 1, and a second pass here
re-opens a settled document and produces findings that contradict the design the tests were written
from. A gap in the test design itself belongs to the design review, not this one — at most a
`Suggested Improvements` line.

The highest-value check is Step 2, not the checklist: a scenario claimed as implemented whose test does
not actually assert that scenario's expected outcome. A green suite cannot catch it, and it is the
failure mode an implementation report invites. Its twin is a scenario the design assigns to `E2E API`
that appears in neither the code nor `Skipped Scenarios` — Critical, and invisible in a green run.

Must not: edit anything; read `requirements/` or phrase a finding against a requirement; judge the test
design itself; review `tests/ui/` or `pages/`, or comment on selectors and waits; trust the report's
counts; open a browser; return a non-`Blocked` verdict on a suite it could not run; report a documented
suspected defect as a code defect.

**Acceptance test:** feed it a test containing a hard-coded credential and a missing status-code
assertion. Both must appear as Critical or Major. It must not fix them.

---

### 8. `aqa-ui-test-creator`

**Status: built.** `.claude/agents/aqa-ui-test-creator.md`. Same 10-step skeleton as `aqa-api-test-creator` plus one extra step,
and a `color: purple`.

Differences from the API stream:

* Scope `Assigned Level: E2E UI`; output under `tests/ui/` and `pages/`; registration in
  `fixtures/pages-fixture.ts`.
* Command `npx playwright test tests/ui --reporter=line`.
* Extra input `explore_app` (`auto` | `always` | `never`) and an extra step: optional browser
  exploration through `playwright-cli`, session `-s=aqa-ui-test-creator`, following
  `docs/automation/browser-exploration.md`. Locators only — never an expected value. If the app renders
  something other than the scenario's `Expected:`, the test asserts the scenario and fails.
* Same test-design-only scoping as the API stream: no `requirements_path`, `requirements/` never read,
  every expected value taken verbatim from the scenario. The UI stream has a second way to invent a
  value — reading it off the running app — and both are closed by the same rule.
* Receipt carries two extra fields: `EXPLORED_APP` and `LOCATOR_GAPS`.
* Locator policy (`getByTestId`/`getByRole` only), wait policy (no `waitForTimeout`), page objects hold
  no assertions, network-backed actions wrapped in `Promise.all([waitForResponse, action])`, dialog
  handler registered *before* the click.
* Must not touch `tests/api/`, `services/`, or `fixtures/api-fixture.ts`.

**Acceptance test:** created tests contain zero raw CSS/XPath selectors, zero fixed waits, zero snapshot
refs, no `expect` under `pages/`, and `playwright-cli list` prints `(no browsers)` after the run.

---

### 9. `aqa-ui-test-reviewer`

**Status: built.** `.claude/agents/aqa-ui-test-reviewer.md`. Same skeleton as `aqa-api-test-reviewer`, with a
25-row UI checklist and `npx playwright test tests/ui`.

It carries the same two-question scoping: coverage of the scenarios the test design assigns to `E2E UI`
(rows 1–4) and code style against `tests/ui/owner.spec.ts`, `pages/owner-page.ts`, `CLAUDE.md` and
`docs/automation/browser-exploration.md` (rows 5–25). It takes no `requirements_path` and does not open
`requirements/`.

Two UI-specific rulings in the body:

* A test that passed **only on a retry** is a Major flakiness finding even though the run was green.
* A page object that documents a missing `data-testid` and falls back to a role-based locator is
  **correct work, not a finding** — `pages/owner-page.ts` does exactly this. The finding is the
  opposite: a CSS selector papering over the same gap.

**Acceptance test:** feed it a test using `page.waitForTimeout(3000)` and a `.css-1a2b3c` selector. Both
must be reported as Major. It must not fix them.

---

### 9.5 `qa-ship-tests` skill (the `git-workflow-agent` row)

**Status: built.** `.claude/skills/qa-ship-tests/SKILL.md`, invoked as `/qa-ship-tests SCRUM-139`.

Inputs: `ticket_id` (required), `api_review`, `ui_review`, `api_report_path`, `ui_report_path`,
`test_design_path`, `branch_name`, `base_branch`, `skip_branch`, `dry_run`, `follow_up_tickets`.

Outputs: a `QA_SHIP_TESTS_RESULT` block with per-phase status and `PR_URL`.

Four steps: a five-condition gate; compose branch, commit message and PR body from the files; run the
four git phases through `git-workflow-orchestrator`; return. The gate reads the reports rather than
trusting the caller — if a caller says both reviews passed and the report disagrees, the files win.
`dry_run` stops after composition, which is what makes the PR body testable without a remote.

**Acceptance test:** call it with one review at `Needs Revision`. It must stop at the gate, name the
stream and the verdict, and run no git command.

---

### 9.6 `git-change-analyst`

**Status: built.** `.claude/agents/git-change-analyst.md`. The read-only half of the git-row split — see
[…and why one read-only agent came back](#and-why-one-read-only-agent-came-back).

```yaml
name: git-change-analyst
tools: Read, Grep, Glob, Bash
model: sonnet
color: pink
```

Inputs: `base_branch`, `staged_only`, `ticket_id`, `context`, `include_pr_facts`, `paths`. All optional —
this is the one agent that needs no `ticket_id`, because it is not ticket-scoped; `ticket_id` only feeds
the `[TICKET-ID]` pull-request title prefix.

Outputs: a `GIT_CHANGE_ANALYST_RESULT` block carrying branch, base, the three file lists, change stats, a
staged fingerprint, the proposed Conventional Commits message, and the PR title / commit subjects / file
groups. The proposed message is delimited by `---` lines rather than a fenced block so it survives being
embedded in a caller's own fenced output.

Eight steps: an explicit read-only command allow-list; a repository guard; the change set; a **secret
guard that runs before any diff is read**; the diff read, capped at 100 files / 2000 lines with
`TRUNCATED: yes`; message composition; PR facts; self-check; receipt.

Three rulings worth knowing:

* A secret file inside the change set is `BLOCKED` / `SECRETS_DETECTED` with **paths only**, and **no
  commit message is proposed** — a ready-to-use message makes committing the credential the path of least
  resistance. A `.env` that is untracked and git-ignored is a `SECRET_WARNING`, not a block.
* `MESSAGE_STATUS` is always `proposed`. The agent has no mechanism by which it could be anything else,
  because the two confirmations belong to a caller that can ask a human.
* **Step 5 carries no commit-format rules of its own.** It `Read`s
  `.claude/skills/git-commit-creator/references/commit-message-guidelines.md`, which is the single source
  the drafting skill uses as well. Before this, the Conventional Commits table lived in three files — the
  skill's step 3a, this agent, and that reference file, which nothing pointed at — and the three had
  already drifted on `various`, on a trailing period, and on whether `!` and a `BREAKING CHANGE` footer
  may both appear. A missing file is a `NOTES` line and a compact inline fallback, never an abort: the
  agent must stay runnable where the skill is not vendored.

**Acceptance test:** stage a change containing a `.env` file. It must return `BLOCKED` /
`SECRETS_DETECTED`, name only the path, propose no commit message, and leave `git status` byte-identical.
Then remove the `.env`, re-run, and confirm the receipt contains no diff content and that every listed
path appears in `git status --short`.

---

### 10. `qa-workflow` skill (the `qa-lead` orchestrator)

`.claude/skills/qa-workflow/SKILL.md`, invoked as `/qa-workflow ABC-123`.

Responsibilities:

1. Create or load `.workflow/<TICKET-ID>.yaml` using the state schema from the workflow spec.
2. Delegate each step to the matching subagent, one at a time, passing artifact paths — not conversation history.
3. On `Needs Revision`, increment the stream's iteration counter and return the work to the originating agent with the review findings.
4. Enforce `max_review_iterations: 3`. On exceeding it, stop and escalate rather than looping.
5. Run `aqa-api-test-creator` and `aqa-ui-test-creator` in parallel; wait for both streams before the final decision; keep per-stream status so one failure does not discard the other's passing work.
6. Invoke git skills only when both reviewers return `Pass`.
7. Persist state after every step so an interrupted run can resume.

Must not: perform requirements analysis, scenario generation, or test implementation itself.

**Acceptance test:** kill the session mid-run. Re-invoking `/qa-workflow ABC-123` resumes from the persisted state instead of restarting from Jira intake.

---

## Cross-Cutting Checks

Run these once steps 1–7 are complete.

* **Iteration cap** — force a reviewer to fail three times. The workflow escalates, does not loop.
* **Stream independence** — make the UI stream fail. The API stream's passing work must survive into the final decision.
* **Non-E2E routing** — a Unit-classified scenario produces a follow-up ticket entry, not a Playwright test.
* **Tool boundaries** — confirm no reviewer modified a file across a full run.
* **Fresh clone** — clone to an empty directory and run end to end. Catches missing skills, missing env vars, missing scripts.

---

## Open Decisions

1. ~~**Application under test**~~ — **resolved.** Retro Video Games Portal at `http://localhost:9000`, with a real Playwright suite against it. Every Phase 2 agent preflights it with `curl` and reports `AUT_UNREACHABLE` rather than guessing.
2. **Model per agent** — `sonnet` assumed throughout above, including all four Phase 2 agents. The two test reviewers are now the strongest candidates for an upgrade: their highest-value check (a scenario claimed but not actually asserted) is a judgement call across three documents and a diff.
3. **Follow-up ticket creation** — `qa-requirements-collector` holds the only Jira write access, but follow-up tickets are created at the end of Phase 2. Either grant the orchestrator ticket-creation access or add a small dedicated agent for it. `qa-ship-tests` deliberately does not touch Jira; it only carries follow-up ids into the PR body.
4. ~~**Parallel execution mechanics**~~ — **resolved** by the ownership boundary under [Tool Scoping](#ownership-boundary-inside-tests--resolves-open-decision-4). The two SDETs write to disjoint paths, `fixtures/pages-fixture.ts` extends `fixtures/api-fixture.ts` read-only, and a cross-boundary need surfaces as a `Shared Change Requested` entry instead of an edit. Whether the orchestrator actually launches them concurrently is now a scheduling choice, not a correctness one.
5. **Iteration state lives with the caller.** Neither SDET nor reviewer counts its own iterations — an SDET only knows `first_run` vs `revision`, and `iteration:` in the report is written from what it was told. `max_review_iterations: 3` is enforceable only by `qa-workflow`, which does not exist yet. Until it does, a human is the loop breaker.
