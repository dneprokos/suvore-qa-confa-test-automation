# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Playwright + TypeScript test automation suite for the "Retro Video Games Portal" app (API + UI), plus a
set of Claude Code subagents that turn a Jira ticket into requirements, a test design, and finally tests.
Two things live here side by side:

- **The suite** — `tests/`, `pages/`, `fixtures/`, `services/`, `framework/`.
- **The agent workflow** — `.claude/agents/`, `docs/conference/agent_build_plan.md`,
  `requirements/`, `test-design/` (created on first generator run).

## Commands

`playwright.config.ts` declares two projects — `api` (`testDir: ./tests/api`, no browser is launched)
and `ui` (`testDir: ./tests/ui`, Desktop Chrome). `package.json` wraps them in scripts; there is no
ESLint, so `lint` does not exist.

```bash
npm test                                     # whole suite, both projects
npm run test:api                             # API project only
npm run test:ui                              # UI project only
npm run test:headed                          # headed run
npm run test:debug                           # debug run
npm run report                               # last HTML report
npm run typecheck                            # tsc --noEmit
npx playwright test tests/ui/owner.spec.ts   # one file
npx playwright test -g "add a new admin"     # one test by title
```

The app under test must already be running at `BASE_URL` (`http://localhost:9000` locally) — there is no
`webServer` block in `playwright.config.ts`. Preflight with
`curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/`.

## Configuration

