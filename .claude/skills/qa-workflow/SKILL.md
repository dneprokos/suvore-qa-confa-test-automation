---
name: qa-workflow
description: >-
  QA Lead orchestrator. Drives a Jira ticket end to end through requirements collection,
  requirements review, scenario generation, level classification, design review, parallel
  API and UI test implementation, both code reviews, the pull request, and the hand-back
  that links the pull request on the ticket and moves it to In Review — in manual mode
  (pause for a transition decision after every agent) or auto mode (verdict-driven routing
  with a capped review loop). Owns the workflow state file, every iteration counter and
  every routing decision. Use when asked to "run the QA workflow", "start the lead
  orchestrator", "automate <TICKET-ID> end to end", "run the QA lead", or
  "/qa-workflow <TICKET-ID>".
argument-hint: "<TICKET-ID> [--auto] [--max-review-iterations N] [--resume] [--dry-run]"
---

# QA Workflow — the lead orchestrator

The QA Lead. It turns one Jira ticket into one pull request — and then back into the same ticket, moved to
`In Review` with the pull request linked on it — by delegating every step to a subagent and deciding, after
each one, what happens next.

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
| `skip_jira_handback` | no | flag | `false` — a created pull request always goes back on the ticket |
| `jira_target_status` | no | a status name | `In Review` |
| `dry_run` | no | flag | `false`; passed through to the ship phase |
| `api_endpoints` | no | free text, one line per operation — `GET /api/games?limit&page — public` | absent; the API surface is mapped from the ticket alone. Passed to 1.1 as `endpoint_hints` |
| `api_endpoints_approver` | no | `@handle — YYYY-MM-DD` | required whenever `api_endpoints` is given; without it 1.1 aborts `HINTS_WITHOUT_APPROVER`. Never fill it in yourself |
| `api_surface` | no | `map` \| `ignore` | `map`. `ignore` skips the mapping for the whole run and prints the consequence |
| `on_missing_api_surface` | no | `escalate` \| `ignore` | `escalate`. Auto mode only; what Checkpoint B does when the design wants API coverage and no surface exists |
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
status: in_progress           # in_progress | paused | escalated | blocked | declined | completed
mode: manual                  # manual | auto
current_step: "1.3"

configuration:
  review_requirements: true
  non_e2e_coverage_strategy: create_follow_up_ticket
  max_review_iterations: 2
  jira_target_status: In Review

iterations:                   # one counter per review loop, never shared
  design: 0
  api: 0
  ui: 0

artifacts:
  requirements: requirements/SCRUM-139-requirements.md
  test_design: test-design/SCRUM-139-test-design.md
  metrics: .workflow/metrics/SCRUM-139.jsonl   # written by the hook, not by this skill
  api_surface:
    status: mapped            # mapped | partial | none | ignored | absent
    provenance: openapi       # openapi | user-supplied | mixed | none | ignored
    match_basis: "tag (6 operations)"   # or the reason, when there is no basis
    matched_operations: 6
    spec_gaps: 9
    decided_by: null          # set only on a human ignore, or a user-supplied surface
    decided_at: null

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
    status: pending           # pending | not_applicable | implemented | review_in_progress | passed | needs_revision | blocked
    not_applicable_reason: null   # required whenever status is not_applicable
    report: .workflow/reports/SCRUM-139-api-implementation.md
    implemented_scenarios: []
    created_tests: []
    review_status: pending
    last_findings: null
  ui:
    status: pending           # same enum as api
    not_applicable_reason: null
    report: .workflow/reports/SCRUM-139-ui-implementation.md
    implemented_scenarios: []
    created_tests: []
    review_status: pending
    last_findings: null

pull_request: null           # the PR_URL off the ship receipt — the input to the hand-back
jira:
  status: In Progress        # last status this run observed or set
  handback_status: pending   # pending | done | skipped | partial | failed
  comment: pending           # pending | added | already_present | skipped
follow_up_tickets: []
final_decision: pending       # pending | accept | request_revision | escalate | block | decline | continue
declined:                     # written only when the user declines; null otherwise
  at_step: null               # the step registry row the run was standing on
  question: null              # what was asked, in one line
  reason: null                # the user's own words, or "no reason given" — never a paraphrase you invented

