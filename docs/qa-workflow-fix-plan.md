# QA workflow — fix plan

Source: `docs/review.md` (architecture review, 2026-09-09, gitignored — regenerate with
`/agentic-workflow-review .claude/skills/qa-workflow/SKILL.md` if lost). Finding ids `W*` and
recommendation ids `R*` below refer to it.

Goal: fewer delegations and fewer re-reads per run, **no quality gate removed**. Baseline to beat is
SCRUM-132: 18 delegations, ~59 min Phase 1, ~44 min Phase 2, design review cap reached.

## How to work this plan

- One batch = one branch = one PR. Steps inside a batch are ordered; do not start the next batch
  before the previous one is merged and its check passed.
- Every step names its files, the edit, and a check. A step is done when the check passes.
- House rules that apply to every step (from `CLAUDE.md`):
  - no agent file names another agent; no file under `docs/automation/` names an agent;
  - reviewers get no `Write`/`Edit`; slug prefix and tool grant agree;
  - a script change ships with a test under `scripts/__tests__/` and `npm run test:scripts` green;
  - `agent_build_plan.md` is canonical for nothing — update it last in each batch, never first.
- Regression check for every batch: `npm run test:scripts` and `npm run typecheck` green, and the
  batch's own check below.
- Measured check at the end of batches 3 and 4: run `/qa-workflow SCRUM-115` (ticket is reset and in
  `To Do`) and compare `node .claude/hooks/metrics-report.mjs SCRUM-115` — delegation count and
  per-step duration — against the baseline table in `docs/review.md` §1.

## Decisions to take before batch 3

| # | Decision | Options | Default if undecided |
|---|---|---|---|
| D1 | Merge the classifier into the generator (R5)? | merge · keep both agents and only fix routing order | merge — the reviewer remains the independent gate on levels |
| D2 | Design review cap and carry-over (R2) | cap 1, open Majors into the PR body · keep cap 2 | cap 1 |
| D3 | Retire `Requirement Gap` as a level (R11)? | retire · keep | keep until batch 3 is measured; revisit |
| D4 | Ship on the script path (R6)? | script path with confirmations inside `qa-ship-tests` · keep section A and add a message channel | script path |

---

## Batch 1 — zero-risk cleanup (no behaviour change)

Branch: `chore/qa-workflow-dedupe`

### 1.1 Read the test-basis ids from the 1.1 receipt (R1, W11)

- `.claude/skills/qa-workflow/references/phase-1-design.md:10-12` — replace "count the test basis
  yourself. Read `requirements/…`" with: take `FR_IDS` and `AC_IDS` from the 1.1 receipt; on a resume
  read them from `test_design.notes.requirement_ids` in the state file.
- `.claude/skills/qa-workflow/SKILL.md` step registry row 1.1 — add `FR_IDS`, `AC_IDS` to *Receipt
  line to parse*; after 1.1 persist them with `set-block <T> test_design.notes.requirement_ids`.
- Check: grep `phase-1-design.md` for "Read" in the sizing section returns nothing.

### 1.2 Delete inline copies of shared text from the four Phase 2 agents (R7, W5)

Keep a one-line pointer where each block was ("the rule is in `<path>` §…; read it there").

| File | Lines to remove | Canonical copy |
|---|---|---|
| `.claude/agents/aqa-api-test-creator.md` | 163-193 (phase/layer table, banned shortcuts), 197-206 (response shapes), 122-136 (convention table), 66-76 (API-surface table paraphrase) | `docs/automation/etalons/api-spec-etalon.md:37-88,530-542`; `references/api-surface-reading.md` |
| `.claude/agents/aqa-api-test-reviewer.md` | 72-73 (mode table), 184 (severity), 194-233 (report block — keep only "emit the block in `review-verdict-contract.md` §…") | `docs/automation/contracts/review-verdict-contract.md` |
| `.claude/agents/aqa-ui-test-creator.md` | 286-291 (module-scope table), 100-121 (convention table), 93-95 (inlined `utils/` member list) | `docs/automation/etalons/ui-spec-etalon.md:232-237,515-542`; the `utils/` files themselves |
| `.claude/agents/aqa-ui-test-reviewer.md` | 162-205 grep rows → keep until batch 2 replaces them with the script; remove restated tier ladder at 169 | `ui-spec-etalon.md:131-143` |

