---
name: qa-workflow
description: >-
  QA Lead orchestrator. Drives a Jira ticket end to end through requirements collection,
  requirements review, scenario generation, level classification, design review, parallel
  API and UI test implementation, both code reviews, and the pull request — in manual mode
  (pause for a transition decision after every agent) or auto mode (verdict-driven routing
  with a capped review loop). Owns the workflow state file, every iteration counter and
  every routing decision. Use when asked to "run the QA workflow", "start the lead
  orchestrator", "automate <TICKET-ID> end to end", "run the QA lead", or
  "/qa-workflow <TICKET-ID>".
argument-hint: "<TICKET-ID> [--auto] [--max-review-iterations N] [--resume] [--dry-run]"
---

# QA Workflow — the lead orchestrator

The QA Lead. It turns one Jira ticket into one pull request by delegating every step to a subagent and
deciding, after each one, what happens next.

**It does none of the work itself.** No requirement is analysed here, no scenario written, no test
implemented, no code reviewed. This skill owns three things and only three: the workflow state file, the
iteration counters, and the routing decisions.

Run it on the main thread. Claude Code subagents cannot spawn subagents, so an orchestrator written as an
agent could call nothing it coordinates. It also invokes other skills, which a subagent cannot see.

**This is the only file in the repository that names one agent next to another.** Every agent under
`.claude/agents/` is written as a pure function of its parameters and refuses to name a sibling or emit a
`NEXT:` field, precisely so that all routing knowledge concentrates here. Adding a routing hint to an agent
file breaks that contract; add it to the step registry below instead.

## Inputs

| Parameter | Required | Form | If absent |
|---|---|---|---|
| `ticket_id` | yes | `SCRUM-139`, or a `/browse/<KEY>` URL | stop and ask — never guess from the branch or the newest file |
| `mode` | no | `manual` \| `auto` (`--auto` sets `auto`) | `manual` |
| `max_review_iterations` | no | integer >= 1; alias `maxReviewIterations` | `2` |
| `review_requirements` | no | `true` \| `false` | `true` |
| `resume` | no | flag | auto-detected: a state file for this ticket means resume |
| `start_phase` | no | `design` \| `automation` \| `ship` | resolved from the state file |
| `skip_ship` | no | flag | `false` |
| `dry_run` | no | flag | `false`; passed through to the ship phase |
| `explore_app` | no | `auto` \| `always` \| `never` | pass-through to the UI stream; its own default applies |
| `run_tests` | no | `true` \| `false` | pass-through to both SDETs; their own default applies |
| `branch_name`, `base_branch` | no | git refs | pass-through to the ship phase |

`snake_case` is the convention across every agent in this repository; `maxReviewIterations` is accepted as
an alias for the one parameter that is commonly written the other way.

## Step 0 — Resolve and load

1. **Ticket id.** Uppercase project key, hyphen, digits. A `/browse/<KEY>` URL yields the key. No id, or two
   different ids in the request -> stop and ask. Do not guess.
2. **State.** Read `.workflow/<TICKET-ID>.yaml`.
   * Missing -> create it from the schema below with `phase: test_design`, all counters `0`, and the
     resolved configuration. Create `.workflow/` if needed.
   * Present -> this is a **resume**. Announce the recorded phase, status and step, and continue from there.
     Do not restart at Jira intake, and do not re-run a step whose artifact already exists.
3. **Mode.** `auto` only when explicitly asked (`--auto`, `mode: auto`, "run it automatically"). Anything
   else, including silence, is `manual`. Print the resolved mode before the first delegation so nobody is
   surprised by which one is running.

## Workflow state — `.workflow/<TICKET-ID>.yaml`

This is the only file this skill writes.