history:
  - { step: "1.1", agent: qa-requirements-collector, result: OK, at: 2026-08-06T10:12:00Z,
      tokens: 63563, duration_s: 109.0, note: "6 FR, 1 AC" }
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
| 1.1 | `qa-requirements-collector` | `ticket_id`, `endpoint_hints`, `endpoint_hints_approver`, `api_surface_mode` | `QA_REQUIREMENTS_COLLECTOR_RESULT`, `API_SURFACE`, `SURFACE_PROVENANCE`, `MATCH_BASIS`, `MATCHED_OPERATIONS`, `SPEC_GAPS` | `requirements/<TICKET-ID>-requirements.md` incl. `# API Surface`, Jira -> In Progress |
| 1.2 | `qa-requirements-reviewer` — skipped when `review_requirements: false` | `ticket_id`, `requirements_path` | `QA_REQUIREMENTS_REVIEWER_RESULT`, `API_SURFACE_EVIDENCE` | five QA sections appended to the same file |
| 1.3 | `qa-scenario-generator` | `ticket_id`, `requirements_path`, `review_findings`, `approved_values` | `QA_SCENARIO_GENERATOR_RESULT`, `UNAPPROVED_UNKNOWNS`, `BLOCKED_SCENARIOS`, `APPROVED_ASSUMPTIONS` | `test-design/<TICKET-ID>-test-design.md` |
| 1.4 | `qa-scenario-classifier` | `ticket_id`, `test_design_path`, `review_findings`, `scenario_ids` | `QA_SCENARIO_CLASSIFIER_RESULT`, `E2E_JOURNEYS`, `E2E_KEPT`, `E2E_DEMOTED` | `Assigned Level:` + `Level Rationale:` per scenario |
| 1.5 | `qa-scenario-reviewer` | `ticket_id`, `test_design_path`, `requirements_path`, `previous_findings` | `Review Status:` | verdict + `[DESIGN-*]` findings |
| 2.1a | `aqa-api-test-creator` — skipped when `automation.api.status: not_applicable` | `ticket_id`, `test_design_path`, `requirements_path`, `iteration`, `review_findings`, `finding_ids`, `run_tests` | `API_SDET_RESULT` | `tests/api/**`, `.workflow/reports/<TICKET-ID>-api-implementation.md` |
| 2.1b | `aqa-ui-test-creator` | same, plus `explore_app` | `UI_SDET_RESULT` | `tests/ui/**`, `pages/**`, `.workflow/reports/<TICKET-ID>-ui-implementation.md` |
| 2.2a | `aqa-api-test-reviewer` — skipped when `automation.api.status: not_applicable` | `ticket_id`, `implementation_report_path`, `test_design_path`, `requirements_path`, `previous_findings` | `Review Status:` | verdict + `[API-*]` findings |
| 2.2b | `aqa-ui-test-reviewer` | same | `Review Status:` | verdict + `[UI-*]` findings |
| 3 | `qa-ship-tests` **skill** | `ticket_id`, `api_review`, `ui_review`, `branch_name`, `base_branch`, `dry_run` | `QA_SHIP_TESTS_RESULT` | branch, commit, push, pull request |
| 4 | `qa-jira-transition` | `ticket_id`, `pr_url`, `branch_name`, `scenarios`, `target_status` | `QA_JIRA_TRANSITION_RESULT` | PR comment on the ticket, Jira -> In Review |

Steps 2.1a/2.1b run **in parallel** — two Agent calls in one message. Same for 2.2a/2.2b. The two streams
write to disjoint paths by design, so concurrency here is a scheduling choice with no correctness cost.

Every prompt carries `ticket_id` — it is the first parameter of every row above, and it is also what files
the run's cost under the right ticket. See *Run cost*.

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
| `PARTIAL` | `advance_with_gap` | the step did some of its work. Record what did not happen and what a human must finish, then advance — never re-run it blind |
| `BLOCKED`, `ABORT`, `Blocked` | `escalate` | stop and report the code |

`already_done` is the load-bearing row. A resumed run, a retried call after a timeout, or a re-entered phase
all land on it, and treating it as a failure would either loop or overwrite an artifact somebody is
mid-way through reading.

Record the abort code verbatim when escalating — `NO_TICKET_ID`, `NO_REQUIREMENTS_DOC`, `MALFORMED_DOCUMENT`,
`NO_TEST_DESIGN`, `LEVELS_NOT_ASSIGNED`, `TICKET_MISMATCH`, `AUT_UNREACHABLE`, `SELF_CHECK_FAILED`,
`NO_REPORT`, `SECRETS_DETECTED`, `NO_PR_URL`, `INVALID_PR_URL`, `NO_TRANSITION_PATH`, `TICKET_NOT_FOUND`,
`WRONG_PROJECT`, `REJECTED`. Each names a different fix, and a summary that says "blocked" without the
code makes a human re-derive it.

