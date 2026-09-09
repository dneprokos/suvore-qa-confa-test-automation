# QA workflow hardening plan

Written 2026-09-09. Source: an agentic-workflow review of `.claude/skills/qa-workflow/` and its agents,
re-verified against the files before anything here was planned. The verification changed the plan: two of
the review's five findings did not survive it, and the smallest one turned out to be the only defect that
breaks documented behaviour today.

## Findings, after verification

| # | Review finding | Verdict |
|---|---|---|
| 1 | API implementation can be skipped by orchestration drift | **Overstated — medium, not high** |
| 2 | Zero-API policy duplicated between orchestrator and creator | **True, low — leave it** |
| 3 | Agent bodies oversized | **Accurate** |
| 4 | `--emit-manifest` exists but is underused | **Wrong — already the gate** |
| 5 | Older state files miss newer configuration keys | **Real, and misdiagnosed — this is P0** |

### 1 — drift is contained, but nothing checks it

Checkpoint B is already deterministic prose: `.claude/skills/qa-workflow/SKILL.md:544-548` routes on
`E2E API >= 1` plus `artifacts.api_surface.status`, and the step registry (`SKILL.md:365-368`) skips
2.1a/2.2a only on `automation.api.status: not_applicable`.

The harm path is contained downstream as well. `.claude/skills/qa-ship-tests/SKILL.md:29` reads an unknown
`api_review` as **not passed**, and rule 1 at `:45` stops the run on it. So a forgotten API stream costs a
stopped ship, not a silent release of half the coverage.

What is missing is that nothing *machine-checks* the state file for it. That is worth fixing, but as a
validation rule rather than as a new preflight script.

### 2 — a fallback, not a conflicting policy

`.claude/agents/aqa-api-test-creator.md:84` returns `OK` with `IMPLEMENTED_SCENARIOS: none` when there are
zero E2E API scenarios, and calls it a valid outcome. The orchestrator settles the same case earlier at
Checkpoint B. The two agree; the second one is defense in depth for a stream launched by hand. No change.

### 3 — sizes confirmed

```
838  .claude/skills/qa-workflow/SKILL.md
559  .claude/agents/aqa-ui-test-creator.md
548  .claude/agents/qa-scenario-generator.md
392  .claude/agents/aqa-api-test-creator.md
355  .claude/agents/qa-scenario-classifier.md
```

### 4 — the manifest is already the gate

`SKILL.md:517-527` requires `node scripts/test-design-lint.mjs <design> --emit-manifest` at Checkpoint B,
reads `scenarios_by_level` and `classified` from it, and states outright: *"Counting the levels by hand is
what this replaces."* The finding describes a state the repository left some time ago.

### 5 — `on_missing_api_surface` is not a schema key at all

This is not an old state file missing a newer key. The key does not exist in the schema:

- `scripts/workflow-state.mjs:155-171` — `configuration.children` defines `review_requirements`,
  `non_e2e_coverage_strategy`, `max_review_iterations`, `batch_threshold`, `batch_size`,
  `jira_target_status`, `on_blocked_alternative_flow`, `notes`. No `on_missing_api_surface`.
- `scripts/workflow-state.mjs:1299-1306` — the `init` template does not write it.
- Writing it is refused outright:

  ```
  $ node scripts/workflow-state.mjs set SCRUM-115 configuration.on_missing_api_surface=ignore
  "configuration.on_missing_api_surface" is not a path the schema defines. A field the schema has no
  opinion on belongs under a notes map — try configuration.notes.on_missing_api_surface — or pass
  --allow-unknown to write it where you asked
  ```

Meanwhile `SKILL.md:61` documents it as a run parameter, `SKILL.md:137` prints it in the parameter banner,
`SKILL.md:547` routes Checkpoint B on it in auto mode, and `references/workflow-map.md:43,109` draw it as
an escalation edge.