- Also: `docs/automation/etalons/ui-spec-etalon.md:270-335` (fold section) → one paragraph pointing
  at `contracts/e2e-stream-scope.md` §3.
- Check: `grep -c "with\*() call\|builder performs the Act" .claude/agents/aqa-api-test-creator.md`
  ≤ 1; every rule that was removed still exists in exactly one `docs/automation/` file.

### 1.3 Report front matter carries what the reviewer cites (R10, W8)

- `docs/automation/contracts/implementation-report.md` §1 — add to front matter: `api_surface`,
  `mechanics_observed`, `locator_gaps`, `cleanup_gaps`, `shared_additions` (UI), `cleanup_gaps`
  (API). Delete the stale claim at lines 24-27.
- `.claude/agents/aqa-ui-test-reviewer.md:54,107,110,169,189` — cite the front-matter key, not "the
  receipt".
- `.claude/agents/aqa-api-test-creator.md:320-341` — add `CLEANUP_GAPS:` to the receipt (already
  required by `implementation-report.md:214`).
- `.claude/agents/aqa-api-test-reviewer.md:26-35` — add `requirements_path` to the Inputs table.
- Check: grep both reviewers for the word "receipt" — every hit refers to their *own* output block.

### 1.4 Remove unconsumed fields (R14, W12)

- Reviewer output block (`review-verdict-contract.md:271-310` and both reviewers): drop
  `Suggested Improvements`, `Final Recommendation` (soft routing), `Files Reviewed`; drop the `focus`
  input.
- Creator receipts: drop `TEST_COMMAND`, `NEW_PAGE_OBJECTS`, `EXPLORED_APP`, `KNOWN_LIMITATIONS`
  (the report keeps them).
- `.claude/agents/git-change-analyst.md` — delete the PR-facts mode (Step 6, `include_pr_facts`,
  `PR_TITLE/PR_COMMIT_SUBJECTS/PR_FILE_GROUPS`, `STAGED_FINGERPRINT`, `CHANGE_STATS`); no caller.
- `.claude/skills/qa-ship-tests/SKILL.md:169-179` — drop `COMMIT` from the receipt.
- Check: for every remaining receipt field, `grep -rn <FIELD> .claude/skills` finds a reader.

### 1.5 Contract and doc fixes (R15, W13-W15)

- `docs/automation/contracts/revision-contract.md:19-24` — add the `regenerate` row, or remove
  `regenerate` from `CLAUDE.md`'s mode list. Pick one.
- Both creators — one sentence after the mode table: "On `revision`, Steps 2, 3 and 8-10 run; Steps
  4-7 are skipped unless a finding names a file they cover."
- `docs/automation/references/browser-exploration.md` — drop line-number citations (8, 14, 77,
  82-83); replace `:218-220` with "values come from the test design; `# API Surface` for mechanics
  only"; replace the pointer to `playwright-cli/SKILL.md` with the command list inline (a subagent
  cannot open a skill).
- `docs/conference/agent_build_plan.md:53-56,198` — 4 scripts, 21 checks.
- Check: `grep -n "config.ts:\|login-page.ts:\|home-page.ts:" docs/automation/references/browser-exploration.md` empty.

### 1.6 Scope the requirements review to test-blocking gaps (R12, W9)

- `.claude/agents/qa-requirements-reviewer.md` Step 5 — Pass A stays an internal rubric; Step 6
  writes under `# QA Review Notes` only findings that block a test (missing value, missing outcome,
  contradiction). One finding per distinct missing value, ids attached (the grouping rule at 489-497
  already exists — make it the default, not the ≥3 exception).
- Check: on the next real run, `MISSING_INFORMATION` + `QA_REVIEW_NOTES` for a 5-requirement ticket
  is < 10 (SCRUM-132 baseline: 26).

Batch 1 done when: `npm run test:scripts` green; `grep -rn "qa-\|aqa-" docs/automation/` returns
only slug-prefix mentions in finding ids; a dry `/qa-workflow SCRUM-115 --dry-run` prints the banner.

---

## Batch 2 — deterministic gates

Branch: `feat/spec-lint`

### 2.1 `scripts/spec-lint.mjs` (R4, W4)

