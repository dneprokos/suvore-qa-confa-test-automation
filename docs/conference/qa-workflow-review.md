# QA Workflow Review

Reviewed entry point: `.claude/skills/qa-workflow/SKILL.md`

Related context reviewed:
- `.claude/agents/qa-requirements-collector.md`
- `.claude/agents/qa-requirements-reviewer.md`
- `.claude/agents/qa-scenario-generator.md`
- `.claude/agents/qa-scenario-classifier.md`
- `.claude/agents/qa-scenario-reviewer.md`
- `.claude/agents/aqa-api-test-creator.md`
- `.claude/agents/aqa-ui-test-creator.md`
- `.claude/agents/aqa-api-test-reviewer.md`
- `.claude/agents/aqa-ui-test-reviewer.md`
- `CLAUDE.md`
- `docs/automation/implementation-report.md`
- `docs/conference/agentic_workflow.txt`

## Grade

**B+ / A- border, around 8.3/10.**

The workflow is strong enough to run real ticket-to-PR automation and has unusually good controls around state, ownership, review loops, and traceability. The main weakness is size: many agent prompts carry duplicated policy, long examples, and repeated self-checks. That improves compliance, but it also increases context cost and creates more places for drift.

## Advantages

- **Clear orchestration boundary.** `qa-workflow` owns state, counters, and routing only. Work stays delegated to specialized agents.
- **Good resumability model.** `.workflow/<TICKET-ID>.yaml`, `EXISTS` handling, persisted `last_findings`, and per-stream counters make interrupted runs recoverable.
- **Strong separation of roles.** Writers write artifacts; reviewers are read-only. This reduces confirmation bias and preserves a clean revision signal.
- **Good test-design discipline.** Scenario generation requires traceability, coverage matrices, ISTQB techniques, and explicit coverage gaps instead of vague scenario lists.
- **Healthy level classification.** The classifier pushes toward the lowest practical test level and prevents "everything is E2E" by default.
- **Parallel API/UI streams are well bounded.** Ownership of `tests/api`, `tests/ui`, `pages`, `services`, and fixtures is explicit, which reduces collision risk.
- **Review loop is practical.** Stable finding ids plus `Review Findings Addressed` make re-review cheaper and auditable.
- **Red tests are handled correctly.** A specification-faithful failing test can ship as a suspected application defect instead of being weakened.

## Disadvantages

- **Too much repeated instruction.** API/UI creators and reviewers repeat large sections about fixtures, test data, cleanup, validation commands, suspected defects, and boundaries.
- **Prompt size may reduce agent focus.** Some agents are long enough that the critical rules compete with examples and secondary policy.
- **There is documentation drift.** `docs/automation/implementation-report.md` says the repo has no npm scripts, but `package.json` and `CLAUDE.md` define `npm test`, `npm run test:api`, `npm run test:ui`, and `npm run typecheck`.
- **Manual mode mentions `AskUserQuestion`.** That tool name may be environment-specific. If unavailable, the workflow needs a fallback wording for normal user prompts.
- **The workflow relies heavily on receipt parsing.** This is workable, but brittle if an agent slightly changes capitalization or section names.
- **Shipping phase depends on external skills/agents not shown in the reviewed files.** `qa-ship-tests` and `git-workflow-orchestrator` are referenced but not validated here.
- **Research/test-design guidance is strong, but overloaded.** The scenario generator includes ISTQB modelling, a 12-category sweep, optional app exploration, and matrices in one long instruction set.

## Test-Design Research Feedback

- **Keep the ISTQB technique research.** EP, BVA, decision tables, and state transition testing are the strongest part of the design workflow.
- **Add a short "test basis research checklist" before modelling.** It should force the generator to extract: domain terms, actors/roles, entities/states, inputs, outputs, permissions, dependencies, data lifetime, observable UI/API outcomes, and explicit unknowns.
- **Separate research output from scenario output.** Keep `# Test Basis Analysis`, but make it concise and structured. Avoid long prose before scenarios.
- **Add a requirement-to-risk pass.** For each FR/AC, ask: what defect class is likely here? validation, authorization, persistence, ordering, idempotency, state leakage, race condition, integration failure, observability gap.
- **Add pairwise/combinatorial guidance only where useful.** Decision tables cover logical combinations, but pairwise is useful for forms/configuration with many independent fields. Keep it optional to avoid combinatorial explosion.
- **Add data-state research.** For each scenario, explicitly identify required seed data, mutated data, cleanup path, and isolation risk. This bridges design and automation.
- **Add "oracle research".** Every scenario should state how correctness is observed: response contract, database-backed API read, UI rendered state, event/log/audit record, or absence of side effect.
- **Add a confidence marker for assumptions.** Use `known`, `unknown`, or `inferred` for values such as status codes, exact messages, roles, limits, and routes. This helps prevent invented assertions.

## Likely Unnecessary Information

- Long worked examples inside both creators and both reviewers can be shortened and moved to shared docs.
- Repeated "Must not touch Jira / requirements / sibling stream" blocks could be referenced from a shared boundary contract.
- Repeated command blocks can point to `CLAUDE.md` or one validation contract instead of being copied into every agent.
- The old high-level `docs/conference/agentic_workflow.txt` is now less precise than `qa-workflow`; treat it as presentation/background, not the source of truth.
- Some receipt templates are very detailed. Keep them, but avoid adding more fields unless the orchestrator actually reads them.

## Recommended Changes

1. **Create a shared contracts folder** for recurring rules: boundaries, validation commands, implementation report shape, finding id rules, and red-test policy.
2. **Slim each agent prompt by 20-35%.** Keep guardrails, inputs, output schema, and self-checks; move long examples to docs referenced by path.
3. **Make `qa-workflow` the only canonical routing document.** Add a note that `agentic_workflow.txt` is non-canonical if it remains for conference material.
4. **Fix the npm script drift** in `docs/automation/implementation-report.md`.
5. **Add a compact research checklist to `qa-scenario-generator`.** This directly addresses stronger test design without bloating every downstream agent.
6. **Consider machine-readable receipts later.** YAML/JSON receipts would reduce parser fragility, but this is a second-order improvement.

## Final Take

The workflow is already good and usable. Its strongest qualities are traceability, review independence, and stateful orchestration. The best next improvement is not adding more agents; it is reducing duplicated prompt text and adding a compact, explicit research checklist before scenario generation.