## Run cost — the metrics log

Every agent run costs tokens and wall time, and **no agent can report its own**. The numbers are produced
by the harness after the subagent has already stopped, so an agent that printed them would be guessing.
They arrive from outside instead: the `PostToolUse` hook on the `Task` tool
(`.claude/hooks/agent-metrics.mjs`, registered in `.claude/settings.json`) reads the harness's own
accounting and does two things.

1. Appends one JSON line per run to `.workflow/metrics/<TICKET-ID>.jsonl` — the ticket is taken from the
   prompt, which is why **every delegation must name the ticket id in its prompt**. Miss it and the run
   lands in `unassigned.jsonl`.
2. Emits an `AGENT_RUN_METRICS:` line into the transcript immediately after that agent's own output:

   ```text
   AGENT_RUN_METRICS: seq=3 ticket=SCRUM-139 agent=qa-scenario-generator status=completed
   model=claude-opus-5 duration=109.0s tokens_total=63563 in=2 out=5872 cache_read=50682
   cache_write=7007 tool_uses=26 log=.workflow/metrics/SCRUM-139.jsonl
   ```

Treat that line as the last field of the receipt. Read it after every step, echo `agent`, `duration` and
`tokens_total` in the step summary, and copy `tokens` and `duration_s` into the `history` entry you were
writing anyway. It costs one line of state and makes an expensive loop visible while it is still running
rather than after the bill.

Everything else stays in the log file. Do not aggregate by hand and do not re-print the per-run lines you
already echoed — at the end of the run, render the table with

```bash
node .claude/hooks/metrics-report.mjs <TICKET-ID>
```

which prints one row per run **in completion order**, an `n/N` run counter per agent so a three-iteration
review loop reads as three rows, a `Σ` total, and the wall clock. The wall clock is shorter than the sum
whenever 2.1a/2.1b or 2.2a/2.2b ran in parallel; that gap is the parallelism, not an error.

Two rules about these numbers:

* **Never invent, estimate or extrapolate one.** A missing `AGENT_RUN_METRICS` line means the hook is not
  installed or the run predates it — say `metrics unavailable`, never a plausible figure.
* **Cost is a report, never a routing input.** An expensive stream is not thereby a failing one, and no
  iteration is skipped, no review shortened and no cap lowered because the token count looked high. Routing
  reads verdicts only.

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

Sequence: 1.1 -> 1.2 (optional) -> **Checkpoint A** -> 1.3 -> 1.4 -> **Checkpoint B** -> 1.5 -> design
decision.

### The API surface — two checkpoints

An E2E API scenario needs an operation to call. Step 1.1 maps one from the application's OpenAPI document
and records the outcome in `artifacts.api_surface`; a person can supply one instead, or decide the ticket
does not need one. The two checkpoints below are where that decision is taken, and they sit apart on
purpose: **A is cheap and early, B is binding.**

Escalating at A would stop every UI-only ticket, because nothing before 1.4 knows whether the design wants
API coverage at all. A design that assigns zero scenarios to `E2E API` on its own merits is a normal,
complete design, and SCRUM-132 shipped exactly that way.

**Checkpoint A — after 1.2, manual mode only.** Runs when `API_SURFACE_EVIDENCE` is `none` or `absent`.
Print the reason the section gives, then `AskUserQuestion`:

| Option | Effect |
|---|---|
| **Describe the endpoints** (recommended when you know the routes) | Collect the free text **and an approver handle**. Re-run 1.1 with `endpoint_hints` + `endpoint_hints_approver`; the collector resolves to `surface_revision` and rewrites only `# API Surface`. Then re-run 1.2 |
| **Retry the mapping** | Collect different match keys — the collector's `MATCH_BASIS` line names the tags that exist. Re-run 1.1 with them as `endpoint_hints` |
| **Ignore — no API information** | Re-run 1.1 with `api_surface_mode: ignore`. Record `decided_by` and `decided_at`. Print the consequence. The API stream will settle at `not_applicable` at Checkpoint B |
| **Escalate** | Stop, `status: escalated`, naming what a human must confirm |

Auto mode does not stop at A. It already received `api_endpoints` and `api_surface` at the start of the run
if the user wanted them, and it cannot yet know whether API coverage is wanted.

**Checkpoint B — after 1.4, both modes. This is the binding gate.** Count the scenarios carrying
`Assigned Level: E2E API`, then:

| E2E API scenarios | `artifacts.api_surface.status` | Outcome |
|---|---|---|
| 0 | any | `automation.api.status: not_applicable`, reason `the classified design assigns no scenarios to E2E API`. Skip 2.1a and 2.2a. **Not an escalation** |
| >= 1 | `mapped` or `partial` | Proceed. Spec gaps are already `unknown:` in the design and need nothing here |
| >= 1 | `ignored` | `not_applicable` in **both** modes, reason `the API surface was ignored by <decided_by> on <decided_at>`. Print the consequence. Do not re-ask and do not escalate — a person already decided this, and asking again spends their time to reach the answer they gave |
| >= 1 | `none` or `absent` | **manual**: the Checkpoint A options without *Retry*. **auto**: obey `on_missing_api_surface` — `escalate` stops with `status: escalated`, `final_decision: escalate`, `NEXT_ACTION` naming the feature-to-endpoint mapping a human must confirm; `ignore` sets `not_applicable` and prints the consequence |

Choosing *Describe the endpoints* at B re-runs 1.1, then **1.3 and 1.4 in sequence** — a new surface changes
which values are assertable, so the design is regenerated rather than patched. Bump `iterations.design`; the
cap applies as it does to any other design loop.

**The consequence is printed, never implied.** Any `not_applicable` reached for a reason other than "the
design assigned zero API scenarios on its own merits" prints this at the pause, records it in
`test_design.open_questions`, and carries it into the PR body:

> No API surface was mapped for this feature. Scenarios cannot name a route, a status code or a response
> shape, so no E2E API coverage is produced for this ticket.

A skipped stream is always visible in the artifacts. A reader must never have to infer it from an absence.

The design decision is the gate between design and automation, and it is recorded in the state file:

* **Accept** — `Review Status: Pass`. Set `test_design.status: approved`, `review_status: passed`, move to
  Phase 2.
* **Request revision** — `Needs Revision`. Route per the finding table, bump `iterations.design`, re-run 1.5
  with `previous_findings`.
* **Escalate** — `Blocked`, an abort code, or an open question that no agent can answer. Stop, record it in
  `test_design.open_questions`, and say what a human must decide.

Do not enter Phase 2 on anything but Accept. Both SDETs abort `LEVELS_NOT_ASSIGNED` on an unclassified
design anyway, but arriving there is a wasted delegation.

Step 1.4 returns `E2E_JOURNEYS`, `E2E_KEPT` and `E2E_DEMOTED` alongside its result line. Record them in
`test_design` and print them at the 1.4 pause: they are how many distinct journeys reached E2E, which
scenarios hold an E2E level, and which the classification step moved down to a level this repository does
not run. `E2E_DEMOTED` is the size of Phase 2 shrinking on purpose — a design whose E2E set collapsed to two
scenarios is the expected shape, not a gap to route back. The demoted scenarios reappear as follow-up work
below.

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

**A stream at `not_applicable` is not launched at all** — neither its creator nor its reviewer. Checkpoint B
set that status and wrote the reason; re-deriving it here would spend two delegations to be told what the
state file already says. Treat the stream as settled, carry `not_applicable` and its reason through to the
final decision and the PR body, and never let it hold up its sibling. `not_applicable` is a finished state,
not a pending one: it never blocks Accept, and it is never counted as a failure.

The parallelism is unchanged when only one stream is live. Launch the live one on its own.
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
2. Print a compact summary: the parsed receipt fields only — result, artifact path, counts, finding ids,
   and the step's cost as `<duration> / <tokens_total> tokens` off the `AGENT_RUN_METRICS` line.
   Never paste an agent's full output into the transcript. The agents keep their returns short on purpose;
   re-expanding them here throws that away.
3. Ask for the transition with `AskUserQuestion`. Build the options from the step registry and the receipt:

   | Option | Effect |
   |---|---|
   | **Continue -> `<next step>`** (first, recommended) | delegate the next registry row |
   | **Rework -> `<previous step>`** | re-run the previous agent, carrying this step's findings |
   | **Different agent** | any registry row, with the parameters that row needs |
   | **Pause** | persist `status: paused` and stop; `/qa-workflow <TICKET-ID>` resumes |
   | **Decline** (always last, always present) | persist `status: declined` and return — see *Declining* |

   For a reviewer returning `Needs Revision`, the options become **Send back to `<routing target>`**
   (recommended, named from the finding table), **Accept anyway** (records an override in `history` and
   advances), **Pause**, **Decline**.