- New script, same shape as `test-design-lint.mjs`: `node scripts/spec-lint.mjs --stream api|ui
  [--changed <path>...]`, exit 0/1, one `SL-E<nn>` per violation with file and line, plus
  `--emit-json`.
- Rules (each a test fixture pair under `scripts/__fixtures__/spec-lint/`):

| Code | Rule | Scope |
|---|---|---|
| SL-E01 | `waitForTimeout`, `networkidle`, `setTimeout` | `tests/**`, `pages/**` |
| SL-E02 | `from "@playwright/test"` in a spec | `tests/**` |
| SL-E03 | `expect(` or `expect.poll` under `pages/` | `pages/**` |
| SL-E04 | `http://` / `https://` literal in a spec or page object | `tests/**`, `pages/**` |
| SL-E05 | `process.env` outside `framework/configuration/config.ts` | everywhere |
| SL-E06 | title regex per stream (`<Subject> - Should …`; UI also `As a <role>, I should …`) | `tests/**` |
| SL-E07 | exactly one `// Arrange`, `// Act`, `// Assert` per `test(` | `tests/**` |
| SL-E08 | `// SCN-NNN` comment above every `test(` | `tests/**` |
| SL-E09 | `.with[A-Z]\w*(` under `tests/ui/` | `tests/ui/**` |
| SL-E10 | `uniqueApiEmail` under `tests/ui/`, `uniqueUiEmail` under `tests/api/`; e-mail literal containing `.` or `+` before `@` | `tests/**` |
| SL-E11 | `LOCATOR-FALLBACK: tier <n>` comment on a `pages/` field without a matching row in the report's `LOCATOR_GAPS` (pass `--report <path>`) and vice versa | `pages/**` |
| SL-E12 | `xpath=`, `.css-[a-z0-9]{4,}`, `page.$(`, `nth(` on a non-structural element | `pages/**` |
| SL-E13 | `--changed` path outside the stream's write boundary (`tests/api/**`, `services/api/**`, `fixtures/api-fixture.ts` / `tests/ui/**`, `pages/**`, `fixtures/pages-fixture.ts`, additive `services/api/**`, `utils/**`) | changed set |
| SL-E14 | credential-looking literal (`password: "…"`, `token = "…"`) in a spec | `tests/**` |

- Wire it: `package.json` script `lint:spec`; `npm run test:scripts` covers it.
- Check: fixtures pass; running it on the current `tests/` reports only known pre-existing issues
  (record them in the PR).

### 2.2 Creators run it, reviewers read it

- `aqa-api-test-creator.md` Step 9 / `aqa-ui-test-creator.md` Step 10 — replace the hand-grep
  lines with one command; add to the Bash allowlist; add a `Must not` against treating a clean run
  as evidence about assertions.
- `aqa-api-test-reviewer.md` Step 3 rows 5, 11-15, 17-19 and `aqa-ui-test-reviewer.md:162-205`
  (rows 5, 6b-d, 8, 9, 11, 14, 16, 18, 20-22b, 24, 25) — replace with "run `spec-lint`; every
  violation is a finding with your own `[API-*]`/`[UI-*]` id; the rows below need judgement". Keep:
  assertion carries the value; wait matches an observed mechanic; scenario ↔ test truthfulness;
  cleanup registered before the assert; red test asserts the spec.
- Both etalons — drop the E1-E13 / numbered convention lists; say "mechanical form is enforced by
  `scripts/spec-lint.mjs`".
- Check: neither reviewer body contains a grep pattern; both Bash allowlists list the script.

### 2.3 Environment preflight at Checkpoint B (R13)

- `SKILL.md` Checkpoint B — before launching Phase 2: `curl -s -o /dev/null -w "%{http_code}"
  $BASE_URL/` and `npx playwright install --dry-run` (or check `~/.cache/ms-playwright`). Failure
  → manual asks, auto escalates `AUT_UNREACHABLE` / `BROWSER_MISSING` before any creator runs.
- Check: with the app stopped, `/qa-workflow SCRUM-115 --auto` stops at Checkpoint B, not inside
  2.1b.

### 2.4 Design review severity floor (R2, W3) — needs D2

- `qa-scenario-reviewer.md` Step 3 — Major = "changes what a test asserts, or whether an in-scope
  requirement / feasible coverage item is covered". Wording, labels, heading text, matrix cell
  hygiene = Minor.
