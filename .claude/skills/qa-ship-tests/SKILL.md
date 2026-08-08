---
name: qa-ship-tests
description: >-
  Ship reviewed E2E test automation for a Jira ticket as a single pull request:
  verifies both stream reviews passed, builds the branch name, commit message and
  PR description from the implementation reports and the test design, then runs the
  phased git workflow. Use when API and UI test work for a ticket has been reviewed
  and needs to reach a pull request, or when asked to "ship the tests", "open the PR
  for <TICKET-ID>", or "run the git workflow for this ticket".
argument-hint: "<TICKET-ID> [--skip-branch] [--dry-run]"
---

# QA Ship Tests

The last phase of the QA automation workflow. It turns reviewed test code into one pull request that
traces back to the Jira ticket, the scenarios implemented, and the validation that was actually run.

It performs no git operation of its own. Branch, commit, push and PR are delegated, phase by phase, to
**git-workflow-orchestrator** (agent-driven path, section A of that skill). This skill supplies the
gate, the naming, and the PR body — the parts specific to this workflow.

Run it on the main thread. It reads files and invokes other skills; a subagent can do neither.

## Inputs

| Parameter | Required | Form | If absent |
|---|---|---|---|
| `ticket_id` | yes | `SCRUM-139` | stop and ask for it — never guess from the branch or the newest file |
| `api_review` | no | `Pass` / `Needs Revision` / `Blocked` / `not_applicable — <reason>`, or the reviewer's report block | read it from the caller's state; if unknown, treat as **not passed** |
| `ui_review` | no | same | same |
| `api_report_path` | no | repo-relative path | default `.workflow/reports/<TICKET-ID>-api-implementation.md` |
| `ui_report_path` | no | repo-relative path | default `.workflow/reports/<TICKET-ID>-ui-implementation.md` |
| `test_design_path` | no | repo-relative path | default `test-design/<TICKET-ID>-test-design.md` |
| `branch_name` | no | git branch | default `test/<TICKET-ID>-e2e-automation` |
| `base_branch` | no | `main` / `develop` | resolved by the git skills |
| `skip_branch` | no | flag | set when already on the target branch |
| `dry_run` | no | flag | build and print branch, commit message and PR body; run no git command |
| `follow_up_tickets` | no | ids | read from the test design's coverage gaps and the reports' limitations |

## Step 1 — Gate

Do not start a git phase until all of these hold. Report which one failed and stop; a partial ship is
worse than none.

1. **Both reviews passed.** `api_review` and `ui_review` are both `Pass`. `Needs Revision`, `Blocked`,
   or unknown -> stop, name the stream and the verdict. A stream with zero scenarios counts as passed
   only when its implementation report says `IMPLEMENTED_SCENARIOS: none` for a genuine reason.
   **A stream your caller reports as `not_applicable` is settled, not passed, and rules 1 and 2 do not
   apply to it.** That stream never ran, so it has no verdict and no report to hold to one. It needs a
   stated reason — `not_applicable` with nothing behind it is indistinguishable from a stream that was
   forgotten, and that is the difference between a deliberate scope decision and a silent gap. Carry the
   reason into the PR body under *Streams Not Run*. At least one stream must have shipped work; both
   `not_applicable` -> stop, there is nothing to ship.
2. **Both reports exist and are current.** Read both — excluding a `not_applicable` stream, which has
   none. Their `ticket:` matches, and their `iteration:` matches the iteration each reviewer says it
   reviewed.
3. **No unresolved Critical or Major** finding in either review block.
4. **The repository is a git repository** with a remote. `git rev-parse --is-inside-work-tree` and
   `git remote -v`. Not a repo, or no remote -> stop and say so; this skill does not `git init`.
5. **Working tree contains the reported files.** Every path under `Changed Files` in both reports
   exists. A missing path means the reports describe work that is not on disk.

Preconditions are checked, never assumed. If your caller asserts "both passed" but the reports say
otherwise, the files win.

## Step 2 — Compose

**Branch:** `test/<TICKET-ID>-e2e-automation`, or `branch_name` when supplied.

**Commit message:** conventional, one subject line plus a body listing the scenarios.

```text
test(<TICKET-ID>): automate <n> E2E scenarios

Implements SCN-012, SCN-014, SCN-021 from test-design/<TICKET-ID>-test-design.md.

API: npx playwright test tests/api — 2 passed
UI:  npx playwright test tests/ui — 1 passed
Type check: npx tsc --noEmit — pass
```