```yaml
ticket_id: SCRUM-139
phase: test_design            # test_design | test_automation | ship | done
status: in_progress           # in_progress | paused | escalated | blocked | completed
mode: manual                  # manual | auto
current_step: "1.3"

configuration:
  review_requirements: true
  non_e2e_coverage_strategy: create_follow_up_ticket
  max_review_iterations: 2

iterations:                   # one counter per review loop, never shared
  design: 0
  api: 0
  ui: 0

artifacts:
  requirements: requirements/SCRUM-139-requirements.md
  test_design: test-design/SCRUM-139-test-design.md

test_design:
  status: pending             # pending | generated | classified | approved
  review_status: pending      # pending | passed | needs_revision | blocked
  open_questions: []
  last_findings: null         # the reviewer's own previous block, fed back as previous_findings
  unapproved_unknowns: []     # [{ scenario: SCN-013, missing: "duplicate-email status code" }]
  blocked_scenarios: []       # scenarios left Automation Suitability: Manual only by an unknown
  approved_assumptions: []    # [{ value, scenario, basis, approved_by, date }] — fed back as approved_values

automation:
  api:
    status: pending           # pending | implemented | review_in_progress | passed | needs_revision | blocked
    report: .workflow/reports/SCRUM-139-api-implementation.md
    implemented_scenarios: []
    created_tests: []
    review_status: pending
    last_findings: null
  ui:
    status: pending
    report: .workflow/reports/SCRUM-139-ui-implementation.md
    implemented_scenarios: []
    created_tests: []
    review_status: pending
    last_findings: null

pull_request: null
follow_up_tickets: []
final_decision: pending       # pending | accept | request_revision | escalate | block | continue

history:
  - { step: "1.1", agent: qa-requirements-collector, result: OK, at: 2026-08-06T10:12:00Z, note: "6 FR, 1 AC" }
```

**Persist after every step, before the next delegation.** That one rule is what makes an interrupted run
resumable: kill the session mid-flight, re-invoke `/qa-workflow SCRUM-139`, and it picks up from the
recorded step instead of re-reading Jira.

`last_findings` matters as much as the counters. A reviewer switches to its cheaper `re_review` mode only
when handed `previous_findings`, and an implementer scopes its revision only when handed `review_findings`.
Both come out of this file, not out of the transcript.

## Step registry

Delegate one step at a time. Pass **artifact paths, not conversation history** — every agent re-reads from
disk, which is what keeps its context small and its result reproducible.

| Step | Agent / skill | Parameters passed | Receipt line to parse | Produces |
|---|---|---|---|---|
| 1.1 | `qa-requirements-collector` | `ticket_id` | `QA_REQUIREMENTS_COLLECTOR_RESULT` | `requirements/<TICKET-ID>-requirements.md`, Jira -> In Progress |
| 1.2 | `qa-requirements-reviewer` — skipped when `review_requirements: false` | `ticket_id`, `requirements_path` | `QA_REQUIREMENTS_REVIEWER_RESULT` | five QA sections appended to the same file |
| 1.3 | `qa-scenario-generator` | `ticket_id`, `requirements_path`, `review_findings`, `approved_values` | `QA_SCENARIO_GENERATOR_RESULT`, `UNAPPROVED_UNKNOWNS`, `BLOCKED_SCENARIOS`, `APPROVED_ASSUMPTIONS` | `test-design/<TICKET-ID>-test-design.md` |
| 1.4 | `qa-scenario-classifier` | `ticket_id`, `test_design_path`, `review_findings`, `scenario_ids` | `QA_SCENARIO_CLASSIFIER_RESULT` | `Assigned Level:` + `Level Rationale:` per scenario |
| 1.5 | `qa-scenario-reviewer` | `ticket_id`, `test_design_path`, `requirements_path`, `previous_findings` | `Review Status:` | verdict + `[DESIGN-*]` findings |
| 2.1a | `aqa-api-test-creator` | `ticket_id`, `test_design_path`, `iteration`, `review_findings`, `finding_ids`, `run_tests` | `API_SDET_RESULT` | `tests/api/**`, `.workflow/reports/<TICKET-ID>-api-implementation.md` |
| 2.1b | `aqa-ui-test-creator` | same, plus `explore_app` | `UI_SDET_RESULT` | `tests/ui/**`, `pages/**`, `.workflow/reports/<TICKET-ID>-ui-implementation.md` |
| 2.2a | `aqa-api-test-reviewer` | `ticket_id`, `implementation_report_path`, `test_design_path`, `previous_findings` | `Review Status:` | verdict + `[API-*]` findings |
| 2.2b | `aqa-ui-test-reviewer` | same | `Review Status:` | verdict + `[UI-*]` findings |
| 3 | `qa-ship-tests` **skill** | `ticket_id`, `api_review`, `ui_review`, `branch_name`, `base_branch`, `dry_run` | `QA_SHIP_TESTS_RESULT` | branch, commit, push, pull request |

Steps 2.1a/2.1b run **in parallel** — two Agent calls in one message. Same for 2.2a/2.2b. The two streams
write to disjoint paths by design, so concurrency here is a scheduling choice with no correctness cost.