- Step 1b `re_review` — a new Major may name only a block that changed since the previous iteration
  or that a previous finding named; anything else is Minor with `(untouched block)`.
- `review-verdict-contract.md` — same floor for `[API-*]`/`[UI-*]`.
- `SKILL.md` Inputs — `max_design_iterations` default 1 (D2); on cap, `test_design.status:
  approved_with_open_findings`, ids into `open_questions`, and `qa-ship-tests` prints them in the
  PR body under *Design findings not resolved*. Add the key to `workflow-state.mjs` schema + fixture,
  regenerate `state-schema.md` with `print-schema`.
- Check: `npm run test:scripts` green; replay SCRUM-132's round-2 findings (in
  `.workflow/SCRUM-132.yaml.bak-2026-08-20-reset` `last_findings`) against the new floor by hand —
  M5, M8 stay Major; M6, M7 become Minor; m4-m6 unchanged.

Batch 2 done when: a real 2.2a/2.2b run's receipt shows `Lint:` from the script and the reviewer's
tool-use count on `AGENT_RUN_METRICS` drops below the SCRUM-132 baseline (22 / 27).

---

## Batch 3 — design pipeline

Branch: `feat/design-pipeline`

### 3.1 Approvals keyed on requirement gaps (R3, W2)

- `qa-scenario-generator.md` Inputs — `approved_values` entry form becomes
  `<REQ-id or FR/AC id> · <missing value name>: <value> — <basis> — <approver> — <date>`; honoured on
  `first_run` (the unknown never gets written) and on `revision` (today's path, matching on the
  `unknown:` text rather than the SCN id). Step 8 carve-out 1 updated.
- `references/phase-1-design.md` — new manual-mode question **after 1.2**: list `[REQ-C*]` and
  `[REQ-M*]` missing values; options *Approve some* / *Leave unknown* / *Escalate* / *Decline*.
  Auto mode: an in-scope AC (or `Happy path`-cited FR) with a `[REQ-C*]` stops **here**, not at the
  design gate. Keep the post-1.3 question for unknowns 1.2 did not see.
- `SKILL.md` Checkpoint A — fold this in (Checkpoint A already sits after 1.2).
- `qa-requirements-reviewer.md` — every `# Missing Information` bullet names the missing value in a
  fixed form (`missing value: <name>`) so the generator can match it.
- Check: replay SCRUM-115 — approvals for `AC-1` / `FR-05.13` passed on `first_run` produce
  `approved:` markers with no second 1.3 run.

### 3.2 Merge classifier into generator (R5, W1) — needs D1

