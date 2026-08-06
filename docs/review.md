# Agentic Workflow Architecture Review - `qa-workflow`

| | |
|---|---|
| **Entry point** | `.claude/skills/qa-workflow/SKILL.md` |
| **Depth** | `standard` |
| **Focus areas** | `none - all areas at equal weight` |
| **Production context** | `assumed: single team, single repo, human-supervised runs` |
| **Date** | `2026-08-06` |
| **Files read** | `21` - listed in the appendix |

## 1. Overall assessment

| Score | Maturity | Confidence |
|---|---|---|
| `6/10` | `Experimental` | `Medium` - based on prompt and contract review only; the workflow was not executed |

`qa-workflow` has a sound high-level decomposition: one lead orchestrator owns routing, and specialized agents own requirements, design, implementation, review, and shipping. The design is not production-ready because several side-effect boundaries are only described narratively, not enforced by durable state or constrained downstream calls. The two highest-risk gaps are dry-run still allowing Jira mutation and ship still being able to stage unrelated files through the delegated commit workflow.

## 2. Strengths

- **Routing is centralized** - `.claude/skills/qa-workflow/SKILL.md:27`. The orchestrator explicitly keeps sibling-agent knowledge out of individual agents, reducing circular prompts and hidden transitions.
- **Context handoffs prefer paths over transcript copies** - `.claude/skills/qa-workflow/SKILL.md:132`. That is the right default for repeatability and token control.
- **Review loops preserve prior findings** - `.claude/skills/qa-workflow/SKILL.md:126`. Feeding `previous_findings` from state is a real convergence mechanism, not just a retry loop.
- **Design review audits generated claims, not summaries** - `.claude/agents/qa-scenario-reviewer.md:51`. Recomputing traceability and technique coverage from scenario blocks is a strong quality gate.
- **Implementation reports are machine contracts** - `docs/automation/implementation-report.md:31`. Required sections and real execution counts give reviewers something concrete to verify.

## 3. Weaknesses

| Id | Component | Finding | Evidence | Action |
|---|---|---|---|---|
| W1 | `qa-workflow` dry-run boundary | `dry_run` is passed only to ship, so a dry-run workflow can still transition Jira during requirements collection. | `.claude/skills/qa-workflow/SKILL.md:43`, `.claude/skills/qa-workflow/SKILL.md:137`, `.claude/agents/qa-requirements-collector.md:23`, `.claude/agents/qa-requirements-collector.md:151` | Redesign |
| W2 | Ship/commit boundary | `qa-ship-tests` says stage only report-listed files, but the delegated commit phase still asks whether to stage all unstaged files. | `.claude/skills/qa-ship-tests/SKILL.md:75`, `.claude/skills/git-workflow-orchestrator/SKILL.md:46`, `.claude/skills/git-commit-creator/SKILL.md:32` | Redesign |
| W3 | Ship evidence persistence | The state stores implementation reports and status, but not durable reviewer report blocks or reviewed iteration ids that `qa-ship-tests` requires. | `.claude/skills/qa-workflow/SKILL.md:98`, `.claude/skills/qa-workflow/SKILL.md:144`, `.claude/skills/qa-ship-tests/SKILL.md:48`, `.claude/skills/qa-ship-tests/SKILL.md:50` | Redesign |
| W4 | Parallel implementation | The orchestrator claims parallel API/UI implementation has no correctness cost, while both streams may append to shared `utils/**`. | `.claude/skills/qa-workflow/SKILL.md:148`, `.claude/agents/aqa-api-test-creator.md:206`, `.claude/agents/aqa-ui-test-creator.md:226` | Redesign |
| W5 | Optional requirements review | `review_requirements: false` can bypass the requirements quality gate even though SDET prompts later assume the requirements were reviewed and approved. | `.claude/skills/qa-workflow/SKILL.md:39`, `.claude/skills/qa-workflow/SKILL.md:138`, `.claude/agents/aqa-api-test-creator.md:15`, `.claude/agents/aqa-ui-test-creator.md:15` | Redesign |
| W6 | Manual override audit | Manual mode allows `Accept anyway` on reviewer `Needs Revision` with only a history entry; no structured override schema records owner, rationale, waived ids, or expiry. | `.claude/skills/qa-workflow/SKILL.md:295`, `.claude/skills/qa-workflow/SKILL.md:118` | Redesign |
| W7 | Git token contract drift | `git-workflow-orchestrator` claims the same token resolution as `git-pr-creator` but omits SecretManagement and interactive-token paths. | `.claude/skills/git-workflow-orchestrator/SKILL.md:30`, `.claude/skills/git-pr-creator/SKILL.md:84` | Merge |