Consequences today: the value can only reach disk under `--allow-unknown` or as a `notes.` field the
banner does not read; a resumed run loses it and reports `on_missing_api_surface escalate default` for a
run somebody set to `ignore` — a value nobody chose, certified as a decision. That is precisely the harm
the "init writes every `configuration.*` key the schema carries" rule in `CLAUDE.md` exists to prevent,
and it is also the harm `reset` carries `configuration:` forward to avoid.

## Verdict on the proposed plan

| Proposed | Verdict |
|---|---|
| New `scripts/workflow-phase2-plan.mjs` | **Drop.** It restates `--emit-manifest` plus the Checkpoint B table. If a machine-readable phase-2 scope is ever wanted, it belongs as a `phase2-plan` read mode on `workflow-state.mjs`, which already owns the state file, not as a fifth script |
| Call that preflight after Checkpoint B | Moot without the script |
| Ship-gate assertion | **Take, in a cheaper form** — a `WS-E` validation rule, no new script |
| Extract shared stream-scope contract | **Take** — `docs/automation/contracts/`, per the existing house rule |
| Keep one orchestrator, checks in scripts | Already the rule; no change needed |
| Script tests for the failure cases | **Take**, scoped to what actually ships |
| State migration for older files | **Take** — extend the existing `normalize` command |

## Work items

### P0 — make `on_missing_api_surface` a real configuration key — **done 2026-09-09**

1. `scripts/workflow-state.mjs` — add `missing_api_surface: ["escalate", "ignore"]` to `ENUMS` (beside
   `blocked_alternative_flow` at `:96`), and an `on_missing_api_surface` enum child in
   `configuration.children` (`:155-171`) with a `doc` saying it is auto-mode only and what each value does
   at Checkpoint B.
2. Add `on_missing_api_surface: escalate` to the `init` template (`:1299-1306`), so a first session and a
   resume agree.
3. Fixtures: `scripts/__fixtures__/state-clean.yaml` gains the key; `state-legacy-115.yaml` deliberately
   does **not**, so it stays the regression case for P2.
4. `scripts/__tests__/workflow-state.test.mjs` — `init` emits the key; `set` accepts `escalate`/`ignore`
   and rejects a third value; `--strict` stays clean on the updated clean fixture.

Nothing in `SKILL.md` changes: the documentation was already right and the schema was behind it.

### P1 — a stream may not still be `pending` at the ship phase — **done 2026-09-09, as `WS-E35`**

1. New `WS-E<nn>` in `validate`: `automation.api.status` or `automation.ui.status` of `pending` is an
   error when `phase` is `ship` or later (`complete`), naming the stream. `in_progress` is an error there
   too — a stream mid-flight cannot be shippable.
2. This is what makes finding 1 machine-checked: a run that reached the ship gate without settling the API
   stream now fails validation before `qa-ship-tests` is delegated, rather than being caught by the ship
   skill reading `api_review` as unknown.
3. Test: a state document at `phase: ship` with `automation.api.status: pending` fails with the new code;
   the same document with `not_applicable` plus a reason passes; with `passed` passes.

Shipped slightly wider than planned, in one respect worth recording: `needs_revision` and `blocked` are
rejected at those phases too, with a second message — a stream whose review asked for changes nobody made
is not "in flight", it is settled against shipping, and neither is a state a pull request may be opened
from. And because every write validates before it reaches disk, the rule is containment rather than a
report: `set phase=ship` is *refused* while a stream is unsettled, not merely flagged afterwards.

### P2 — `normalize` back-fills missing configuration defaults — **done 2026-09-09**

1. Extend `normalize` so that, alongside its duplicate-key repair, it writes any `configuration.*` key the
   schema defines and the document lacks, at the template default, and prints one line per key added.
2. It must not touch `phase`, `status`, `history` or any counter — this is a schema back-fill, not a
   migration of the run.
3. Test against `state-legacy-115.yaml`: the missing keys appear at their defaults, every other byte is
   unchanged, and a second run prints `unchanged`.