- `qa-scenario-generator.md` — new Step 7b *Classify* between the write and the self-check: today's
  classifier Steps 3, 3b, 4, 5 (rubric, eight factors, four E2E patterns, minimum-set pass, the
  three judgement lines, `--apply-levels`). Step 6 block format: drop `Suggested Level:`; blocks are
  written with `Assigned Level:` + `Level Rationale:` (+ `Folds Into:`) directly. Receipt gains the
  classifier's lines (`LEVELS`, `E2E_JOURNEYS`, `E2E_KEPT`, `E2E_DEMOTED`, `E2E_FOLDED`,
  `E2E_TESTS_IMPLIED`, `REQUIREMENT_GAPS`, `API_COVERAGE_ADDED` → no longer needed, the same run
  writes the decision). Revision mode: a finding naming a level authorises editing the two/three
  level lines of that block (today's `reclassify` scope rule). Body will grow — move the level rubric
  (classifier lines 68-196) to `docs/automation/references/level-assignment.md`, read at Step 7b
  only, with the usual `Must not` against working from memory.
- `scripts/test-design-lint.mjs` — `Suggested Level:` optional (accept documents with and without
  it); `TD-E02` field list updated; `--apply-summary` and `--apply-levels` may run in one invocation
  (`--apply-all`); fixtures updated; `TD-E19/E20` skip rule unchanged.
- `qa-scenario-reviewer.md` — criterion 9 no longer compares against `Suggested Level:`;
  `expect_levels_assigned` default stays `true`.
- `SKILL.md` — registry: row 1.4 removed; routing table: all four `[DESIGN-*]` buckets → 1.3 with
  `review_findings` (+ `scenario_ids` for level findings); the "classifier first, then generator"
  rule at 469-471 deleted; Checkpoint B moves to after 1.3; `run_mode` list drops `reclassify`.
- `references/workflow-map.md` — redraw. `references/state-schema.md` — regenerate.
- `.claude/agents/qa-scenario-classifier.md` — delete (git keeps it). `docs/automation/README.md`
  who-reads-what table updated.
- `docs/conference/agent_build_plan.md` — roster 11 → 10, phase diagram, "Where the speed came from"
  gains a row.
- Check: `npm run test:scripts` green; `/qa-workflow SCRUM-115` Phase 1 completes in ≤ 4 delegations
  (1.1, 1.2, 1.3, 1.5) on a clean design; `--emit-manifest` reports `classified: true` after 1.3.

### 3.3 Measure

- Full `/qa-workflow SCRUM-115` to the design gate. Record `metrics-report.mjs SCRUM-115` in the PR.
  Target: Phase 1 ≤ 5 delegations including one review round, agent time ≤ 35 min.
- Decide D3 on the evidence: if `Requirement Gap` blocks are still > 20% of scenarios after 1.6 and
  3.1, schedule R11 as batch 5.

---

## Batch 4 — ship phase and context

Branch: `feat/ship-path`

### 4.1 Ship on the script path (R6, W7) — needs D4

- `.claude/skills/git-pr-creator/scripts/create-pr.ps1` — add `-Title` and `-BodyFile`
  parameters (used verbatim when given); fix the prefix regex at line 401 to
  `^(?:[a-z]+/)?(?<prefix>(?:[A-Za-z]+-\d+|\d+))[\-_]`. `git-pr-creator/SKILL.md` documents both.
- `.claude/skills/git-workflow-orchestrator/SKILL.md` — section B accepts `-BodyFile`/`-Title`;
  note that a caller may run B with a caller-composed message when it owns the confirmations.
- `.claude/skills/qa-ship-tests/SKILL.md` — Step 3 runs section B; before it, two
  `AskUserQuestion`s in both modes: the composed commit message (OK / edit / Decline) and, when
  `gh pr list --search "<TICKET-ID>"` finds one, continue / Decline. Staging: write the `Changed
  Files` list to a temp file and `git add --pathspec-from-file`; never `-StageAll`. Remove the
  optional `git-change-analyst` delegation (86-91); the analyst stays for interactive use only.
- `references/ship-and-handback.md` — confirmations now two, both inside step 3.
- Check: `dry_run` prints the exact commit message, title and body that would ship; a real run's PR
  body contains the scenario list, *Suspected Application Defects*, *Streams Not Run* and, after
  batch 2, *Design findings not resolved*.

### 4.2 Split the etalons (R8, W6)

- Each etalon → `## Core` (form, phase/layer rule, assertion rules, cleanup form, the compliant
  example) read on every mode, and `## Appendix` sections read on condition: API — query-parameter
  builder (only a GET-collection scenario), seeding fixture (only a non-admin entity); UI — dialog
  handling, `LOCATOR-FALLBACK` receipts (only when a tier drop is taken).
- Creators: etalon `Core` on `first_run`; on `revision` only when a finding names a file under
  `tests/` or `pages/`. Reviewers: `Core` once (delete the second read at
  `aqa-api-test-reviewer.md:103`).
- Check: line count of what a one-line revision reads (add a `READS:` line to the receipt for one
  run, then remove it) drops below 800.

### 4.3 Test conventions live in the etalons, not `CLAUDE.md` (R9)

- Move `CLAUDE.md` *Test conventions* and *Page objects* bullets into the two etalons' `Core`;
  `CLAUDE.md` keeps a three-line pointer. Both creators drop the `Read CLAUDE.md` step.
- Check: `grep -n "CLAUDE.md" .claude/agents/aqa-*` empty.

### 4.4 Measure end to end

- Full `/qa-workflow SCRUM-115 --auto` to a PR (or `--dry-run` if the ticket must stay untouched).
  Record the metrics table in the PR and update the baseline table in `docs/review.md` §1.
- Target vs SCRUM-132: delegations 18 → ≤ 13; Phase 2 reviewer tool uses < 20 each; PR body
  complete.

---

## Batch 1 as built — the one deviation

**1.4's check does not hold as written, and was not forced to.** "For every remaining receipt field,
`grep -rn <FIELD> .claude/skills` finds a reader" fails for about eight more fields per creator —
`SELECTED_SCENARIOS`, `FOLDED_SCENARIOS`, `CLEANUP_GAPS`, `SHARED_ADDITIONS` and the three
`FINDINGS_` lines among them. They have no literal reader in a skill file because they are read by
agents and by people, not by the orchestrator: `SHARED_ADDITIONS` is cited by the UI review's row 25,
and `CLEANUP_GAPS` was added by 1.3 in the same batch. Removing them would be behaviour change, not
cleanup, so exactly the fields 1.4 enumerated were dropped and no more.

`CLAUDE.md` was also updated for both batches — the fifth script, the second review cap, the test
basis now coming from the 1.1 receipt, the code reviewers' widened `Bash` grant, and the analyst's
deleted PR-facts mode.

---

## Batch 2 as built — where it differs from the plan above

Three deviations, all taken to keep the plan's own rule that **no quality gate is removed**:

1. **The reviewer rows to delete were wrong in the plan.** 2.2 named API rows 5, 11–15, 17–19 and UI
   rows 5, 6b–d, 8, 9, 11, 14, 16, 18, 20–22b, 24, 25. Several of those are not mechanically
   checkable at all — API 12 (a raw `request` call), 18 (retry misuse), 19 (a throw before the
   assertion); UI 6b, 6c, 6d (assertion shape, whose verdict is in the surrounding code). Deleting
   them would have removed real checks. What was actually replaced is the rows `spec-lint` covers
   outright: API 13, 14, 15, 17, 22 and the phase-comment half of 5 and the e-mail half of 11; UI 9,
   11, 14, 18, 20, 25 and the mechanical half of 5, 8 and 16. Row ids were **not** renumbered, so
   existing finding citations still resolve.
2. **Fifteen rules and four warnings, not fourteen rules.** `SL-E15` (a snapshot ref in committed
   code) was added because UI row 24 had no other mechanical home. `SL-W01`–`SL-W04` carry the four
   grep patterns whose verdict needs the surrounding code — the negative assertion, the soft one, the
   existence-only one, the module-scope declaration. They print under *Judgement required*, exit 0,
   and are what let both reviewers' grep tables be deleted without losing the shapes they found.
3. **`--root` was added to the script**, and is not used by any real run. Every rule is scoped by path
   prefix (`tests/api/`, `pages/`), so a fixture that did not live at those paths would exercise
   nothing. The tests point it at `scripts/__fixtures__/spec-lint/{clean,violations}/`.

Two defects were found and fixed while wiring 2.4, neither of them in the plan:

- **`Number(null)` is `0`.** The new `max_design_iterations` was coerced before being tested for
  presence, so every document predating the key reported a cap of zero and failed `WS-E33` on its
  first review round.
- **`normalize` back-filling a cap invalidates a run in flight.** `.workflow/SCRUM-132.yaml` has
  already spent two design rounds; writing the template's `1` into it made it fail `WS-E33`, after
  which `normalize` refused to write — a command whose whole promise is that it changes nothing about
  the run had bricked one. `max_design_iterations` is now the one key `normalize` never back-fills;
  the validator's fallback to `max_review_iterations` is the defined answer instead.

The 2.4 replay against SCRUM-132's round-2 findings (in
`.workflow/SCRUM-132.yaml.bak-2026-08-20-reset`) came out as the plan predicted — M5 and M8 stay
Major (both change what a test asserts), M6 and M7 become Minor, m4–m6 unchanged — but only after the
floor was made explicit about the two cases it turns on: a coverage item a scenario exercises without
citing, and a `# Coverage Gaps` entry recording something the design already handles.

