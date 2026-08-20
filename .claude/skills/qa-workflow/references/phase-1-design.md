# Phase 1 — sizing the design, and the assumptions nobody may approve

Read this **before the first 1.3 delegation of a run**, and again before taking the design decision.
It governs two things `SKILL.md` deliberately does not restate: how large a test basis is split, and
what happens to a value the requirements never stated. It is part of the skill: same rules, including
the one that no file here names an agent.

## Sizing 1.3 — batch a large test basis

**Before the first 1.3 delegation, count the test basis yourself.** Read
`requirements/<TICKET-ID>-requirements.md` and collect every `### FR-<n>.<n>` and `### AC-<n>`
heading, in document order. That count decides how 1.3 runs:

| In-scope requirements | How 1.3 runs |
|---|---|
| <= `batch_threshold` (default 15) | one delegation, no `requirement_ids` |
| > `batch_threshold` | **batched**: consecutive delegations of `batch_size` ids (default 10), in document order, until every id has been covered |

The generating step models four ISTQB techniques and sweeps twelve coverage categories over
everything it is given in a single pass, and above roughly fifteen requirements the models thin out
before the scenario count does. It reports the risk — `OVERSIZED_INPUT: yes` on its receipt — and it
may not act on it: it is barred from choosing its own scope, precisely so that this decision stays
with the rest of the routing.

How a batched run goes:

1. Split the ids into consecutive groups of `batch_size`, keeping document order. A trailing group
   smaller than `batch_size` is a batch like any other; never fold it into the previous one.
2. Delegate 1.3 once per group, **sequentially**, passing `requirement_ids` as that group's ids. The
   first call finds no document and resolves to `first_run`; every later one finds the document plus
   `requirement_ids` and nothing else, which is the next-batch row — it appends, continues the
   `SCN-`/`EP-`/`BV-`/`DT-`/`ST-` numbering, and leaves every pre-existing line byte-identical.
3. After each batch append `{ requirement_ids, scenario_ids, revision }` to `test_design.batches`
   from that run's `SCOPE`, `SCENARIO_IDS` and `REVISION` lines, and set `current_step: "1.3"` so a
   resume picks up at the next uncovered group rather than re-running one.
4. **Batching never touches `iterations.design`.** That counter tracks review rounds, and no review
   has happened yet. Raising it here would spend the loop budget on work nobody criticised.
5. In manual mode, pause once after the last batch, not after each one — a half-generated design is
   not a decision anyone can take. Print the batch list at that pause so the split is visible.

Only when every batch is done does 1.4 run. **1.4 and 1.5 run once, over the whole document** — a
partial design is never handed to the review, whose partial-design finding exists for the run that
stopped early rather than for one still in progress.

An abort mid-batch leaves a real design covering the batches that finished, and the traceability
matrix says so: the ids not yet reached read `_Out of scope for this run (requirement_ids)._` Record
where it stopped in `test_design.open_questions` and stop — never hand a partial design to 1.4 to
"make progress".

## Unapproved assumptions — the one decision no agent may make

Step 1.3 returns `UNAPPROVED_UNKNOWNS`, `BLOCKED_SCENARIOS` and `APPROVED_ASSUMPTIONS`. Record all
three in `test_design`. A value the requirements never stated is **not assertable** — the design
leaves it out of `Expected:` and names it as an unknown, and both automation streams refuse to assert
it. The only thing that changes that is a human saying so.

Handle a non-zero `UNAPPROVED_UNKNOWNS` at this gate, before Accept:

* **Manual mode.** List each unknown with the scenario it blocks and what is missing, marking the
  ones in `BLOCKED_SCENARIOS` — those scenarios have no assertion left at all. Then offer:

  | Option | Effect |
  |---|---|
  | **Approve some** | collect value, basis, approver and date for each; re-run 1.3 with `approved_values`; append them to `test_design.approved_assumptions` |
  | **Leave unapproved** (recommended when the value is genuinely undecided) | Accept as-is. Blocked scenarios ship as `Manual only`, and that is an honest design, not a degraded one |
  | **Escalate** | the ticket needs an answer before design can finish. Record in `open_questions` and stop |

  Approving is a decision the user makes with their own name attached, so collect the approver rather
  than filling it in yourself. `approved_values` entries are one per line:
  `SCN-013: 409 — matches existing POST behaviour — @dneprokos — 2026-08-06`.