## Reading a receipt

Two vocabularies exist on disk. Read each for what it is; do not judge an agent by prose.

* **Writing agents** end with `<NAME>_RESULT: OK | EXISTS | BLOCKED | ABORT` plus named fields.
* **Reviewers** write no `RESULT:` line. Their block opens `Review Status: Pass | Needs Revision | Blocked`.

Normalize both into one outcome:

| Receipt value | Outcome | Meaning |
|---|---|---|
| `OK`, `Pass` | `advance` | step done, go to the next one |
| `EXISTS` | `already_done` | the artifact was already there. Record it, advance, **do not re-run** |
| `Needs Revision` | `rework` | route the findings back |
| `BLOCKED`, `ABORT`, `Blocked` | `escalate` | stop and report the code |

`already_done` is the load-bearing row. A resumed run, a retried call after a timeout, or a re-entered phase
all land on it, and treating it as a failure would either loop or overwrite an artifact somebody is
mid-way through reading.

Record the abort code verbatim when escalating — `NO_TICKET_ID`, `NO_REQUIREMENTS_DOC`, `MALFORMED_DOCUMENT`,
`NO_TEST_DESIGN`, `LEVELS_NOT_ASSIGNED`, `TICKET_MISMATCH`, `AUT_UNREACHABLE`, `SELF_CHECK_FAILED`,
`NO_REPORT`, `SECRETS_DETECTED`. Each names a different fix, and a summary that says "blocked" without the
code makes a human re-derive it.

## Routing a finding

Finding ids are stable across iterations and carry their stream in the prefix. Route by section, not by
severity:

| Finding source | Routed to | Additional parameters |
|---|---|---|
| `[DESIGN-*]` under `Missing Scenarios:`, `Duplications:`, `Technique Findings:`, `Risks:` | `qa-scenario-generator` | `review_findings` = the finding lines |
| `[DESIGN-*]` under `Incorrect Classifications:` | `qa-scenario-classifier` | `review_findings` + `scenario_ids` = the named scenarios |
| `[REQ-*]`, or a design finding whose root cause is a missing requirement | **escalate** | — |
| `[API-*]` | `aqa-api-test-creator` | `review_findings`, `finding_ids`, `iteration` |
| `[UI-*]` | `aqa-ui-test-creator` | same |

A design review with findings in **both** design buckets routes the classifier first, then the generator,
then re-runs the reviewer once. That is **one** iteration, not two — the counter tracks review rounds, not
delegations.

Requirements gaps escalate rather than route. Only `qa-requirements-collector` holds Atlassian access, and a
gap in the ticket is answered by a person, not by a re-read of the same ticket. Re-running the collector is
worth doing only when the ticket itself has changed, and that is a human's call.

Minor findings (`[*-m*]`) attached to a `Pass` are recorded in `history` and never trigger a loop. A
reviewer that passes has already ruled that they do not block.

## Phase 1 — Test design

Sequence: 1.1 -> 1.2 (optional) -> 1.3 -> 1.4 -> 1.5 -> design decision.

The design decision is the gate between design and automation, and it is recorded in the state file:

* **Accept** — `Review Status: Pass`. Set `test_design.status: approved`, `review_status: passed`, move to
  Phase 2.
* **Request revision** — `Needs Revision`. Route per the finding table, bump `iterations.design`, re-run 1.5
  with `previous_findings`.
* **Escalate** — `Blocked`, an abort code, or an open question that no agent can answer. Stop, record it in
  `test_design.open_questions`, and say what a human must decide.

Do not enter Phase 2 on anything but Accept. Both SDETs abort `LEVELS_NOT_ASSIGNED` on an unclassified
design anyway, but arriving there is a wasted delegation.

### Unapproved assumptions — the one decision no agent may make

Step 1.3 returns `UNAPPROVED_UNKNOWNS`, `BLOCKED_SCENARIOS` and `APPROVED_ASSUMPTIONS`. Record all three
in `test_design`. A value the requirements never stated is **not assertable** — the design leaves it out
of `Expected:` and names it as an unknown, and both SDETs refuse to assert it. The only thing that changes
that is a human saying so.

Handle a non-zero `UNAPPROVED_UNKNOWNS` at this gate, before Accept:

* **Manual mode.** List each unknown with the scenario it blocks and what is missing, marking the ones in
  `BLOCKED_SCENARIOS` — those scenarios have no assertion left at all. Then offer:

  | Option | Effect |
  |---|---|
  | **Approve some** | collect value, basis, approver and date for each; re-run 1.3 with `approved_values`; append them to `test_design.approved_assumptions` |
  | **Leave unapproved** (recommended when the value is genuinely undecided) | Accept as-is. Blocked scenarios ship as `Manual only`, and that is an honest design, not a degraded one |
  | **Escalate** | the ticket needs an answer before design can finish. Record in `open_questions` and stop |

  Approving is a decision the user makes with their own name attached, so collect the approver rather than
  filling it in yourself. `approved_values` entries are one per line:
  `SCN-013: 409 — matches existing POST behaviour — @dneprokos — 2026-08-06`.

* **Auto mode never approves.** Record every unknown in `test_design.open_questions`, note them in
  `history`, and continue to Phase 2 with the design as written. The one exception is escalation: if an
  unapproved unknown left the **only** scenario covering an in-scope FR or AC in `BLOCKED_SCENARIOS`, that
  requirement now has no automatable coverage — stop with `status: escalated`, `final_decision: escalate`,
  and name the requirement.

An orchestrator that approves an agent's assumption on the user's behalf is the same defect as an agent
that approves its own, and the fact that the value is probably right is not the point: nobody with the
authority to be wrong about it has taken responsibility for it. Never synthesise an approver name, never
infer approval from a user's general "yes, continue", and never carry an approval forward from another
ticket.

## Phase 2 — Test automation

1. Launch 2.1a and 2.1b in parallel. Record each stream's receipt fields — `IMPLEMENTED_SCENARIOS`,
   `CREATED_TESTS`, `EXECUTION`, `TYPECHECK`, `DEFECT_SUSPECTED`, `SHARED_CHANGE_REQUESTED` — into
   `automation.<stream>`.
2. Launch 2.2a and 2.2b in parallel, each with its stream's report path.
3. Per-stream revision loop, with **independent counters**. A stream at `Pass` is finished and is not
   re-run because its sibling is looping.
4. Final decision when both streams have settled — Accept / Request Revision / Create Follow-Up Work /
   Block / Continue, recorded in `final_decision`.

**Stream independence is a requirement, not an optimisation.** A UI stream that exhausts its cap must not
discard the API stream's `Pass`. Keep both results in state, stop before ship, and name exactly which
stream needs a human.

Two receipt fields need action rather than filing:

* `SHARED_CHANGE_REQUESTED` — a stream needs a change on the other side of the ownership boundary, or in
  `playwright.config.ts` / `framework/`. That is an orchestrator- or human-level decision. Surface it; never
  make the edit here.
* `DEFECT_SUSPECTED` — a red test asserting the specification against a real application defect. That is
  **finished work**, not a failure. It ships, and `qa-ship-tests` puts it in the PR body under
  *Suspected Application Defects*. Never route it back as a bug to fix.

Non-E2E scenarios from the classifier's `Handed Off As Follow-Up Work` table are recorded in
`follow_up_tickets` as a list of what needs creating, and carried into the PR body. This skill creates no
Jira ticket.

## Manual mode — the default

After **every** step, before any further delegation:

1. Persist state.
2. Print a compact summary: the parsed receipt fields only — result, artifact path, counts, finding ids.
   Never paste an agent's full output into the transcript. The agents keep their returns short on purpose;
   re-expanding them here throws that away.
3. Ask for the transition with `AskUserQuestion`. Build the options from the step registry and the receipt:

   | Option | Effect |
   |---|---|
   | **Continue -> `<next step>`** (first, recommended) | delegate the next registry row |
   | **Rework -> `<previous step>`** | re-run the previous agent, carrying this step's findings |
   | **Different agent** | any registry row, with the parameters that row needs |
   | **Pause** | persist `status: paused` and stop; `/qa-workflow <TICKET-ID>` resumes |

   For a reviewer returning `Needs Revision`, the options become **Send back to `<routing target>`**
   (recommended, named from the finding table), **Accept anyway** (records an override in `history` and
   advances), **Pause**.

No iteration cap applies in manual mode. Every loop is already a human decision, and capping a decision
somebody just made would be theatre.

## Auto mode — `--auto`

No `AskUserQuestion` between agents. Route on the normalized outcome:

* `advance` -> next registry row.
* `already_done` -> record and advance without re-running.
* `rework` -> increment that stream's counter, route per the finding table, then re-run the reviewer with
  `previous_findings` set to its own previous block.