---

## Batch 3 as built — where it differs from the plan above

**3.1.** The approval key is `<FR-/AC-/REQ- id> · <missing value name>`, honoured on `first_run` (the
unknown is never written) and on `revision` (matched on the `unknown:` text). The requirements review
now writes every `# Missing Information` bullet in one fixed form — `**[<id>] missing value: <short
name>** — <what>. Applies to <ids>.` — because that form *is* the key, and a category label
(`Validation rules`) names no value and cannot be approved. Checkpoint A is now A1 (approvals, both
modes) and A2 (the API surface, manual only).

One deviation: the plan said auto mode should stop at A1 for "an in-scope AC **or a `Happy path`-cited
FR**". It cannot. Whether an FR is main flow is read off the design manifest, and at A1 no design
exists. So A1 stops only on a `[REQ-C*]` against an in-scope `AC-` id — main flow by definition,
needing no design to judge — and a `[REQ-C*]` against an FR keeps the existing escalation at the
design gate, where the manifest can answer it. Guessing it at A1 from the requirement's wording would
be exactly the re-derivation these gates exist to remove.

**3.2.** `qa-scenario-classifier` is deleted; `qa-scenario-generator` gained Step 7b, which reads the
new `docs/automation/references/level-assignment.md` (the rubric, the eight factors, the four
wrongly-routed shapes, the whole minimum-set pass) and writes `Assigned Level:`, `Level Rationale:`,
`Folds Into:` and the `API coverage:` line its own assignment creates. `Suggested Level:` is gone from
the block format. Row 1.4 has left the registry, all four `[DESIGN-*]` buckets route to 1.3, and
Checkpoint B moved to after 1.3.