* **Auto mode never approves.** Record every unknown in `test_design.open_questions`, note them in
  `history`, and continue to Phase 2 with the design as written. The one exception is escalation: if
  an unapproved unknown left the **only** scenario covering an in-scope FR or AC in
  `BLOCKED_SCENARIOS`, that requirement now has no automatable coverage — stop with
  `status: escalated`, `final_decision: escalate`, and name the requirement. That escalation has one
  carve-out, below, and it is off by default.

### The alternative-flow carve-out — `on_blocked_alternative_flow`

`escalate` is the default and is the rule exactly as stated above. `continue` narrows it: a requirement
whose coverage was only ever **alternative flow** no longer stops the run.

The reason to have it is that the rule as written treats every uncoverable requirement alike, and they
are not alike. A ticket whose happy path is fully specified and whose eighth validation message nobody
wrote down is a ticket worth automating now — the main flow is testable, the gap is real, and stopping
the whole run over it buys nothing a recorded open question does not. A ticket whose *primary* behaviour
has no assertable outcome is a different thing, and no setting relaxes that one.

**The test, run per requirement, only for a requirement the rule above would stop on.** Take the model
from the manifest rather than reading categories out of the document — it is the same script the
Checkpoint B gate counts from, and re-deriving a field from prose at a gate is the habit these gates
exist to remove:

```bash
node scripts/test-design-lint.mjs test-design/<TICKET-ID>-test-design.md --emit-manifest
```

A requirement is **main flow** when either holds:

* its id is an `AC-`. An acceptance criterion is the agreed primary behaviour by definition, whatever
  category the scenario covering it happens to carry;
* any scenario citing it in `scenarios[].requirements` has `category: "Happy path"`.

Anything else — a requirement covered only by `Validation rules`, `Error handling`,
`Permission / authorization`, `Boundary`, `Negative path`, `Retry / timeout`, `Data`, `State transition`,
`Non-functional`, `Regression impact` or `Integration` scenarios — is **alternative flow**.

| Requirement | `on_blocked_alternative_flow` | Outcome |
|---|---|---|
| main flow | `escalate` or `continue` | **stop** — `status: escalated`, `final_decision: escalate`, name the requirement. The setting does not reach this row |
| alternative flow | `escalate` | **stop** — the historical behaviour, unchanged |
| alternative flow | `continue` | continue to Phase 2. Record the requirement, its blocked scenario ids and the unknown in `test_design.open_questions`, and append a `history` entry naming the setting as the reason the run did not stop |

Rules that do not move:

* **A mixed set escalates.** When more than one requirement would stop the run and any of them is main
  flow, the run stops — the alternative-flow ones are recorded and the escalation names all of them, so
  the human sees the whole gap rather than the half that happened to be blocking.
* **`continue` is not an approval.** Nothing is asserted that was not assertable before; the blocked
  scenarios still ship as `Manual only` and the unknown is still unapproved. This setting decides whether
  the run stops, and it decides nothing else. It never fills in a value, never supplies an approver, and
  never reaches a scenario's `Expected:`.
* **Say it out loud, twice.** The run-parameters banner prints the setting and what it relaxes before the
  first delegation, and this gate prints each requirement it let past with its unknown. A gate that was
  relaxed silently is indistinguishable from a gate that never fired.
* **Manual mode ignores it entirely.** The three options above are already the whole decision there, and
  a human at the gate is a better answer than a rule about categories. Passing it in manual mode is not
  an error; it simply has nothing to do.
* **An unclassified design is not evidence.** `classified: false` in the manifest means step 1.4 has not
  run, which is fine here — `category` is written by the generating step, not the classifying one, so
  this test works before classification. But a manifest with `counts.scenarios: 0` decides nothing:
  stop rather than reading an empty model as "no main flow was harmed".

An orchestrator that approves an agent's assumption on the user's behalf is the same defect as an
agent that approves its own, and the fact that the value is probably right is not the point: nobody
with the authority to be wrong about it has taken responsibility for it. Never synthesise an approver
name, never infer approval from a user's general "yes, continue", and never carry an approval forward
from another ticket.