* Counter **reaches** `max_review_iterations` (default `2`) with the verdict still `Needs Revision` ->
  **stop**. `status: escalated`, `final_decision: escalate`. Print the stream, the outstanding finding ids
  and what a human must decide. Never loop past the cap, and never lower the bar to clear it.
* `escalate` -> stop immediately with the code.

Confidence is read off the verdict, not guessed at. A reviewer that returns `Pass` has ruled that quality is
met; that is the signal to proceed, and there is no second opinion to form here. A `Pass` carrying Minor
findings still advances.

Still announce each step as it starts and each receipt as it lands — an unattended run that prints nothing
until it finishes is unauditable.

## Step 3 — Ship

The final step is always the git workflow, in both modes.

Invoke the **`qa-ship-tests`** skill with `ticket_id`, `api_review`, `ui_review`, and any `branch_name`,
`base_branch` or `dry_run`. That skill runs its five-condition gate against the files on disk, composes the
branch name, the commit message and the PR body from the two implementation reports and the test design,
and then delegates all four git phases — branch, commit, push, pull request — to
**`git-workflow-orchestrator`** (agent-driven path, section A).

The Git Workflow Orchestrator is what creates the branch, commits, pushes and opens the PR. `qa-ship-tests`
supplies the gate and the naming. Do not reach around it to the git skills or to raw `git`: the gate reads
the reports rather than trusting a caller's claim that both reviews passed, and skipping it removes the one
check that a claimed review actually happened.

**Auto mode does not remove the human confirmations in the ship phase.** `git-commit-creator` asks whether
to stage unstaged files and requires an explicit `OK` on the message; `git-pr-creator` asks when a PR with
the same ticket prefix already exists. Auto mode automates agent-to-agent routing only — the irreversible
git actions keep their confirmation. An auto run therefore pauses at least twice near the end, by design.

`skip_ship` stops after the final decision. `dry_run` passes through, and `qa-ship-tests` stops after
composition having run no git command.

Record `pull_request` and set `phase: done`, `status: completed` on success.

## Return

```text
QA_WORKFLOW_RESULT: OK | ESCALATED | BLOCKED | PAUSED
TICKET: SCRUM-139
MODE: manual | auto
PHASE: test_design | test_automation | ship | done
STATE: .workflow/SCRUM-139.yaml
REQUIREMENTS: requirements/SCRUM-139-requirements.md
TEST_DESIGN: test-design/SCRUM-139-test-design.md
DESIGN_REVIEW: Pass | Needs Revision | Blocked | pending   ITERATIONS: 1/2
API: implemented=SCN-012,SCN-014 review=Pass iterations=1/2
UI: implemented=SCN-021 review=Pass iterations=0/2
PR_URL: <url or "none">
FOLLOW_UP: <ids or "none">
OUTSTANDING_FINDINGS: <ids or "none">
NEXT_ACTION: <what a human must do, or "none">
NOTES: <one line, or "none">
```

On `ESCALATED` or `BLOCKED`, `NEXT_ACTION` is the point of the whole block — name the decision, not the
symptom.

## Must not

- Perform requirements analysis, scenario generation, classification, review or test implementation itself.
  Every step is a delegation; doing the work here is the failure this role exists to prevent.
- Write or edit anything under `requirements/`, `test-design/`, `tests/`, `pages/`, `services/`,
  `fixtures/`, or any implementation report. It writes exactly one file: `.workflow/<TICKET-ID>.yaml`.
- Loop past `max_review_iterations` in auto mode, or raise the cap mid-run to clear a stuck loop.
- Run a git phase, or reach around `qa-ship-tests` to `git-workflow-orchestrator` or raw `git`, before both
  stream reviews are `Pass`.
- Re-run an agent that returned `EXISTS`, or pass a regenerate token to force a rewrite of an artifact a
  reviewer has already read.
- Discard one stream's passing result because the other stream failed.
- Route a `DEFECT_SUSPECTED` entry back as a defect to fix, or ask an implementer to weaken an assertion to
  turn a documented red test green.
- Touch Jira. Only the requirements collector holds Atlassian access; follow-up tickets are reported, never
  created here.
- Paste an agent's full output into the transcript instead of the parsed receipt fields.
- Add a routing hint, a `NEXT:` line, or a sibling agent's name to any file under `.claude/agents/`.
  Routing lives here.