No iteration cap applies in manual mode. Every loop is already a human decision, and capping a decision
somebody just made would be theatre.

## Declining — the option that must always be on the table

**Every `AskUserQuestion` this skill asks carries a Decline option, in both modes, without exception.**
List it last, after Pause. A question with no way out is not a question; it is a prompt to pick which
way to proceed, and a user who wants none of the offered paths is left with nothing to click.

A decline is not an error and not an escalation. It is the user saying *stop here, this is far enough*,
and it is a legitimate end state for a run.

On a decline:

1. Persist `status: declined`, `final_decision: decline`, and fill in `declined:` — the step you were
   standing on, the question you asked, and the user's reason **in their own words**, or the literal
   string `no reason given` when they gave none. Never invent a reason on their behalf.
2. Change nothing else. Do not roll back an artifact, do not delete a branch, do not revert a Jira
   transition, do not re-run the step to "leave things tidy". Everything produced before the decline
   stays exactly as it is — a declined run's artifacts are still work product, and the user may resume
   from them with `/qa-workflow <TICKET-ID>` at any time.
3. Return `QA_WORKFLOW_RESULT: DECLINED` with **the full receipt block and both trailing sections**,
   exactly as any other terminal return. `NEXT_ACTION` names what was left undone and how to resume.

That last point is the one that matters. A run that stopped early still spent the tokens, still took the
wall clock, and still left files on disk — so a decline reports *more* carefully, not less. Silently
returning "cancelled" throws away the entire record of what the run produced and what it cost, which is
precisely the information the user needs in order to decide whether to resume, restart or abandon.

**Auto mode declines too.** It asks no routing questions, but the ship phase's git confirmations reach
the user directly, and a user who declines a commit, a push or a pull request there has declined the
run's remaining work. Record it the same way, with `at_step: "3"`, and return `DECLINED` — never treat a
declined git confirmation as a phase failure, and never retry it in a loop hoping for a different answer.

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

Still announce each step as it starts and each receipt as it lands, cost included — an unattended run that
prints nothing until it finishes is unauditable, and an unattended loop is exactly where a token count
climbing per iteration is worth seeing before the cap is reached.

## Step 3 — Ship

The git workflow runs in both modes, and it is followed by Step 4 whenever it produced a pull request.

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

Record `pull_request` from the receipt's `PR_URL`, then go to Step 4. The run is not done at the pull
request — the ticket still says `In Progress`.

## Step 4 — Hand back to Jira

A pull request that nobody linked to the ticket is invisible to everyone who works from the board. The
last step puts it back where the run started: delegate to **`qa-jira-transition`** with `ticket_id`, the
`pr_url` from Step 3, the `branch_name` and `scenarios` off the ship receipt, and `jira_target_status`
as `target_status`.

Run it when **all** of these hold, and skip it silently otherwise:

* Step 3 returned `OK` with `pr=SUCCESS`, and
* `PR_URL` is a real URL — not `none`, not empty, and
* `dry_run` and `skip_jira_handback` are both unset.

Never synthesise the URL, never pass a URL from another ticket's run, and never hand back after a
`dry_run` — the agent aborts `INVALID_PR_URL` on a placeholder anyway, but arriving there is a wasted
delegation and a confusing receipt.

Route the outcome:

| Receipt | State written | Then |
|---|---|---|
| `OK` | `jira.status: In Review`, `handback_status: done`, `comment` from the receipt | `phase: done`, `status: completed` |
| `EXISTS` | `handback_status: done`, `comment: already_present` | same — the ticket was already linked and moved |
| `PARTIAL` | `handback_status: partial`, plus what did not happen | `phase: done`, `status: completed`, and `NEXT_ACTION` names the half a human must finish |
| `ABORT` | `handback_status: failed` with the code | `phase: done`, `status: completed` — see below |

**A failed hand-back does not fail the run.** The tests are written, reviewed and pushed; the pull request
exists. A Jira status is a bookkeeping fact about work that already shipped, so record the failure, put the
manual step in `NEXT_ACTION` — "move SCRUM-139 to In Review by hand; PR is `<url>`" — and still return `OK`
for the workflow. Do not retry the step in a loop, and do not roll back or close the pull request.

**Both modes run Step 4, and it needs no confirmation in either.** It is reversible in one click on the
board, unlike every git phase before it. Manual mode still prints the step and its receipt like any other.

