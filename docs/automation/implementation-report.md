# Implementation Report Contract

The document an automation stream writes after implementing test scenarios, and the only thing a
reviewer is guaranteed to receive besides the changed files themselves.

Read this file before writing a report and before reviewing one. It is a machine contract: a reviewer
parses these headings, and a workflow orchestrator parses the receipt block at the end of the run.

---

## 1. Path

```text
.workflow/reports/<TICKET-ID>-api-implementation.md
.workflow/reports/<TICKET-ID>-ui-implementation.md
```

One file per ticket per stream. A later iteration of the same stream **overwrites** its own file — the
report describes the current state of the code, not a history of attempts. `iteration:` in the front
matter records which pass produced it.

`.workflow/` is workflow state, not source. It is not part of the pull request.

## 2. Structure

Every section below appears in every report, in this order, even when empty. An empty section reads
`- None.` — a missing section is a malformed report, and a reviewer treats it as `Blocked`.

````markdown
---
ticket: SCRUM-139
stream: api
generated_by: aqa-api-test-creator
generated_at: 2026-08-06T14:22:00Z
iteration: 1
test_design_source: test-design/SCRUM-139-test-design.md
scenarios_implemented: 2
---

# Implementation Report — SCRUM-139 (api)

## Implemented Scenarios

| Scenario | Test title | File |
|---|---|---|
| SCN-012 | Create admin - Should create an admin with a valid payload | tests/api/admin.spec.ts |
| SCN-014 | Create admin - Should reject a duplicate e-mail | tests/api/admin.spec.ts |

## Skipped Scenarios

- SCN-016 — the scenario's `Expected:` states no maximum password length, so the boundary is undefined.
  Recorded as a coverage gap; no test written rather than a guessed limit.

## Changed Files

- `tests/api/admin.spec.ts` — new, 2 tests
- `services/api/controllers/admin-api.ts` — modified, added `findAdminIdsByEmail`

## Reused Framework

- `fixtures/api-fixture.ts` — `api`, `ownerToken`, `createdAdminEmails`
- `services/api/controllers/admin-api.ts` — `createAdmin`, `listAdmins`
- `services/api/endpoints.ts` — `Endpoints.admin.users`

## Execution Result

```text
Command: npx playwright test tests/api --reporter=line
Passed: 2
Failed: 0
Skipped: 0
Type check: npx tsc --noEmit — pass
```

## Failing Tests

- None.

## Suspected Application Defects

- SCN-014 / FR-11.3 — the spec requires HTTP 409 for a duplicate e-mail; the application returns 400.
  The test asserts 409 and fails. Assertion deliberately not weakened.

## Shared Change Requested

- None.

## Known Limitations

- Parallel-safe: every test creates its own admin with a unique e-mail and registers it for cleanup.
````

## 3. Section rules

| Section | Rule |
|---|---|
| Implemented Scenarios | One row per scenario id actually covered by a test that exists. The test title is the exact string passed to `test(...)`, not a paraphrase. |
| Skipped Scenarios | Every selected scenario that produced no test, with a reason. A selected scenario appearing in neither table is a contract violation. |
| Changed Files | Repo-relative paths with `new` or `modified` and a one-clause summary. Every path must exist on disk. |
| Reused Framework | What already existed and was used. An empty list on a repo that has fixtures is a reuse failure, not an empty section. |
| Execution Result | The real command and the real counts, copied from the run. Never estimated, never carried over from a previous iteration. |
| Failing Tests | Test title, `file:line`, expected vs actual, and why it still ships. |
| Suspected Application Defects | A failure believed to be the application's fault, tied to a scenario id, quoting the `Expected:` value the test asserts. |
| Shared Change Requested | A file outside the writing stream's ownership that the work needed, and why. The change itself is not made. |
| Known Limitations | Anything a reviewer would otherwise have to discover — flakiness risk, environment coupling, data assumptions. |

## 4. Ownership boundary

Two automation streams run in parallel against one repository. Each writes only inside its own
boundary; a need outside it becomes a `Shared Change Requested` entry, never a silent edit.

| Owner | May create or modify |
|---|---|
| API stream | `tests/api/**`, `services/api/**`, `fixtures/api-fixture.ts` |
| UI stream | `tests/ui/**`, `pages/**`, `fixtures/pages-fixture.ts` |
| Neither | `playwright.config.ts`, `framework/**`, `tsconfig.json`, `package.json`, `.env`, `requirements/**`, `test-design/**`, `docs/**` |

Both streams **read** everything. Only writing is partitioned.

## 5. A red test is a valid result

A test that asserts what its scenario's `Expected:` states, and fails because the application does
something else, is a correct test and a finished piece of work. It ships red, with a comment naming the defect, an entry
under `Failing Tests`, and an entry under `Suspected Application Defects`.

Weakening the assertion to match the application, deleting the test, or marking it `.skip` to make the
run green destroys the only signal the failure carries. A reviewer treats any of the three as Critical.

The inverse is also true: a failure caused by the test itself — a wrong fixture, a race, a bad locator —
is not a defect report. Fix it before returning.

## 6. Commands

This repository has no npm scripts. Use these exactly:

```bash
npx playwright test tests/api --reporter=line    # API stream
npx playwright test tests/ui --reporter=line     # UI stream
npx tsc --noEmit                                 # type check, the only static analysis available
```

The application under test must already be running at `BASE_URL`. Preflight:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/
```

Anything other than 2xx/3xx means the run is blocked. Do not report execution results from a run that
never reached the application.