**Files to stage:** only what the two reports list under `Changed Files`, plus nothing else. `.workflow/`
is workflow state and is not part of the pull request — if it is not gitignored yet, exclude it
explicitly rather than committing it.

Optional cross-check, before Phase 2: delegate to the `git-change-analyst` agent with `staged_only: false`,
`include_pr_facts: false` and `paths` set to the two reports' `Changed Files` lists. Its
`OUT_OF_SCOPE_FILES` and `SECRET_WARNING` fields answer the one question this gate cannot answer from the
reports alone — whether the working tree holds something neither report claims. Ignore its
`PROPOSED_COMMIT_MESSAGE`: the message for this workflow comes from the reports and the test design, never
from the diff.

**PR title:** `[<TICKET-ID>] E2E automation — <ticket summary>`.

**PR body:**

```markdown
## Jira Ticket

SCRUM-139

## Implemented Scenarios

- SCN-012 — Owner creates Admin with valid payload
- SCN-014 — Duplicate e-mail is rejected
- SCN-021 — Created admin appears in the Owner Panel

## Added Tests

- Create admin - Should create an admin with a valid payload
- Create admin - Should reject a duplicate e-mail
- As an owner, I should be able to add a new admin

## Test Levels

- E2E API
- E2E UI

## Validation

- API tests: 2 passed, 0 failed, 0 skipped
- UI tests: 1 passed, 0 failed, 0 skipped
- Type check (`npx tsc --noEmit`): Passed
- API review: Pass
- UI review: Pass

## Streams Not Run

- E2E API — no API surface was mapped for this feature, so scenarios could not name a route, a status
  code or a response shape. Ignored by @dneprokos on 2026-08-08.

## Known Limitations

- SCN-016 not automated: the requirements state no maximum password length.

## Suspected Application Defects

- SCN-014 / FR-11.3 — spec requires HTTP 409, application returns 400. The test asserts 409 and fails
  deliberately; the assertion was not weakened.

## Follow-Up Items

- Unit and Integration scenarios from the test design belong to the application repository.
```

Every value comes from a file — the reports, the test design, the review blocks. Never write a count,
a scenario title or a verdict from memory. Omit a section only when its source is genuinely empty, and
say `- None.` rather than deleting the heading.

A red, documented test does **not** block the PR. It is the deliverable: the `Suspected Application
Defects` section is what makes it visible to a human reviewer.

## Step 3 — Run the phases

Follow **git-workflow-orchestrator**, agent-driven path, and report SUCCESS or FAILED after each phase.
Stop on the first failure.

| Phase | Skill | Note |
|---|---|---|
| 1 — Branch | git-branch-creator | skipped when `skip_branch` is set and the current branch is the target |
| 2 — Commit | git-commit-creator | stage only the reported files; confirm the message before committing |
| 3 — Push | git-push-creator | refuses to push a core branch, by design |
| 4 — PR | git-pr-creator | needs `GITHUB_TOKEN` / `GH_TOKEN`; check before Phase 4, not after |

`dry_run` stops after Step 2: print the branch, the commit message and the PR body, run no git command.

## Step 4 — Return

```text
QA_SHIP_TESTS_RESULT: OK | BLOCKED | FAILED
TICKET: SCRUM-139
BRANCH: test/SCRUM-139-e2e-automation
COMMIT: <sha or "none">
PHASES: branch=SUCCESS commit=SUCCESS push=SUCCESS pr=SUCCESS
PR_URL: <url or "none">
SCENARIOS: SCN-012, SCN-014, SCN-021
FOLLOW_UP: <ids, or "none">
NOTES: <one line, or "none">
```

On `BLOCKED`, name the gate that failed and what would clear it.

## Must not

- Run a git phase before both reviews are `Pass`. This gate is the whole reason the skill exists.
- Stage a file neither report lists, or commit `.workflow/`, `playwright-report/`, `test-results/`,
  `.playwright-cli/` or `.env`.
- Write a test, fix a failing one, or edit a report to make the gate pass. Nothing here modifies the
  work under review — a gate that edits its input is not a gate.
- Force-push, rebase, amend, merge, or delete a branch. The workflow's git skills deny those already;
  do not reach around them with raw `git`.
- Open a second pull request for the same ticket. Both streams ship in one PR, by design. An existing
  PR with the same ticket prefix means stop and ask.
- Invent a scenario id, a test title, a count, or a PR section from memory instead of reading it.
- Transition the Jira ticket or comment on it. This skill has no Jira access. `PR_URL`, `BRANCH` and
  `SCENARIOS` in the receipt are what a caller needs to arrange that; emitting them is where this skill's
  responsibility ends.