`.env` (gitignored) → validated by Joi in `framework/configuration/config.ts` → exposed as the static
`Config` class. Missing or malformed values **throw at import time**, so a bad `.env` fails the whole run
before any test starts, not inside one. Required keys: `BASE_URL`, `OWNER_EMAIL`, `OWNER_PASSWORD`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`; optional `HEADLESS_BROWSER`, `PORT`, `NODE_ENV`.

Adding a setting means editing three places in that file: the Joi schema, the `Config` static, and `.env`.
Never read `process.env` directly outside it, and never inline a credential in a spec.

Path aliases are declared in `tsconfig.json` `paths` and resolved by Playwright at runtime:
`@framework/*`, `@services/*`, `@fixtures/*`, `@tests/*`, `@utils/*`, `@pages/*`.

## Architecture

### Fixture chain — the one import rule

```
@playwright/test → fixtures/api-fixture.ts → fixtures/pages-fixture.ts → specs
```

A spec **never** imports `test`/`expect` from `@playwright/test`. API specs import from
`@fixtures/api-fixture`; UI specs import from `@fixtures/pages-fixture`, which extends the API fixture —
so UI tests get `api`, `ownerToken` and `createdAdminEmails` for free alongside the page objects.

Fixtures provided:

| Fixture | Purpose |
|---|---|
| `api` | `ApiFacade` bound to Playwright's `request` context |
| `ownerToken` | Owner JWT obtained over the API, no UI login; throws with status + body on failure |
| `createdAdminEmails` | Push an e-mail here and the admin is deleted over the API after the test |
| `cleanupTasks` | `{ label, run }` for any other resource; drained in reverse after the test, each in its own `try/catch`, warnings only — cleanup never fails a test |
| `uncleanableResources` | Push a label and teardown prints `[cleanup] NOT CLEANED UP: <label> - no delete endpoint`. The honest last resort when the app has no delete route |
| `ownerSession` | Seeds the JWT into `localStorage` via `addInitScript` **before** any navigation |
| `loginPage` / `homePage` / `ownerPage` | Page objects; `ownerPage` depends on `ownerSession`, so it is already authenticated |

`ownerSession` uses `addInitScript` rather than a post-`goto` write on purpose: the app's `AuthContext`
reads `localStorage` once on mount and then calls `GET /api/auth/me`, so a token written after navigation
would not restore the session without a reload.

### API layer — facade → controller → builder

```
ApiFacade (.auth, .admin)
  └─ AuthApi / AdminApi          convenience methods for the common calls
       └─ *RequestBuilder        fluent with*() → send*(), the escape hatch
            └─ toApiResult()     { response, status, ok, body }
```

**Which layer to use is decided by the phase, not by the payload**, and the answer differs per suite:

- **API spec** — the `// Act` is always the builder, with one `with*()` call per field the request sends
  (`.withEmail(e).withPassword(p).withConfirmPassword(p)`), so the whole request reads at the point it is
  made. `withMatchingPassword()`, `withBody()` and a `createAdminPayload()` body are banned in an Act
  block because each hides a sent value; `withRawBody()` is the exception, since a non-object body has no
  fields to spell out. Controller methods are for `// Arrange` and `// Assert` only — the seed, the
  `listAdmins` cross-check, the cleanup.
- **UI spec** — an API call is a *helper*, never the subject, so it takes the shortest form:
  `api.admin.createAdmin(ownerToken, AdminTestData.createAdminPayload(email))`. No builder, no `with*()`
  chain anywhere under `tests/ui/`. A scenario that genuinely needs a hand-shaped request is an API
  scenario. Still assert the seed status, so a broken precondition fails loudly instead of as a UI defect.

Specs written before this rule still act through a controller in places; they are not retrofitted, and they
do not override it. Every `/api/admin` route is owner-only, so `withBearerToken` is mandatory there.

`toApiResult` never assumes JSON — an empty body becomes `undefined`, a non-JSON body stays raw text. This
is what lets negative tests assert on `status` without dying in a parse error. Assert `result.status` /
`result.ok` / `result.body`, not the raw `APIResponse`.

New endpoints go in `services/api/endpoints.ts`; never write a URL string in a spec or page object.

### Page objects

Locators are assigned in the constructor as `readonly Locator` fields; methods perform actions and return
locators for the spec to assert on. Page objects hold **no assertions** — `expect` lives in the spec, and
that includes `expect.poll`. A page-object loop waiting on a client-side re-render uses the locator API
instead: `await previousElement.waitFor({ state: "detached" })`. `pages/home-page.ts` carries the example.

Locator policy is a **tier ladder**, defined in `docs/automation/browser-exploration.md` §4 and
`docs/automation/ui-spec-etalon.md`. Tier 1 — `getByRole`, `getByLabel`, `getByPlaceholder`, `getByTestId`
— is what almost everything uses. Below it, `#id` (2), a non-testid `[data-*]` (3) and structural CSS (4)
are each allowed only when every higher tier is impossible, and each costs three receipts: a
`// LOCATOR-FALLBACK: tier <n> — <why>` comment on the field, a `LOCATOR_GAPS` entry, and the tier in the
report's `Explored Locators` map. **XPath, generated class names (`.css-1a2b3c`), matching on marketing
copy and `nth()` on a data row sit outside the ladder entirely** — never a tier-4 fallback. An element
with no stable hook at any tier is a **gap to report**, not a problem to solve with a brittle selector;
`pages/owner-page.ts` documents exactly that for the Owner Panel, which ships no `data-testid` at all.
`nth()` on a *structural* element — the second rowgroup of a table is its body — is tier 1.

Wait policy: web-first assertions and Playwright auto-waiting only. No `waitForTimeout`.

### Test conventions

- Title format is `"<Subject> - Should <behavior>"`, where the subject is the feature under test:
  `"Create admin - Should reject a malformed e-mail"`, `"Login as owner - Should reject invalid
  credentials"`. `describe` blocks are named for the endpoint in API specs (`"POST /api/admin/users"`) and
  for the feature in UI specs (`"Owner feature"`). UI specs accept a second form and a file picks one:
  `"As a <role>, I should be able to …"` for a role-centric flow (`tests/ui/owner.spec.ts`),
  `"<Subject> - Should <behavior>"` for a rendering or state check (`tests/ui/games-management.spec.ts`).
  New Owner Panel tests follow the first.
- `// Arrange` / `// Act` / `// Assert` comments delimit the three phases, once each per test.
- **Assertions carry the value, not its existence.** `toBeGreaterThan(0)`, `toBeTruthy()`,
  `not.toBeNull()` and a bare `toBeVisible()` never stand as the only assertion on a value the scenario
  names — use `toHaveText` / `toContainText` / `toHaveCount(n)`. Where no fixed value exists (a catalogue
  that varies by environment), tie the assertion to a named **independent oracle** and say so in a
  comment: `tests/ui/games-management.spec.ts` cross-checks the admin table against the public listing.
- **`expect.soft` for independent observables** — the fields of one row, each row of a table — so one
  missing column reports all five instead of the first. Hard `expect` everywhere it matters: in
  `// Arrange`, on the `waitForResponse` status, on any value a later line reads, and on the presence half
  of a presence/absence pairing. Soft does not short-circuit and still fails the test; it is a
  better-reported assertion, never a weaker one.
- **A spec's module scope holds its imports and its `test.describe`, nothing else.** A helper that drives
  or reads the page is a page-object method; a column list belongs to the page object that owns the table;
  a value the test sends belongs in `utils/test-data/`.
- Test data lives in `utils/`, never inline in a spec: `AdminTestData` and `AuthTestData`
  (`utils/test-data/`) own generated e-mails, passwords, boundary values and invalid credentials, and
  `ResponsePatterns` (`utils/response-patterns.ts`) owns the contract regexes. New data goes there, not
  into a local `const`. Expected response messages are the exception — they stay in the spec, next to
  the assertion they belong to.
- Each test creates its own data with a unique e-mail — `AdminTestData.uniqueApiEmail()` in API specs,
  `uniqueUiEmail()` in UI specs, so the two streams never collide; both are dot- and plus-free because
  the server runs `normalizeEmail()` on create — and registers it in `createdAdminEmails`.
  No shared mutable state between tests; `fullyParallel` is on.
- **Register cleanup the instant the record exists**, before any assertion — for a UI create flow, before
  the submit. Fixture teardown already runs on a red test; what does not run is a registration the failed
  assertion jumped over. Remove only what this test created, never a delete-all. A record the app offers
  no route to remove goes to `uncleanableResources`, which says so in the run output.
- UI tests that trigger a network call wrap the action in `Promise.all([page.waitForResponse(...), action])`
  and assert on both the response and the rendered result — the UI assertion alone is not enough.
- Cross-check the UI against the API where it is cheap (`api.admin.listAdmins` after a UI create/delete).
- A known application defect is asserted against the **spec**, with a comment naming the defect — see the
  `lastLogin` "Never" assertion in `tests/ui/owner.spec.ts`. Do not weaken an assertion to make a red test
  green; the failure is the report.
- Native `window.confirm` dialogs: register the handler **before** the click
  (`ownerPage.acceptNextConfirmDialog()`), or Playwright auto-dismisses and the request never fires.

## Agent workflow

Three documents, one canonical each — do not treat any of them as a second opinion on the others:

- `.claude/skills/qa-workflow/SKILL.md` — **canonical for routing, state and iteration control.** A
  change to who runs when belongs here and nowhere else.
- `docs/conference/agent_build_plan.md` — **canonical for the artifact and receipt contracts**: the
  requirements and test-design section shapes, the re-run and revision contract, the build order.
- `docs/conference/agentic_workflow.txt` — **non-canonical.** Conference background: the original role
  sketch the agents grew out of. Where it disagrees with either document above, it is out of date.

Rules that matter when touching `.claude/agents/`:

- **No agent may name another agent** — not in its description, body, receipt, or `Must not` list. Each is
  a pure function of its parameters and the files on disk, so routing stays in one place (the orchestrator).
  Self-reference (`generated_by:`) is fine.
- **The orchestrator is `.claude/skills/qa-workflow/SKILL.md`**, invoked as `/qa-workflow SCRUM-139
  [--auto]`. It is the one file that names agents next to each other, and the only place a routing change
  belongs. It runs on the main thread — subagents cannot spawn subagents or see skills — owns
  `.workflow/<TICKET-ID>.yaml`, the per-stream iteration counters and the `max_review_iterations` cap
  (default 2, auto mode only), delegates the ship phase to `qa-ship-tests`, which in turn drives
  `git-workflow-orchestrator`, and then closes the loop by delegating the Jira hand-back to
  `qa-jira-transition`. Manual mode asks for every transition; auto mode routes on the verdict but keeps
  the git confirmations.
- **The run ends on the ticket it started from.** Once a pull request exists, the orchestrator's last
  delegation comments the PR URL on the ticket and moves it to `In Review`. A hand-back that fails does
  **not** fail the run — the tests shipped; the status is bookkeeping, and the manual step goes in
  `NEXT_ACTION`. Never hand back on a `dry_run`, a skipped ship phase, or a `PR_URL` of `none`.
- **`# API Surface` is the single source of endpoint mechanics**, an eleventh level-1 heading in
  `requirements/<TICKET-ID>-requirements.md` between `# Affected Components` and
  `# Testing-Relevant Information`. `qa-requirements-collector` produces it — it holds `Bash` for exactly
  one command, `node scripts/api-surface.mjs --match <keys>`, which slices the OpenAPI document out of the
  app's Swagger UI bootstrap script (`http://localhost:5000/api-docs/swagger-ui-init.js`; port 9000 is the
  SPA and 200s on every path) and prints the finished section. Nothing else in the repository fetches or
  parses that document. The spec is incomplete per operation — `GET /api/games` omits `limit`/`page`, most
  2xx responses carry no schema, no operation documents an error message string — so `## Spec Gaps` is part
  of the contract, and everything under it stays `unknown:` downstream. A human can supply the surface
  (`endpoint_hints`, with an approver, never synthesised) or skip it (`api_surface_mode: ignore`), and
  skipping prints its consequence into the document, the state file and the PR body.
- **Both streams read that one section and nothing else in `requirements/`.** `aqa-api-test-creator` and
  `aqa-api-test-reviewer` take route, verb, parameters, auth and response shape from it to build the
  request that *is* the test. `aqa-ui-test-creator` and `aqa-ui-test-reviewer` read it far more narrowly:
  **arrange and cleanup mechanics only** — which route creates the resource a scenario needs, which route
  removes it — and never as a source of an assertion. A route documented there is not a reason to write a
  UI test for it. The test design stays the only source of what any test may claim, and the boundary is
  enforced by outcome rather than by access: **a value asserted must appear in the design's `Expected:`**,
  and the API review's rows 4 and 23 and the UI review's rows 4 and 17b fail anything else as an invented
  value or a guessed mechanic. The rules for reading the section live once, in
  `docs/automation/api-surface-reading.md`; same carve-out in `revision-contract.md` §6 and
  `review-verdict-contract.md` §7. The UI creator may also run `node scripts/api-surface.mjs` itself when
  the section is absent or `ignored` — the second and last caller of that script.
- **A stream can be `not_applicable`.** The orchestrator decides at Checkpoint B, after classification:
  zero `E2E API` scenarios, or an ignored surface, settles the stream without launching its creator or its
  reviewer. `not_applicable` is a finished state, never a failure, and it needs a stated reason — one with
  nothing behind it is indistinguishable from a stream that was forgotten. `qa-ship-tests` exempts such a
  stream from its "both reviews passed / both reports exist" gate and records it under *Streams Not Run*.
- **Two agents hold Atlassian access, one at each end of the run** — `qa-requirements-collector` (reads the
  ticket, moves it to `In Progress`) and `qa-jira-transition` (comments the PR, moves it to `In Review`).
  Nothing else in the repository touches Jira, and neither of them changes any field but status.
  `qa-jira-transition` holds no filesystem tools at all: it asserts only what its prompt gave it and what
  Jira told it, which is why it may not claim anything about the pull request beyond the URL.
- Every agent body carries an `# Inputs` table and writes path templates out in full
  (`requirements/<TICKET-ID>-requirements.md`), with the parameter as an override.
- **Reviewers get no `Edit`/`Write`.** A reviewer that can fix what it finds returns `Pass` and the
  Needs-Revision signal disappears.
- Phase 1 agents (`qa-*`) write only to `requirements/` and `test-design/`. Only Phase 2 agents
  (`aqa-api-*`, `aqa-ui-*`) write to `tests/` — the `aqa-` prefix marks every agent that writes or reviews
  test code, and the stream segment after it says which half. Slug prefix and tool grant must always agree.
- **The UI stream's write boundary has one additive-only carve-out: `services/api/`.** A UI test cannot
  clean up a resource the facade has no method for, and a `Shared Change Requested` entry would leave the
  record behind — so the UI creator may *add* a controller, builder or type file, a top-level key in
  `endpoints.ts`, and one `readonly` member on `ApiFacade`. It may not modify, rename, retype or delete
  anything already there, and `fixtures/api-fixture.ts` stays closed to it. Additive-only is what makes
  this safe with both streams in flight: a collision lands on different lines rather than the same line
  twice. Every addition goes on the receipt's `SHARED_ADDITIONS:` line. Same shape as the `utils/**` rule.
- **An agent that modifies nothing is named for the domain it reads.** `git-change-analyst` reads the git
  working tree and returns a proposed commit message and PR facts; it holds no `Write` or `Edit` and
  commits nothing. The `git-*` **skills** are the only things here that stage, commit, push or open a PR,
  and they keep their user confirmations because they run on the main thread. Same prefix, opposite
  powers — the tool grant is what tells them apart.
- Requirements and test-design documents have a fixed section/field contract — several agents parse them.
  See the format blocks in `agent_build_plan.md` before editing either shape.
- Phase 2 leaves a third artifact: each creator writes an implementation report to
  `.workflow/reports/<TICKET-ID>-{api,ui}-implementation.md` in the shape of
  `docs/automation/implementation-report.md`, and the matching reviewer reads it as its work list. The
  directory does not exist until the first creator run.
- **Every agent runs more than once, and the second run is scoped.** Each writing agent resolves a mode
  before it writes: `first_run` (no output yet), `EXISTS` (output present, nothing new asked — stop and
  change nothing), `revision` (findings supplied — change only what they name, everything else
  byte-identical), `regenerate` (explicit token — full rewrite). Reviewers write nothing, so they take
  `previous_findings` instead and switch to `re_review`: the style pass narrows to prior findings and
  changed files, while the suite, the type check and the coverage pass stay full every iteration.
  Findings carry stable ids — `[API-C1]`, `[UI-M2]`, `[DESIGN-C1]`, `[REQ-M1]` — that survive across
  iterations, and a creator answers each one in `Review Findings Addressed` as `fixed`, `disputed` or
  `not applicable`. Those prefixes name streams, not agents, so the no-sibling-names rule still holds.
  The contract is `docs/conference/agent_build_plan.md`, "Re-run and Revision Contract"; read it before
  changing any mode table.

**Run cost is measured from outside the conversation.** No agent can report its own tokens or duration —
the harness computes them after the subagent has stopped, and the `Task` result the caller sees carries
only text. A `PostToolUse` hook on `Task` (`.claude/hooks/agent-metrics.mjs`, registered in
`.claude/settings.json`) appends one line per run to `.workflow/metrics/<TICKET-ID>.jsonl` and echoes an
`AGENT_RUN_METRICS:` line into the transcript right after each agent's receipt; the orchestrator folds it
into `history` and closes the run with `node .claude/hooks/metrics-report.mjs <TICKET-ID>`. Contract:
`agent_build_plan.md`, "Run Metrics Contract". No agent file mentions any of this, and none may — knowing
about the machinery around it is the same leak as naming a sibling.

Shared knowledge the agents `Read` at runtime lives in `docs/automation/` — a doc, never a skill, because
no agent's `tools:` list includes `Skill`. **Anything reusable across agents takes this form: a doc here,
or a script under `scripts/`. A skill is not available to them.** Seven files: `implementation-report.md`
and `browser-exploration.md`; the two spec etalons (`api-spec-etalon.md`, `ui-spec-etalon.md`, one per
stream, read by that stream's creator *and* its reviewer so the two cannot calibrate against different
code); the two process contracts (`revision-contract.md` for the creators, `review-verdict-contract.md`
for the reviewers); and `api-surface-reading.md`, read by all four Phase 2 agents. **None of them may name
an agent** — they speak in stream terms, or the no-sibling-names rule leaks through the back door.

`api-surface-reading.md` holds what both streams need to know about the `# API Surface` section: what it
answers, what it never answers, how far each stream may use it, and what to do when it is missing. It is
one file rather than two because a rule the code is written against and the rule it is reviewed against
must be the same words. `api-spec-etalon.md` keeps what is specific to a request-shaped test — the
query-parameter form, one `with*()` per parameter sent, named sugar (`withLimit`) for what the surface
documents, `withQueryParam` as the escape hatch, serialised through Playwright's `params`.
`ui-spec-etalon.md` keeps the locator tier ladder, the soft-assertion boundary, the meaningful-assertion
rule and the generic cleanup form.

Browser exploration through `playwright-cli` follows `docs/automation/browser-exploration.md`: named
session per agent, always `close`d, snapshot `ref`s (`e5`) never committed, and never derive a requirement
from what the UI currently does. Exploration is also where a locator's **tier** is established — `eval` the
higher tiers before settling on a lower one, because a `LOCATOR-FALLBACK` comment claims they were
impossible, and the selector map's `Tier` column is the only downstream evidence that anyone checked.