`skip_jira_handback` is for a re-run over a ticket already moved by hand, or a demo that must not touch
Jira. Say in the summary that it was skipped, so nobody reads a silent absence as a success.

## Return

```text
QA_WORKFLOW_RESULT: OK | ESCALATED | BLOCKED | PAUSED | DECLINED
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
JIRA: In Progress -> In Review   COMMENT: added | already_present | skipped
FOLLOW_UP: <ids or "none">
OUTSTANDING_FINDINGS: <ids or "none">
NEXT_ACTION: <what a human must do, or "none">
NOTES: <one line, or "none">
AGENT_RUNS: 9   TOKENS: 412,908   AGENT_TIME: 731.4s   WALL_CLOCK: 512.0s
METRICS: .workflow/metrics/SCRUM-139.jsonl
```

On `ESCALATED` or `BLOCKED`, `NEXT_ACTION` is the point of the whole block — name the decision, not the
symptom. On `DECLINED`, add a `DECLINED_AT:` line naming the step and the question, and let
`NEXT_ACTION` say how to resume.

The receipt block is followed by two sections, in this order, on **every** terminal return — `OK`,
`ESCALATED`, `BLOCKED`, `PAUSED` and `DECLINED` alike. A run that stopped early still cost what it cost
and still left files behind; that is exactly when a human needs to see both. **A declined or interrupted
run reports its statistics just like a completed one** — dropping them because the run did not finish
destroys the only record of what was spent and produced.

1. **Artifacts produced** — every path this run created or modified, grouped and each marked with the step
   that produced it and whether it was written this run or already existed: the requirements document, the
   test design, both implementation reports, every file listed in `automation.<stream>.created_tests`, the
   state file, the metrics log. Paths only, no summaries of their contents.
2. **Agent run cost** — the verbatim output of `node .claude/hooks/metrics-report.mjs <TICKET-ID>`, run
   from the project root. One row per run in completion order, so the second and third pass of a review
   loop appear as their own rows against the same agent, then the `Σ` total. Print what the script
   returns; do not reformat, re-sum or trim it.

If the metrics log is missing, print `Agent run cost: metrics unavailable (hook not installed for this
run)` and nothing else under that heading.

## Must not

- Perform requirements analysis, scenario generation, classification, review or test implementation itself.
  Every step is a delegation; doing the work here is the failure this role exists to prevent.
- Write or edit anything under `requirements/`, `test-design/`, `tests/`, `pages/`, `services/`,
  `fixtures/`, or any implementation report. It writes exactly one file: `.workflow/<TICKET-ID>.yaml`.
  `.workflow/metrics/<TICKET-ID>.jsonl` is the hook's file — read it, never edit or delete it.
- Report a token count, duration or cost that did not come from an `AGENT_RUN_METRICS` line or from
  `metrics-report.mjs`, or let any of those numbers influence a routing, iteration or review decision.
- Loop past `max_review_iterations` in auto mode, or raise the cap mid-run to clear a stuck loop.
- Run a git phase, or reach around `qa-ship-tests` to `git-workflow-orchestrator` or raw `git`, before both
  stream reviews are `Pass`.
- Re-run an agent that returned `EXISTS`, or pass a regenerate token to force a rewrite of an artifact a
  reviewer has already read.
- Discard one stream's passing result because the other stream failed.
- Route a `DEFECT_SUSPECTED` entry back as a defect to fix, or ask an implementer to weaken an assertion to
  turn a documented red test green.
- Touch Jira itself. Two agents hold Atlassian access — one at each end of the run — and every Jira change
  goes through one of them. Follow-up tickets are reported, never created.
- Hand a ticket back to `In Review` on a pull request that was not created this run: a `dry_run`, a skipped
  ship phase, a `PR_URL` of `none`, or a URL carried over from another ticket.
- Fail, reverse or re-run the ship phase because the Jira hand-back failed. The pull request is the
  deliverable; the status is bookkeeping.
- Ask an `AskUserQuestion` whose options are all ways of proceeding. Decline is always available, listed
  last, in both modes.
- Return a terminal result without the receipt block, the artifacts section and the cost section —
  `DECLINED` and `PAUSED` included. A run that stopped early is exactly when that record matters most.
- Treat a decline as a failure to recover from: no retry of the declined step, no rollback of an artifact
  already written, no reason invented on the user's behalf.
- Paste an agent's full output into the transcript instead of the parsed receipt fields.
- Add a routing hint, a `NEXT:` line, or a sibling agent's name to any file under `.claude/agents/`.
  Routing lives here.