**[W1] `qa-workflow` dry-run boundary - Redesign**
*Failure:* User runs `/qa-workflow SCRUM-139 --dry-run` expecting no external mutation; Step 1.1 passes only `ticket_id`, so `qa-requirements-collector` uses `transition_on_success: true` and can move Jira to `In Progress`.
*Fix:* Define dry-run as a workflow-wide side-effect policy and pass `transition_on_success: false`, `run_tests: false`, and ship `dry_run: true`, or rename the current flag to `ship_dry_run`.

**[W2] Ship/commit boundary - Redesign**
*Failure:* Working tree contains unrelated edits plus reported test files; `qa-ship-tests` intends only reported files, but `git-commit-creator` can stage all unstaged files after user answers Yes, producing a PR with out-of-scope changes.
*Fix:* Add a constrained commit path that stages an explicit path allowlist, or have `qa-ship-tests` call a dedicated commit skill/script that rejects stage-all.

## 4. Focus Area

No explicit focus areas were provided. All sections were reviewed at equal weight.

## 5. Context efficiency

| Transition | Passed today | Minimum needed | Waste |
|---|---|---|---|
| Orchestrator -> agents | artifact paths plus scoped findings | ticket id, source path, previous finding block or finding ids | Low; this is the strongest part of the workflow |
| Reviewers -> orchestrator -> implementers | full review blocks in state via `last_findings` | finding ids, finding lines, affected scenario ids, previous block for re-review | Moderate; free-form blocks remain necessary today but should be schema-validated |
| Orchestrator -> ship | `api_review` / `ui_review` strings or blocks, plus report paths | durable review report paths, reviewed iteration ids, pass/fail status | High; ship needs evidence that is not persisted as a first-class artifact |
| Ship -> git commit | composed message and intended file list | explicit path allowlist and final message | High; generic commit flow can widen scope |

The workflow is context-efficient in design and implementation phases because it passes paths and receipt fields rather than whole transcripts. The main inefficiency is not token waste but evidence shape: review results are treated as transient text blocks instead of durable artifacts with schema fields that ship can verify without relying on caller state.

## 6. Workflow optimization

| Change | Agents before -> after | Transitions before -> after | Quality impact |
|---|---|---|---|
| Persist reviewer outputs as `.workflow/reviews/<ticket>-<stream>-review.md` plus parsed status fields | 10 -> 10 | same count | Higher reliability; ship can verify current reviews after resume |
| Replace generic git commit phase with path-allowlisted QA commit phase | 10 + git skills -> same | same count | Prevents out-of-scope commits without adding an agent |
| Serialize shared utility changes before parallel streams, or require `SHARED_CHANGE_REQUESTED` for all `utils/**` writes | same | same or +1 deterministic checkpoint | Removes race risk around shared test data |
| Make dry-run a workflow-wide policy object | same | same | Aligns user expectation with side-effect behavior |

## 7. Missing capabilities

| Capability | Why it matters here | Cheapest form |
|---|---|---|
| Workflow-wide side-effect policy | Dry-run should not mutate Jira, git, browser state, or source files unexpectedly. | `side_effects: none/read_only/write_local/write_external` in state and parameters passed to children |
| Review artifact persistence | Ship needs proof of `Pass`, reviewed iteration, and no unresolved Critical/Major findings after resume. | Save reviewer blocks under `.workflow/reviews/` and store paths plus parsed fields |
| Path-allowlisted commit | QA ship requires only report-listed files in the PR. | Script or commit-skill mode that stages exact paths and rejects anything else |
| Shared-write arbitration | Parallel agents can both append to `utils/**`. | Treat shared utils edits as `SHARED_CHANGE_REQUESTED`, then run a deterministic merge checkpoint |
| Structured override records | Manual `Accept anyway` needs auditability. | `overrides: [{finding_id, decision, rationale, approved_by, at}]` in state |

## 8. Recommendations