Three deviations:

1. **`--apply-all` is two sub-invocations, not one pass.** Each apply mode splices by line number into
   a parse taken at startup, and rewriting `# Summary` moves every line below it — including the
   `# Level Assignment Summary` section the second pass edits. Running the whole script twice is what
   re-parses, and it makes the combined mode exactly the two commands it replaces rather than a third
   code path to keep in step with them.
2. **`Suggested Level:` is optional, not removed.** Designs written before the merge still carry it
   and are still valid; where it is present it is still checked for a real level and still checked for
   contract order. What is now conditional is the emitted `Overridden suggestions:` line — a document
   with nothing to override would otherwise report "none", which is a claim about a comparison nobody
   made.
3. **A level finding does not authorise editing the level line.** The plan's `reclassify` scope rule
   would have let a revision edit the two or three level lines directly. Instead a finding naming a
   level sends the run back to Step 7b for the scenarios it names: the level, its rationale and any
   fold line are one decision, and editing the level alone leaves a rationale arguing for the level it
   used to have and a fold pointing at a journey the new level is not on.

`CLAUDE.md`, `docs/automation/README.md`, `references/workflow-map.md`, the document-shape reference
and `agent_build_plan.md` (roster 11 → 10, phase diagram, two new *Where the speed came from* rows)
were all updated. `references/state-schema.md` needed no regeneration — batch 3 changed no schema.

**3.3 is not done.** It is a full `/qa-workflow SCRUM-115` to the design gate with a metrics table, and
it needs a live run. **D3 cannot be decided until it happens**, since it turns on how many
`Requirement Gap` blocks survive 1.6 and 3.1.

---

## Batch 4 as built — where it differs from the plan above

**4.1 (D4: script path).** `create-pr.ps1` takes `-Title` and `-BodyFile` and uses either verbatim;
the branch-prefix regex accepts a `<kind>/` segment, so `test/SCRUM-139-e2e-automation` yields
`SCRUM-139` where it used to yield nothing — and a duplicate-PR check that silently does not run is
the one failure mode of that check that looks exactly like success. `qa-ship-tests` Step 3 now asks
its two confirmations first, in both modes, then runs `git-workflow-orchestrator` section B as one
command. The `git-change-analyst` delegation is gone from the ship path; the analyst stays for
interactive use in `git-commit-creator`.

Two things the plan did not name but the staging rule needed:

1. **`create-commit.ps1` gained `-PathspecFile`** and `run-git-ship-workflow.ps1` threads it through,
   passing `-StageAll` only when no pathspec was given. Without it "never `-StageAll`" was
   unimplementable — the ship script hard-coded that flag, so `qa-ship-tests` had no way to stage a
   list however carefully it composed one. Verified end to end in a scratch repository: with a
   one-line pathspec, one file is committed and an unrelated modified file plus two untracked files
   are left alone. All three guards tested — a missing pathspec file, an empty one, and `-StageAll`
   and `-PathspecFile` together — each stop before staging anything.
2. **`run-git-ship-workflow.ps1` gained `-PrTitle` / `-PrBodyFile`**, for the same reason: section B
   is the entry point the ship step uses, and parameters that stop at `create-pr.ps1` never reach it.