### P3 — extract the shared stream-scope rules — **done 2026-09-09**

One new file, `docs/automation/contracts/e2e-stream-scope.md`, carrying the rules both streams' creators
and reviewers currently restate: what `Assigned Level:` selects, how `Folds Into:` removes a scenario from
the selection without removing its coverage, what a skipped scenario is, what `not_applicable` means for a
stream, and the difference between selected and implemented. Then cut the restatements from
`aqa-api-test-creator.md`, `aqa-ui-test-creator.md` and both reviewers, replacing each with an anchored
`Read` at the step that needs it plus a `Must not` against working from memory — the same shape as
`api-surface-reading.md`.

The file may not name an agent, per the `docs/automation/` rule.

What it actually bought, stated plainly: **one source of truth, not fewer tokens.** The four bodies went
from 1,509 lines to 1,490 while the contract added 104 — the near-verbatim duplication moved rather than
disappeared, because what was cut was explanation and what stayed is the per-stream flavour and the
self-check bullets, which are enforcement rather than prose. The win is that the rule the code is written
against and the rule it is reviewed against are now the same words, which is the same argument
`api-surface-reading.md` was extracted on.

Writing one canonical copy surfaced two places where the streams had silently diverged, and the contract
settles both:

- **The one-Act rule was only in the API stream.** "A fold never merges two `// Act` blocks" had no
  counterpart in the UI creator's fold rules or its self-check, though the UI reviewer's row 1b half
  implied it. It is now in the contract for both, and in the UI self-check.
- **`scenario_ids` naming an id at another level** was handled in both creators and in neither reviewer's
  vocabulary; it is now one bullet in §2.

## P4 — the second review's findings — **done 2026-09-09**

A review of P0–P3 scored the work 6/10 and named four things. Three were acted on; one was already
true and is recorded here so it is not re-raised.

- **The script suite was red (6 failures).** They were `TD-E22` work in progress that predates this
  plan — a linter rule shipped with no fixtures updated for it and no tests of its own. Reconciled:
  the two fixtures carrying a backend-backed UI scenario now state their decision, one fold test that
  anchored on "the first bare `Notes:`" was re-anchored on the line it actually meant, and `TD-E22`
  gained six cases of its own. **239/239.**
- **`TD-E22` was enforced and never taught.** A rule that lives only in a linter fails documents whose
  authors followed their instructions exactly. The rule is now written once in
  `docs/automation/references/test-design-document-shape.md`, the design step writes it from there, the
  design review rules on whether a decision is *true* (the script cannot), and the classification step
  gets one narrow exception to its byte-identical rule — when its own promotion to `E2E UI` creates the
  obligation, it writes the decision and reports it on `API_COVERAGE_ADDED:`. Without that exception the
  two rules deadlock: the step that creates the obligation is forbidden to satisfy it, and the step that
  could satisfy it never runs again.
- **`WS-E35` contains a missed stream late, at the ship gate.** True, and the earlier half was missing:
  nothing checked the stream *decision* against the design that produced it. `workflow-state.mjs
  check-streams` now does, reading `--emit-manifest` rather than re-deriving anything, and it runs twice
  — at the automation gate, right after the decision is written, and again before the ship delegation.
  `CS-E02` is the case that mattered: a stream settled `not_applicable` while the design assigns it
  scenarios. This is the plan's dropped item 1 in the form it argued for — a mode on the script that
  already owns the state file, not a fifth script.
- **`normalize` was not run on resume.** Step 0 now runs it on every resume, before the banner, and
  announces what it added. A missing configuration key is a warning-free absence, so `validate` could
  never have caught it.

## Not doing

- A fifth script for phase-2 planning.
- Splitting `qa-workflow` into more agents. The orchestrator stays the only router; mechanical checks go
  into the scripts that already exist.
- Any change to Checkpoint B's routing table. It is correct; only its settings storage was not.