| Id | Priority | Change | Reason | Expected impact | Effort | Affected files |
|---|---|---|---|---|---|---|
| R1 | High | Redefine `dry_run` as workflow-wide, or rename current flag to `ship_dry_run`. | Current dry-run can still transition Jira. | Prevents unintended external side effects. | Small | `.claude/skills/qa-workflow/SKILL.md`, `.claude/agents/qa-requirements-collector.md` |
| R2 | High | Add a path-allowlisted QA commit path and have `qa-ship-tests` use it. | Generic stage-all conflicts with the ship gate. | Prevents unrelated files from entering PRs. | Medium | `.claude/skills/qa-ship-tests/SKILL.md`, `.claude/skills/git-commit-creator/SKILL.md` or scripts |
| R3 | High | Persist API/UI reviewer reports and reviewed iteration ids as workflow artifacts. | Ship cannot reliably verify current reviews after resume. | Makes ship gate restart-safe and auditable. | Medium | `.claude/skills/qa-workflow/SKILL.md`, `.claude/agents/aqa-api-test-reviewer.md`, `.claude/agents/aqa-ui-test-reviewer.md` |
| R4 | Medium | Remove direct shared `utils/**` write permission from parallel streams; surface it as shared change requested. | Additive concurrent edits can conflict or lose changes. | Better parallel safety with no quality loss. | Small | `.claude/agents/aqa-api-test-creator.md`, `.claude/agents/aqa-ui-test-creator.md` |
| R5 | Medium | If `review_requirements: false`, mark the test design and downstream reports as unreviewed and block ship unless explicitly overridden. | SDETs assume reviewed requirements. | Keeps premise and execution aligned. | Small | `.claude/skills/qa-workflow/SKILL.md`, `.claude/agents/aqa-api-test-creator.md`, `.claude/agents/aqa-ui-test-creator.md` |
| R6 | Medium | Add structured override records for `Accept anyway`. | A history note is not enough audit trail for waived findings. | Clear accountability for manual risk acceptance. | Small | `.claude/skills/qa-workflow/SKILL.md` |
| R7 | Low | Make git token resolution a single referenced contract. | Current git workflow and PR skill describe different token sources. | Less operator confusion in ship phase. | Small | `.claude/skills/git-workflow-orchestrator/SKILL.md`, `.claude/skills/git-pr-creator/SKILL.md` |

## 9. Final verdict

- The architecture has real separation of concerns; the orchestrator does routing, not implementation.
- The strongest contracts are around test design and code review; those agents verify claims instead of trusting summaries.
- The workflow is not yet production-ready because external side effects are not governed by one policy.
- The ship gate is conceptually right but can be bypassed through the generic commit skill's stage-all flow.
- Restart safety is incomplete at the final gate because review evidence is not durable enough.
- Parallel API/UI execution needs a shared-change protocol before it is safe by construction.
- No additional agent is needed for the highest-priority fixes; schemas, stored artifacts, and constrained scripts are cheaper and more reliable.

**Verdict: ❌ Reject**

Reject until W1, W2, and W3 are closed. The design is promising, but those findings can mutate Jira unexpectedly, ship unrelated files, or lose the evidence required to prove a PR is safe.

## Appendix - files read

- `.claude/skills/agentic-workflow-review/SKILL.md` - review rubric and report rules.
- `.claude/skills/agentic-workflow-review/references/report-template.md` - required report shape.
- `.claude/skills/qa-workflow/SKILL.md` - entry point and orchestrator logic.
- `.claude/agents/qa-requirements-collector.md` - Jira intake and transition behavior.
- `.claude/agents/qa-requirements-reviewer.md` - requirements review contract.
- `.claude/agents/qa-scenario-generator.md` - scenario generation contract.
- `.claude/agents/qa-scenario-classifier.md` - level-assignment contract.
- `.claude/agents/qa-scenario-reviewer.md` - design review gate.
- `.claude/agents/aqa-api-test-creator.md` - API implementation stream.
- `.claude/agents/aqa-ui-test-creator.md` - UI implementation stream.
- `.claude/agents/aqa-api-test-reviewer.md` - API code review gate.
- `.claude/agents/aqa-ui-test-reviewer.md` - UI code review gate.
- `.claude/skills/qa-ship-tests/SKILL.md` - ship gate and PR composition.
- `.claude/skills/git-workflow-orchestrator/SKILL.md` - git phase orchestration.
- `.claude/skills/git-branch-creator/SKILL.md` - branch phase.
- `.claude/skills/git-commit-creator/SKILL.md` - commit phase.
- `.claude/skills/git-push-creator/SKILL.md` - push phase.
- `.claude/skills/git-pr-creator/SKILL.md` - PR phase.
- `docs/automation/implementation-report.md` - implementation report contract.
- `docs/automation/review-verdict-contract.md` - shared reviewer verdict contract.
- `docs/automation/revision-contract.md` - shared implementation revision contract.