The scripts could not be run against this repository — `git rev-parse --show-toplevel` returns its
Cyrillic path and PowerShell fails to resolve it, on the unmodified `HEAD` scripts as well as the
edited ones. That is pre-existing and unrelated. Every script was syntax-checked with the PowerShell
parser, the branch regex was exercised against seven real branch shapes, and the staging change was
tested in a scratch repository with an ASCII path.

**4.2 (etalon split).** Both etalons now carry `# Core` and `# Appendix` with a table saying when to
read each appendix section. The API appendix is *Query parameters* and *Filtering a shared
collection*; the UI appendix is *A control with no submit button* and *Two accepted title forms* —
not the plan's dialog-handling and `LOCATOR-FALLBACK` sections, because both of those turned out to be
inside sections the Core cannot do without (the compliant example and the tier ladder itself).

**4.3 (conventions out of `CLAUDE.md`).** The *Page objects* and *Test conventions* sections are a
pointer table now, and neither creator nor reviewer reads `CLAUDE.md` at all. Three rules stayed
behind in prose because they are the ones most often broken from outside those files: no `expect` in a
page object, web-first waits only, and a known defect asserted against the spec.

**The 4.2 check does not pass, and 800 is not reachable.** What a one-line API revision reads went from
**2022 to 1142** documentation lines — 43% less, but not the plan's target of under 800. The whole of
the saving is `CLAUDE.md` (775 lines, no longer read by any Phase 2 node) and the API appendix (127).

A later review proposed splitting `implementation-report.md` to close the rest. That was checked and
**withdrawn**: Step 10 of both creators rewrites the report in full on every iteration, so its 135-line
section catalogue is needed in every mode and there is no write-time/revise-time boundary to split on.

The five documents a revision reads are the surface rules (81), the scope contract (105), the revision
contract (164), the report contract (300) and the etalon `# Core` (491). Each is read because a rule in
it applies to a revision. **1142 is the measured floor at the current gate coverage** — going below it
means dropping a gate, not reorganising a file. The 800 figure was set before anyone measured what a
revision must read.

**4.4 is not done.** It is a full `/qa-workflow SCRUM-115 --auto` to a pull request with the metrics
table recorded, and it needs a live run.

---

## Batch 5 — optional, only if 3.3 says so

### 5.1 Gap entries instead of gap blocks (R11, W10)

Large; touches the document shape, three lint checks, the reviewer criteria and Checkpoint B.
Specify only after batch 3 is measured. Sketch: a scenario whose whole `Expected:` is unknown is
written as a `# Coverage Gaps` entry with a `GAP-NN` id; the traceability matrix accepts `GAP-` ids;
`Requirement Gap` level, `TD-E19` gap rows and the `## Blocked / Requirement Gaps` subsection
retire; `requirement_gaps` in the state file becomes the list of `GAP-` ids.

---

## Tracking

| Batch | Steps | Branch | Status |
|---|---|---|---|
| 1 | 1.1-1.6 | `feat/qa-workflow-guardrails` (stacked, PR #6) | **done** — `test:scripts` 239/239, `typecheck` clean, no agent named under `docs/automation/`. The `--dry-run` banner check is outstanding: it needs a live run |
| 2 | 2.1-2.4 | `feat/qa-workflow-guardrails` (stacked, PR #6) | **done** — `test:scripts` 277/277, `typecheck` clean. Deviations recorded under *Batch 2 as built* below. The measured check (a real 2.2a/2.2b run's reviewer tool-use count) is outstanding: it needs a live run |
| 3 | 3.1-3.2 | `feat/qa-workflow-guardrails` (stacked, PR #6) | **done** — D1 merge, D2 cap 1. `test:scripts` 282/282, `typecheck` clean. 3.3 is the measured run and is outstanding |
| 4 | 4.1-4.3 | `feat/qa-workflow-guardrails` (stacked, PR #6) | **done** — D4 script path. `test:scripts` 282/282, `typecheck` clean, all three PowerShell scripts parse. 4.4 is the measured run and is outstanding |
| 5 | 5.1 | — | decide after 3.3 (D3) |

Update the *Status* column as batches merge. Re-run `/agentic-workflow-review` after batch 4 and
diff against `docs/review.md`.
