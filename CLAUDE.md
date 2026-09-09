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

Locator policy is a **tier ladder**, defined in `docs/automation/references/browser-exploration.md` §4 and
`docs/automation/etalons/ui-spec-etalon.md`. Tier 1 — `getByRole`, `getByLabel`, `getByPlaceholder`, `getByTestId`
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
  `"<Subject> - Should <behavior>"` for a rendering or state check (`tests/ui/search-games.spec.ts`).
  New Owner Panel tests follow the first.
- `// Arrange` / `// Act` / `// Assert` comments delimit the three phases, once each per test.
- **Assertions carry the value, not its existence.** `toBeGreaterThan(0)`, `toBeTruthy()`,
  `not.toBeNull()` and a bare `toBeVisible()` never stand as the only assertion on a value the scenario
  names — use `toHaveText` / `toContainText` / `toHaveCount(n)`. Where no fixed value exists (a catalogue
  that varies by environment), tie the assertion to a named **independent oracle** and say so in a
  comment: `tests/ui/search-games.spec.ts` cross-checks the rendered cards against the search response.
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

- `.claude/skills/qa-workflow/SKILL.md` **and its `references/`** — **canonical for routing, state and
  iteration control.** A change to who runs when belongs here and nowhere else. A reference file under
  the skill directory is part of the skill: same version-control unit, loaded by an explicit `Read` at a
  named point in the run. It inherits every rule the skill carries, **including the no-sibling-names
  rule** — a reference speaks of "step 2.1b", never of the agent that runs it, so the registry in
  `SKILL.md` stays the only place two agent names appear together.
- `docs/automation/` — **canonical for everything two agents must agree on**: the two spec etalons, the
  process contracts, the four on-demand references. `docs/automation/README.md` says which is
  which and who reads what; the folder's own rule is that **no file in it may name an agent**.
- `docs/conference/agent_build_plan.md` — **the concept document, canonical for nothing.** It is the
  presentation-facing account of why the workflow is shaped this way, and it carries a *Where each
  contract lives* table pointing at the files above. Where it disagrees with any of them, it is the one
  that is out of date.

Rules that matter when touching `.claude/agents/`:

- **No agent may name another agent** — not in its description, body, receipt, or `Must not` list. Each is
  a pure function of its parameters and the files on disk, so routing stays in one place (the orchestrator).
  Self-reference (`generated_by:`) is fine.
- **The orchestrator is `.claude/skills/qa-workflow/SKILL.md`**, invoked as `/qa-workflow SCRUM-139
  [--auto]`. It is the one file that names agents next to each other, and the only place a routing change
  belongs. It runs on the main thread — subagents cannot spawn subagents or see skills — owns
  `.workflow/<TICKET-ID>.yaml`, the per-stream iteration counters and the `max_review_iterations` cap
  (default 2, auto mode only), **sizes the test basis before scenario generation and batches it** —
  `batch_threshold` 15, `batch_size` 10, counted off the `### FR-`/`### AC-` headings and passed down as
  `requirement_ids`, because the generating agent is barred from choosing its own scope and a batch is not
  a review round — delegates the ship phase to `qa-ship-tests`, which in turn drives
  `git-workflow-orchestrator`, and then closes the loop by delegating the Jira hand-back to
  `qa-jira-transition`. Manual mode asks for every transition; auto mode routes on the verdict but keeps
  the git confirmations.
- **Auto mode has two gates that are settings rather than rules, and both default to stopping.**
  `on_missing_api_surface` at Checkpoint B, and `on_blocked_alternative_flow` at the design gate — the
  latter narrows the no-coverage escalation, which fires when an unapproved unknown leaves an in-scope
  requirement with no automatable coverage at all. `continue` (`--allow-alternative-flow-gaps`) lets an
  **alternative-flow** requirement past; a **main flow** stops the run under either value, and a mixed set
  stops it and names every requirement in the gap rather than only the blocking half. Main flow is read
  off the design manifest, not out of prose: an `AC-` id is main flow by definition, and so is any
  requirement cited by a `category: "Happy path"` scenario. It **approves nothing** — the blocked
  scenarios still ship `Manual only`, the unknown stays unapproved, no `Expected:` gains a value; the only
  thing it decides is whether a human is fetched now or reads the open question later. A relaxed gate is
  printed twice, at the banner and at the gate, because why a run did *not* stop is the one thing nobody
  can reconstruct afterwards.
- **Every run prints its parameters before the first delegation**, in both modes and on every resume:
  each row of the `## Inputs` table, its resolved value, and the source — `request`, `state` or `default`,
  which is also the precedence order — followed by a *Non-default settings* list saying what each
  non-default value changes in behavioural terms. The source column is what earns it: most values are
  defaults nobody chose, and on a resume the ones that matter came out of a state file written by a
  command line nobody still has. A pass-through prints `— (agent default)` rather than the agent's real
  default, which this skill has not read. The banner is printed, never stored — `configuration:` in the
  state file is the copy, and a second one could only ever disagree with it. So `init` writes **every**
  `configuration.*` key the schema carries, defaults included: a gate-relaxing setting that exists in the
  first session and not in the file is one the resume silently loses.
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
  `docs/automation/references/api-surface-reading.md`; same carve-out in `revision-contract.md` §6 and
  `review-verdict-contract.md` §7. The UI creator may also run `node scripts/api-surface.mjs` itself when
  the section is absent or `ignored` — the second and last caller of that script.
- **The test design's structural contract is enforced by a script, not by prose in two agent bodies.**
  `scripts/test-design-lint.mjs` is the second script in the repository and the source of two of the three
  one-command `Bash` grants. It carries twenty-one `TD-E<nn>` checks — section order, the block field list, id
  sequence, the enumerated field values, coverage-item citation and declaration, the unknown- and
  approved-marker rules, all three matrices against the blocks, every number in `# Summary`, the ten
  research rows, the four technique subsections, and the level assignment recount (`TD-E19` the
  `# Level Assignment Summary` section, `TD-E20` the `Levels:` line), and the API coverage decision a
  backend-backed `E2E UI` scenario owes (`TD-E22`) — plus **five** mutually exclusive
  modes over the same arithmetic: `--emit-summary` / `--emit-levels` print and write nothing,
  `--apply-summary` / `--apply-levels` write it into the document in place, idempotently, touching only
  the sections that are pure recount — `# Summary` and the three matrices for the first pair, the
  `Levels:` line and the whole `# Level Assignment Summary` section for the second — and
  **`--emit-manifest`** prints the whole model as JSON, which is what the orchestrator's Checkpoint B
  gates on instead of counting `Assigned Level:` lines by hand. **The two judgement lines inside a counted section
  are carried through, never recomputed**: `Levels:` and `Blocked by (top unknowns):` in `# Summary`,
  `E2E journeys:` and `Demoted by the minimum-set pass:` in the level section. `qa-scenario-generator` runs
  `--apply-summary` to build its counted sections and the plain lint as the first half of its self-check,
  and may not return until it exits `0`; `qa-scenario-classifier` runs `--apply-levels` to write its
  summary and the plain lint to check it, and holds `Bash` for nothing else; `qa-scenario-reviewer` runs
  the plain form as Step 1a and reads the output as pre-computed evidence instead of recounting — and is
  barred by name from both apply modes, since a reviewer that repairs the document's arithmetic before
  judging it is reviewing its own work.
- **A citation is not an assertion.** A scenario carrying an `unknown:` marker together with
  `Automation Suitability: Manual only` has had its outcome taken away by the unknown: it traces a
  requirement and asserts nothing. The coverage items it cites are counted **traced-only** rather than
  exercised — a sixth column in `# Technique Coverage Matrix`, a parenthetical on the `Techniques:` line,
  and a `# Coverage Gaps` entry required per id exactly as for an uncovered one. `TD-E06` still asks only
  whether an item is cited at all, because "nobody wrote a scenario" and "nobody can assert the one that
  exists" are different defects. This is what stops a design reporting 100% technique coverage on the
  strength of scenarios that assert nothing, which is what SCRUM-132 did. **One script rather than three rule lists, for the same reason `api-surface-reading.md` is one
  doc**: the rule a document is written against and the rule it is reviewed against must be the same words.
  The split is load-bearing — the script rules on structure and arithmetic and on nothing else, every body
  that holds it carries a `Must not` against treating a clean run as evidence about the models, and
  `TD-E07` catches only the *literal* form of an unknown reaching `Expected:`, which is why it also emits
  `TD-W01`, the list of blocks needing a human-grade judgement pass. `TD-E19`/`TD-E20` **skip** rather than
  pass on an unclassified design, since arithmetic nobody has done is not arithmetic that checks out.
  `npm run test:scripts` (`node --test`, fixtures in `scripts/__fixtures__/`; `test:lint` is kept as an
  alias) is the only non-Playwright test suite here, and it exists because two agents now trust this
  script instead of counting. The check list is the script itself and the cases in
  `scripts/__tests__/`; no prose copy of it is kept anywhere.
- **The workflow state file is validated by a script for the same reason.** `scripts/workflow-state.mjs`
  is the third script here and the only one the orchestrator runs rather than an agent. `validate` carries
  eleven `WS-E<nn>` errors and two `WS-W<nn>` warnings; `get` prints one value raw, so a multi-line
  `last_findings` reaches the next delegation without being retyped through a conversation; `print-schema`
  is the source of `.claude/skills/qa-workflow/references/state-schema.md`, which is generated, not
  hand-written. **Errors are structure, warnings are drift**: a duplicate key, a bad enum or a missing
  required key is an error because some consumer will read the wrong thing, while an *unknown* key is only
  a warning, since the orchestrator demonstrably needs fields the schema lacks and erroring would push it
  back to hand-writing the file. `notes:` maps are the designated home for those, at the top level or in
  any section, and nothing under `notes.` is ever unknown. `--strict` promotes the warnings and is what
  the fixtures run under, so schema and fixtures cannot drift apart quietly. `WS-E01` is the check the
  script exists for: `.workflow/SCRUM-132.yaml` carried `test_design.last_findings` twice — an
  1800-character routing block, then `null` — and since YAML keeps the last value, an entire review round
  ran on findings nobody could read, with a document that parsed cleanly the whole time. `WS-W20` is the
  honesty check, flagging a `history` cost figure with no matching record in the metrics log, because a
  reader cannot tell a correctly transcribed number from an invented one. `WS-E35` is the early half of
  a check the ship step already makes: `passed` and `not_applicable` are the only two stream statuses a
  `phase: ship` or `done` document may carry, so a stream still in flight — or one whose review asked
  for changes nobody made — is caught while the document is being written rather than after the run has
  been routed on it. Because every write validates before it reaches disk, the phase cannot move ahead
  of a stream's verdict at all.
- **`check-streams` asks a third question: do the two stream decisions still match the design?**
  `validate` rules on the document alone and `check-artifacts` on what is on disk; neither can see a
  stream settled one way while the classified design says the other. It takes its counts from
  `test-design-lint.mjs --emit-manifest` rather than counting `Assigned Level:` lines, refuses an
  unclassified design instead of reading its zeros as answers (`CS-E01`), and exits `5` — never `1`,
  never `4` — on `CS-E02`, a stream settled `not_applicable` while the design assigns it scenarios, or
  `CS-E03`, a stream carrying work the design never assigned. **`CS-E02` is the drift nothing downstream
  re-derives**: the work is never launched and never missed, and the ship gate cannot tell a stream
  nobody needed from one nobody ran. It is run twice, at the automation gate and again before the ship
  delegation, and it rules on nothing else — a stream still `pending` is every stream for most of a run.
  With `WS-E35` it is why a forgotten stream cannot reach a pull request: one checks the statuses against
  the design, the other against the phase.
- **`check-artifacts` asks the other question: not what the file says, but what is still on disk.** It
  stats every path the document names — the requirements and test-design artifacts, each stream's report
  and every entry of its `created_tests` — and exits `4`, never `1`, when one is gone. The distinction is
  the whole point: the document is not wrong about what happened, it is wrong about what still exists,
  which no amount of validating it can see. Three resumes have routed correctly on that false premise and
  failed at the point of use, the last one nine delegations later at the ship gate, with `validate` clean
  the whole way — step 0's other existence check is scoped to `in_flight:`, which is empty on a run that
  completed its delegations, so a step already recorded as done is never re-checked. The script reports
  and rules on nothing (`scope: "existence_only"`; a `not_applicable` stream's missing report is a row
  like any other, carrying its stream status so the orchestrator can route on it), because deciding
  whether a gone artifact means a re-run, an escalation or a shrug is a routing decision and routing
  lives in one place. `artifacts.metrics` is deliberately excluded — the hooks own that file and its
  absence before the first agent run is normal.
- **The same script also writes the file, and it is the only thing that may.** `init`, `set`,
  `set-block`, `append`, `clear-in-flight` and `normalize` replaced the orchestrator's hand-written YAML,
  because validation is containment and not a cure: it stops a bad file surviving to the next delegation,
  which was the whole of the SCRUM-132 harm, but nothing stopped one being written. **Every write re-emits
  the whole document from the parsed model** — no code path inserts a line, so a duplicate key is
  unreachable rather than merely reported — and the result is validated *before* it reaches disk, so a
  pair of fields that only make sense together (`not_applicable` and its reason) is written in one command
  or refused. Writes are atomic (temp file, `fsync`, `rename`) and **idempotent by value**: a `set` writing
  what is already there prints `unchanged` and does not touch mtime, and `init` over an existing file
  prints `EXISTS`, deliberately the vocabulary the orchestrator already normalizes as `already_done`. What
  the emitter does not own it copies — comments, blank lines, quoting and a wrapped flow entry all survive
  untouched, so a one-field `set` produces a one-field diff. `set-block --from-stdin` exists so an
  1800-character findings block never passes through Windows shell quoting; `append --dedupe` suppresses a
  row identical to the current last one, which a resumed run re-appending a `history` entry would otherwise
  produce; `--force` writes a document that does not validate and is the one command that needs a reason in
  `history`. A document that already carries a duplicate key is refused by every write and repaired by
  `normalize` alone, which keeps the last value of each — the value every YAML reader was already seeing.
  **`normalize` also writes in the settings a document predates**, and for the same reason `init` writes
  every `configuration.*` key: a key the schema defines and a file lacks is not a neutral absence, it is
  a value the banner resolves as `default` and prints as a decision nobody made. The defaults come from
  the `init` template itself rather than a second list here, only `configuration.*` is touched, and a
  value already on disk is never replaced — a back-fill is not a migration of the run.
- **`reset` is the seventh write command and the only one that moves a run backwards.** Everything else
  in the workflow goes forwards; there was no way to say *throw this away and run it again from 1.1*,
  because every writing agent returns `EXISTS` when it finds its own output on disk and the orchestrator
  is barred from handing out a regenerate token. So the gap was filled at a shell prompt instead —
  `.workflow/SCRUM-132.yaml` carries a step-0 note describing three renames done by hand, calling itself
  the third occurrence, and inventing both the `.bak-<date>-reset` and `old_do_not_use_*` conventions the
  command now owns. **It archives by rename and never deletes**, which is what makes the absence of a
  rollback correct: every completed move put its file under a name nothing else uses, so a failure
  part-way (`WS-E41`) has lost nothing and re-running skips each done move as `absent`. **The state file
  moves second to last**, because it is the index of everything else — while it is in place a failure
  leaves a document that still describes the world. What it renames is decided by one criterion, not by
  tidiness: an artifact whose mere existence makes an agent resolve to `EXISTS` and refuse to work. That
  is the two phase-1 documents **and both implementation reports**, which are read as a mode signal
  rather than as a record. What it never touches is `artifacts.metrics`, which the hooks own, and every
  `created_tests` entry — live TypeScript, where `old_do_not_use_*.ts` would still match `testDir`, still
  typecheck and still be imported, buying a confusing name and no isolation; they are reported as owned
  by nothing instead, and keeping or dropping them is a git question and the user's. `--reason` is
  mandatory for the same reason `WS-E30` demands one: everything else about a reset is derivable from the
  document and the clock, and two of this repository's three hand resets have already lost theirs. `mode`
  and the whole `configuration:` subtree carry forward, because a reset destroys the `state` tier of the
  banner's `request > state > default` precedence and template defaults would have it report
  `max_review_iterations 2 default` for a run somebody capped at `1` — a value nobody chose, certified as
  a decision. The trigger is human in both modes (`/qa-workflow <TICKET-ID> --reset`), always after a
  `--dry-run` the user saw; drift, a decline, a failed step and a reached cap never trigger one. **The
  flag is the whole invocation and delegates nothing** — the fresh document reads as a run with nothing
  to resume, and routing it onward would need no special-casing anywhere, which is precisely why the
  rule is written down instead of skipped: one typed flag must not become nine unattended delegations.
  Starting the fresh run is a second command without the flag.
- **A UI scenario that leans on the backend states an API coverage decision.** `TD-E22` fails an
  `E2E UI` scenario whose text turns on server behaviour and whose `Notes:` carries no `API coverage:`
  line — `linked SCN-NNN`, `not needed — <why>` or `not applicable — <why>`, with a link resolving to an
  `E2E API` scenario in the same document. The rule is written once, in the API-coverage bullet of
  `docs/automation/references/test-design-document-shape.md`, and the design step writes it from there.
  The classification step gets the **one** exception to its byte-identical rule: when its own promotion
  to `E2E UI` creates the obligation, it writes the decision and reports it on `API_COVERAGE_ADDED:`,
  because the design step will not run again on a classified document and nobody else holds both the
  promotion and the list of `E2E API` scenarios. The script rules on presence and shape only — whether a
  `not needed` is *true* is the design review's judgement, and a decision the classification step wrote
  has been reviewed by nobody at all, which is why it is on a receipt line rather than only in the file.
- **A test level, automation readiness and test packaging are three different questions.** `Assigned Level:` names the lowest
  technical layer at which a scenario has an assertable, truthful oracle; `Automation Suitability:` names
  whether that test can be automated now; `Folds Into:` names which test executes it. None is evidence about
  the others, so `Manual only` is legal at
  every level — the old `TD-E10`, which forbade it below E2E, is **retired** and its code is not reused. A
  scenario whose `Expected:` records a requirement gap, an unknown or an outcome that is not assertable
  takes the pseudo-level `Assigned Level: Requirement Gap`: never a test layer, never executable coverage,
  outside every E2E journey and both sides of the E2E share, and reported under
  `## Blocked / Requirement Gaps` rather than in the follow-up-work table — a requirement waiting to be
  specified is a different request from a test at a level this repository does not run. It is the whole
  value of the field or none of it; `Component, Requirement Gap` fails `TD-E04` in either order.
- **The minimum-set pass has two outcomes, and folding is the one that was missing.** Demotion answers
  "a lower level still catches this"; **folding** answers "only the real stack catches this, but another E2E
  scenario already walks the same route to get there". Without it the pass deadlocked — rule 5 forbids
  demoting a scenario whose `Expected:` only the real stack produces, so it was kept and the run grew a
  journey it did not need. SCRUM-132 shipped that: SCN-018 took its own UI test beside SCN-001, same actor,
  same entry, same route, a bigger catalogue. The cause was the journey definition reading `Preconditions:`
  as traversal, so a data-volume difference read as a second journey — **data is not traversal**, and EP and
  BVA produce N data cases over one behaviour by construction, so a technique working correctly hands the
  pass N scenarios that look like N journeys and are one. A folded scenario carries `Folds Into: <id>` as a
  third classification line and **keeps its id, level, requirement trace and coverage items**; only its
  second traversal is gone, its `Expected:` becoming assertions inside the covering scenario's test, whose
  id comment names both (`// SCN-001 (folds SCN-018)`). It is never a quieter demotion: the `Level
  Rationale:` states both why no lower level holds the assertion and why the covering traversal is the same
  one. `TD-E21` rejects a fold naming a missing id, itself, the other stream, a below-E2E or `Requirement
  Gap` scenario, or one that is itself folded — each of those deletes a scenario from the implementing
  step's selection, the one place nothing downstream re-derives, because a folded scenario has no test of
  its own to be noticed missing. `E2E tests implied:` and the manifest's `e2e_tests_implied` are the
  arithmetic; **Checkpoint B still gates on `scenarios_by_level`**, since folding reduces tests, never
  coverage.
- **Either stream can be `not_applicable`.** The orchestrator decides at Checkpoint B, after
  classification: zero `E2E API` scenarios, or an ignored surface, settles the API stream; **zero `E2E UI`
  scenarios settles the UI stream** — a half the schema always permitted and no rule ever set, so a design
  assigning no UI work still launched the two most expensive steps in the run. Neither launches its creator
  or its reviewer. `not_applicable` is a finished state, never a failure, and it needs a stated reason —
  one with nothing behind it is indistinguishable from a stream that was forgotten. `qa-ship-tests` exempts
  such a stream from its "both reviews passed / both reports exist" gate and records it under *Streams Not
  Run*; both streams settled means there is nothing to ship and no pull request is opened.
- **Checkpoint B counts from the manifest, not from the document.** `test-design-lint.mjs
  --emit-manifest` is the script's fifth mutually exclusive mode and emits the model it already builds for
  `--emit-summary` and `--emit-levels`: per scenario the id, assigned levels, technique, coverage items,
  requirement ids, automation suitability, requirement-gap and gap-blocked flags and unknown markers, plus
  the counts, the per-level scenario lists, the technique matrix and the violation list. It writes nothing
  and rules on nothing — `scope: "structure_and_arithmetic_only"`, and the four judgement lines the script
  refuses to recompute are absent from it under every name. The field that makes it safe to gate on is
  `classified`: **an unclassified design reports zero at every level**, which is a true statement about the
  document and the exact opposite of what a gate would conclude from it. Counting levels by hand at the one
  gate that settles a whole stream was the last place a number was re-derived from prose.
- **Two agents hold Atlassian access, one at each end of the run** — `qa-requirements-collector` (reads the
  ticket, moves it to `In Progress`) and `qa-jira-transition` (comments the PR, moves the ticket on).
  Nothing else in the repository touches Jira, and neither of them changes any field but status.
  `qa-jira-transition` holds no filesystem tools at all: it asserts only what its prompt gave it and what
  Jira told it, which is why it may not claim anything about the pull request beyond the URL.
  It is **general-purpose, and the caller names the status**: `target_status` is required and never
  defaulted, `In Review` is the orchestrator's `jira_target_status`, and the comment is either a verbatim
  `comment_body` or the one PR-shaped template the agent owns. Its transition policy is the status ladder
  `To Do` < `In Progress` < `In Review` < `Done` — forward one hop only, never backwards, never out of a
  `Done` ticket, never through an intermediate status — and it reports the status it **re-read** after the
  move, not the one it asked for.
- Every agent body carries an `# Inputs` table and writes path templates out in full
  (`requirements/<TICKET-ID>-requirements.md`), with the parameter as an override.
- **Reviewers get no `Edit`/`Write`.** A reviewer that can fix what it finds returns `Pass` and the
  Needs-Revision signal disappears. `qa-scenario-reviewer` holds `Bash` for exactly
  `node scripts/test-design-lint.mjs` and nothing else — not the suite, not the type check, not git, not
  `playwright-cli`. A read-only reporter is safe to grant; the Edit/Write rule is untouched by it.
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
  The requirements shape lives in `.claude/agents/qa-requirements-collector.md` (Step 5), the test-design
  shape in `docs/automation/references/test-design-document-shape.md`. Read the owning file before
  editing either shape.
- Phase 2 leaves a third artifact: each creator writes an implementation report to
  `.workflow/reports/<TICKET-ID>-{api,ui}-implementation.md` in the shape of
  `docs/automation/contracts/implementation-report.md`, and the matching reviewer reads it as its work list. The
  directory does not exist until the first creator run.
- **Every agent runs more than once, and the second run is scoped.** Each writing agent resolves a mode
  before it writes: `first_run` (no output yet), `EXISTS` (output present, nothing new asked — stop and
  change nothing), `revision` (findings supplied — change only what they name, everything else
  byte-identical), `regenerate` (explicit token — full rewrite). Reviewers write nothing, so they take
  `previous_findings` instead and switch to `re_review`: the style pass narrows to prior findings and
  changed files, while the suite, the type check and the coverage pass stay full every iteration.
  **Validation narrows in one place and one place only: a creator's fix-and-re-run loop, which runs just
  the specs it changed while it is still debugging.** The run that produces `EXECUTION:` is the full stream
  suite plus `npx tsc --noEmit`, before the report, in every mode including `revision` — a page object is
  shared by every spec that uses it, so only the wide run sees a fix in one file breaking another. A
  reviewer narrows nothing here: it re-runs the suite itself precisely because it may not trust the counts
  it was handed. Findings carry stable ids — `[API-C1]`, `[UI-M2]`, `[DESIGN-C1]`, `[REQ-M1]` — that survive across
  iterations, and a creator answers each one in `Review Findings Addressed` as `fixed`, `disputed` or
  `not applicable`. Those prefixes name streams, not agents, so the no-sibling-names rule still holds.
  The contract is `docs/automation/contracts/revision-contract.md` for the creators and
  `docs/automation/contracts/review-verdict-contract.md` for the reviewers; read the one that owns a
  mode table before changing it.
- **A revision is scoped by what the findings name, not by which fields are on a list.** In the test
  design, a finding that names a field of a scenario authorises editing that field, in that scenario;
  everything else stays byte-identical. Two things stay outside it in every mode — the `## SCN-NNN`
  heading and its id, which every finding and every state file cites, and the `Assigned Level:` /
  `Level Rationale:` lines another step owns. The earlier allowlist of five editable fields is what
  SCRUM-132's design argued against itself over: four findings needed a `Coverage Item:` edit and one a
  `Preconditions:` edit, so each was answered by a coverage-gap entry agreeing with the defect and
  leaving it standing. A finding an in-place edit can satisfy is never deferred to a gap entry.

**Run cost is measured from outside the conversation.** No agent can report its own tokens or duration —
the harness computes them after the subagent has stopped, and the tool result the caller sees carries
only text. Three hooks on the subagent tool, all of them `.claude/hooks/agent-metrics.mjs` and all
registered in `.claude/settings.json`, close that gap: `PreToolUse --pre` writes a measured launch record to
`.workflow/metrics/pending/`, `PostToolUse --post` appends the full cost to
`.workflow/metrics/<TICKET-ID>.jsonl` and echoes an `AGENT_RUN_METRICS:` line into the transcript right
after each agent's receipt, and `PostToolUseFailure --failed` records an interrupt or timeout with its
duration and no token figures. The orchestrator folds the echoed line into `history` and closes the run
with `node .claude/hooks/metrics-report.mjs <TICKET-ID>`. Contract:
`.claude/skills/qa-workflow/references/run-cost.md`. No agent file mentions any of this, and none may —
knowing about the machinery around it is
the same leak as naming a sibling.

**Three hooks rather than one, because an interrupt is an event and not an absence.** A `PostToolUse`
hook cannot fire for a run that never completed, so on its own it cannot tell "no agent ran" from "an
agent ran and the session was killed underneath it". The pre-record survives that: an unreconciled launch
is an interrupted run, and `metrics-report.mjs` promotes it into the log exactly once as an `interrupted`
row carrying a start time and dashes for cost. Records correlate by `tool_use_id`, which all three
payloads carry and which is unique per call, so the two streams launched in parallel never collide even
when they are the same agent. **Four things stay uncapturable and the reports say so rather than
guessing**: the tokens an interrupted agent spent, because the harness produces a total only when a
subagent stops; a kill in the window before the pre-hook writes, because a hook cannot record an event
that precedes it; the cost of a background run; and the cumulative token spend of any run at all.

**A bail must never consume the launch record, and a background launch is not a completion.** `--post`
used to take the pending record and *then* find it had nothing to write, destroying the only evidence the
run existed — so the report could not reconcile it either and the run left the log entirely. Three
SCRUM-132 runs were lost exactly that way: an agent launched in the background returns from the tool call
at once, so `PostToolUse` fires on the **launch** and the response carries `isAsync`, an `outputFile` and
no cost, while the real completion arrives as a task notification, which is not a tool call and fires no
hook. The pending record is now taken only when there is a record to write in its place; a background
launch writes an `async_launch_no_cost` diagnostic, keeps its pending marked `async`, and reaches the
table as an **`async_uncosted`** row — distinct from `interrupted`, because such a run may have finished
perfectly and calling it an interrupt would be a false claim.

**`usage` is one message, not the run — so the block is called `end_context`.** `result.usage` describes
the subagent's *final* message: `usage.iterations` is a single-element array identical to it, and
`totalTokens` is that one message's figures added up. A record showing 115 tool calls against 1,214
output tokens is the last turn of an expensive run, not a cheap one. The block is written as
`end_context` with `scope: "final_turn"`, `tokens` is kept under its old name so one log spans the
rename, and **`tool_uses` is the honest measure of work** — a true count over the whole run, tracking
wall time closely. The cumulative spend is not obtainable from outside the conversation and nothing
estimates it. **The run mode is declared, never inferred**: every delegation prompt carries a `run_mode:`
line, the pre-hook reads it so an interrupted run keeps the mode it started in, and a prompt without one
records `undeclared` — which is never read as `first_run`, because the report used to derive a `Run i/N`
ordinal positionally and read a two-scenario reclassify identically to a revision. `prompt_chars`
measures the delegation prompt alone; whatever a step reads on its own lands inside `end_context`.
`metrics-report.mjs --json` carries a `records` array, one entry per run, so a per-agent question no
longer means hand-parsing the jsonl.

**The report prices what it can and refuses to price the rest.** `.claude/hooks/lib/pricing.mjs` holds
dated per-model list rates and one function that applies them, and the report prints the result as an
`End ctx $` column. It is the honest half of a cost report: the rates are public and the arithmetic is
exact, while the token counts it multiplies are still `end_context`, so **the figure is the price of
the final message and never the run's bill** — a row of 115 tool calls priced at seven cents is the
proof of that, not a bargain. Rates are dated rather than flat because a log spans days and prices move
under it; `claude-sonnet-5`'s introductory rate expires 2026-08-31 and rises 50% the next morning, so a
single hardcoded pair would go quietly wrong on a log holding rows from either side. Two things the
record does not state are assumed once and declared on every result and in the footnote: the cache-write
TTL (5-minute default; the 1-hour tier bills 2x input rather than 1.25x) and standard speed (fast mode
reprices Opus 5 to $10/$50). **An unknown model is unpriced, not guessed** — no tier inferred from a
name, no nearest neighbour, no zero — and the footnote counts the rows that went that way, because a
plausible number is the one failure mode a cost table cannot survive. Pricing the final turn does not
make the cumulative spend obtainable; that remains the fifth uncapturable thing.

**A hook that fails must say so.** The metrics hook shipped with four silent early returns and an empty
`catch {}`, and as a result wrote no record at all for its entire life without anything anywhere
reporting a problem — the script was correct and its wiring was not, which is a state no amount of
reading the code reveals. Every bail now appends a reason to `.workflow/metrics/_diagnostics.jsonl`
(capped, in its own `try/catch`), every record carries `ticket_source` so a mis-attributed run is visible
on its own row, and every path still exits `0`, because metrics are never worth failing a tool call over.
`unassigned.jsonl` keeps its documented meaning — a real run whose prompt omitted the ticket id — and
never doubles as a place where failures land.

**The fifth silent return was the tool-name guard, and it cost the same outage twice.** The subagent tool
has shipped under two names — `Task` in older harness builds, `Agent` in current ones — and both the
`matcher` in `.claude/settings.json` and the hook's own guard were written against `"Task"` alone. When
the harness renamed the tool, the matcher stopped matching and the guard stopped accepting, and the guard
was the one bail that wrote no diagnostic, on the reasoning that the matcher upstream had already
filtered. The result was an empty metrics log for runs the harness had costed perfectly well. **Both
names now live in one place — `.claude/hooks/lib/subagent-tools.mjs` — the matcher is the alternation
`Task|Agent`, and a test reads the real `settings.json` and asserts it matches every accepted name for
all three events**, because every failure this hook has had was the script being right and its
registration being wrong, and no test of the script alone can see that. An unrecognised tool arriving
with a subagent-shaped payload (`subagent_type`, or a `prompt`) writes an `unrecognised_subagent_tool`
diagnostic naming what it saw; a payload for some genuinely different tool stays silent, since a broad
matcher is legitimate and is not news.

Shared knowledge the agents `Read` at runtime lives in `docs/automation/` — a doc, never a skill, because
no agent's `tools:` list includes `Skill`. **Anything reusable across agents takes this form: a doc here,
or a script under `scripts/`. A skill is not available to them.** Twelve files in three folders, and the
folder a file sits in says *when its text loads*:

| Folder | What it is | The files |
|---|---|---|
| `etalons/` | a form to copy, read unconditionally by both halves of a stream | `api-spec-etalon.md`, `ui-spec-etalon.md` — one per stream, read by that stream's creator *and* its reviewer so the two cannot calibrate against different code |
| `contracts/` | a process rule for a run | `e2e-stream-scope.md` (both halves of a stream — the one that selects and the one that checks the selection), `revision-contract.md` (the creators), `review-verdict-contract.md` (the reviewers), `implementation-report.md` (written by one half, parsed by the other), plus the two the triage workflow owns |
| `references/` | knowledge read on demand at one anchored step | `api-surface-reading.md` (all four Phase 2 agents), `browser-exploration.md`, `test-basis-modelling.md`, `test-design-document-shape.md` |

`docs/automation/README.md` is the index and states the rationale. **None of these files may name
an agent** — they speak in stream terms, or the no-sibling-names rule leaks through the back door.
Moving one means rewriting every path that points at it, agent bodies included, where a stale path
fails only at run time and several delegations in.

**The last two are conditional reads, and that is the point of them.** `test-basis-modelling.md` holds
the mechanics of the four ISTQB techniques and is read whenever a run will *derive* a scenario;
`test-design-document-shape.md` holds the document body, section by section, and is read only by a run
writing or rewriting the whole document. Both used to sit inline in a 725-line agent body that loaded in
full on every invocation — including a revision correcting one `Expected:` line, and a reclassify of two
scenarios that cost 208 seconds. The body is 546 lines now. External lazy loading was already mature
here (`revision-contract.md` is read only on a revision); this is the same mechanism pointed the other
way, at the first-run theory rather than the revision rules. Each extraction ships with an anchored
`Read` at the step that needs it **and** a `Must not` against working from memory, because a reference an
agent forgets to read is worse than a long prompt — the rule stops applying instead of merely being
verbose.

`api-surface-reading.md` holds what both streams need to know about the `# API Surface` section: what it
answers, what it never answers, how far each stream may use it, and what to do when it is missing. It is
one file rather than two because a rule the code is written against and the rule it is reviewed against
must be the same words. `api-spec-etalon.md` keeps what is specific to a request-shaped test — the
query-parameter form, one `with*()` per parameter sent, named sugar (`withLimit`) for what the surface
documents, `withQueryParam` as the escape hatch, serialised through Playwright's `params`.
`ui-spec-etalon.md` keeps the locator tier ladder, the soft-assertion boundary, the meaningful-assertion
rule and the generic cleanup form.

Browser exploration through `playwright-cli` follows `docs/automation/references/browser-exploration.md`: named
session per agent, always `close`d, snapshot `ref`s (`e5`) never committed, and never derive a requirement
from what the UI currently does. Exploration is also where a locator's **tier** is established — `eval` the
higher tiers before settling on a lower one, because a `LOCATOR-FALLBACK` comment claims they were
impossible, and the selector map's `Tier` column is the only downstream evidence that anyone checked.

**A locator says where an observable is; it never says how the page gets there** — and a test that locates
perfectly still races if it waits on the wrong thing. So exploration reads a second thing beside the
selector map: the **mechanics**, §4b, a closed list of five questions — does this action fire a request and
which one, what proves a re-render finished when it fires none, what *shape* the empty or error state
takes, what actually triggers the action, does it raise a native dialog. They decide the `waitForResponse`
pattern, the `waitFor({ state: "detached" })` that replaces it, which locator an absence assertion is
written against, whether `fill` alone is the act, and which side of a click the `window.confirm` handler
goes on. `# API Surface` cannot settle any of them: that section says the route exists and what it answers,
and only the running page says whether **this control calls it**. The two maps travel together into the
report — `Explored Locators` and `Observed Mechanics`, both UI-only, both carried forward by a pass that
explored nothing — because the reviewer holds no browser and they are its whole evidence about the running
system. It rules both directions: a wait matching a route nobody watched fire, and a recorded request the
code never waits on, are the same defect read from opposite ends, and the second is the one a diff misses
because nothing is there to look wrong. The unit of the exploration decision is therefore a locator **or a
mechanic**, never a page: a modelled control performing an action nobody has recorded is on the list even
though its locator is settled, and an action a committed spec already wraps in a concrete
`waitForResponse` is off it. **The carve-out is the same shape as the one for `# API Surface`, and it is
where this is easiest to lose**: mechanics answer how an observable is reached and waited for, never what
it says. Reading a live region to learn the empty state *is* a `role=status` region is a mechanic; reading
the words inside it and asserting them is an invented value under the UI review's row 4 — worse than a
guess, because an assertion sourced from the app can only ever agree with the app. No cell of the mechanics
map holds a rendered string or a count, and a mechanic that could not be observed is recorded as
unobserved — on `MECHANICS_OBSERVED:` and under `Known Limitations` — rather than filled in with what
seems likely.

## Slack bug triage

A second workflow, sharing the house rules and none of the state. `/slack-bug-triage` reads a Slack
bug-reports channel, drafts a bug from each new message, checks SCRUM for an existing ticket, and either
files a new one or points the reporter at the match — replying in thread and marking the message each time.
The orchestrator is `.claude/skills/slack-bug-triage/SKILL.md`, the only file that names its five
`triage-*` agents together; its `references/run-shape.md` and `references/slack-mcp.md` carry the run
mechanics, and `docs/automation/contracts/slack-bug-intake.md` and `triage-verdict-contract.md` are the two
shared contracts, each read by the two steps that must agree on it.

- **Emoji cannot be the state, so a ledger is.** The design asks for messages "not already marked with an
  eye or a tick", which needs reactions to be *readable*. The official Slack MCP server does not return
  them from its read tools (slackapi/slack-skills-plugin#26, open since 2026-04-05) and the third-party one
  does not document whether it does. A reaction may be write-only — settable and never visible again, and
  therefore never removable by a run that died, which would strand a claimed message forever. So
  `.slack-triage/journal.jsonl` is primary and reactions are a union applied only when the channel read
  reports `REACTIONS_READABLE: yes`, resolved per run from the response itself so a server that starts
  returning them switches the rule on by itself. When it reports `no`, a human's hand-applied tick is *not*
  honoured, and the run says so in its return block rather than describing a guarantee it does not have.
  The ledger is **tracked in git** (`merge=union` in `.gitattributes`), unlike `.workflow/` and
  `.jira-bug/`: it is the only durable statement that a Slack message already became a ticket, and
  ignoring it means a second machine refiles everything.
- **`scripts/slack-triage-journal.mjs` is the fourth script here and owns the skip filter as code.**
  `plan` prints one row per message with `in_scope` and a reason — `new`, `resume`, `lease_expired`,
  `thin_answered`, `terminal` and seven others — so no agent and no orchestrator ever judges what is already
  done. **`--limit` is where the work cap lives, and the reason it is here rather than on the channel read
  is that the reading step holds no ledger tool**: a cap applied there returns the same oldest messages
  every run, all of them terminal after the first, with the backlog sitting untouched behind them. Applied
  to the rows `plan` has already ruled in scope, the budget is spent only on untracked work, so run one
  takes the oldest five and run two takes the next five — which is the whole of "run it again and nothing
  is missed". `plan` and `claim` both take it, always the same value, and both read it through the one
  function that builds the rows, so the set claimed cannot differ from the set worked. What falls outside
  is reported as `deferred_over_limit` rather than dropped: it is the only reason that says nothing about
  the message, and the same message is `new` next run with nothing about it changed.
  Ten `ST-E<nn>` codes; exits `4` for the two refusals that are policy rather than malformation:
  re-stating a terminal row as a different outcome, and claiming a message another run holds live. It is
  append-only rather than the whole-document re-emit `workflow-state.mjs` uses, because the defect that
  motivated re-emitting — a duplicate key in one YAML mapping — cannot occur in a one-record-per-line log,
  while rewriting a long ledger would reintroduce a full-file clobber on the one file whose loss costs the
  most. Claims carry a **lease**, so a dead run releases its messages by expiry rather than by cleanup.
- **Nine required bug fields, four of which a chat message can supply.** `lib.js` demands `summary`,
  `phase`, `priority`, `version`, `initialCondition`, `steps`, `expected`, `actual` and `affectedTests`,
  and `missingFields()` treats all nine alike — so left alone, every message is thin and nothing is ever
  filed. Only `summary`, `steps`, `expected` and `actual` are reporter-supplied and can make a report thin;
  the other five come from run parameters, land on the draft's `inferred` list, and are printed in the
  banner, because a board silently filling with `Development` bugs found in production is the failure that
  split is written against. A thin report gets **one** threaded question per distinct missing set — the set
  is hashed, so the same question is never asked twice, which is what stops a bot pinging a reporter until
  they mute the channel.
- **Idempotency is doubled on purpose.** The ledger protects against a crash between creating a ticket and
  recording it; a `slack-<channel>-<ts>` label on every filed bug, searched before any create, protects
  against a lost ledger, a second machine and a fresh checkout. The reply and the reactions are journaled
  as **separate fields**, so a response that posted the reply and failed the mark is finishable without
  posting a second reply.
- **Five agents, split by tool grant and failure mode, not by concept.** Slack read, drafting (zero MCP —
  which is what lets `--dry-run` exercise the real pipeline), Jira read, Jira create, Slack write. Every
  Slack write lives in one agent so the two server-gated tools have one home and a `PARTIAL` stays
  actionable; the channel read stays pure so it is re-runnable after any crash. The responding step's first
  call is a probe reaction, because read and write permissions differ and discovering that after filing
  five tickets nobody can be told about is the worst available outcome.
- **`run_id` is `BUGTRIAGE-<YYYYMMDD>-<NN>` and must be the first line of every delegation prompt.** It
  matches the metrics hook's `[A-Z][A-Z0-9]+-\d+`, and three of the six steps carry `SCRUM-` keys in their
  parameters — a key appearing first files the whole run's cost against somebody else's ticket, silently,
  with a receipt that looks correct.
- **Auto mode acts on a `high`-confidence duplicate and nothing weaker.** `medium` and `low` escalate: no
  reply, no ticket, claim mark left on. A duplicate verdict never closes, comments on or transitions the
  ticket it matched, so a wrong call is recovered by removing an emoji. `max_files` (default 5) caps what
  an unattended run can create, and `max_triage` (default 5) caps how many messages it takes on at all.
- **Barrier 2 is one delegation carrying every claimed ts, not one per message — and that is batching, not
  fan-out.** Marking a message is a single API call, so a subagent launch each made the cheapest step in
  the run its most expensive: measured, ~23k tokens and 14s per call. The marks still go on one at a time
  inside that delegation, because the reaction endpoint takes roughly one call a second and the responding
  step must stop after one retry rather than loop — concurrency here buys a rate limit, not speed. The
  responding step therefore has two modes: single, the only one that may reply, and batch, reaction-only
  and refused outright if a `reply_text` comes with it. A batch reports every message it was given, and
  `not_attempted` stays distinct from `failed`: nobody tried the first, so the next run takes it unchanged.

`SLACK_MCP_XOXB_TOKEN`, `SLACK_TRIAGE_CHANNEL_ID` and `SLACK_TRIAGE_SELF_USER_ID` are **OS environment
variables, not `.env` keys** — `${VAR}` in `.mcp.json` expands from the process environment, and this
repo's `.env` is read only by `framework/configuration/config.ts`. Posting and reacting are off unless
`SLACK_MCP_ADD_MESSAGE_TOOL` and `SLACK_MCP_REACTION_TOOL` are set (one variable gates both reaction
tools), and `.mcp.json` scopes each to the single channel id rather than `true`. The credential is a
**bot** token (`xoxb-`), so the app must be invited to the channel once by hand. A bot reads no channel it
is not a member of, public ones included, so the omission surfaces as `not_in_channel` on the channel read
— before anything is drafted, searched or filed, which is the cheap direction for it to fail in.

**The same workflow also ships as a plugin, and the repository copy is the canonical one.**
`plugins/slack-bug-triage/` mirrors the skill, its references and assets, the five `triage-*` agents, and
the scripts they run — `slack-triage-journal.mjs` plus a copy of `draft-bug.js`, `lib.js`, `config.json`
and the description template, so a plugin installed in a repository that has never heard of
`/jira-bug-creator` still drafts a bug. `.claude-plugin/marketplace.json` at the root publishes it, and
`claude --plugin-dir ./plugins/slack-bug-triage` loads it without installing. Three things differ inside
the copy and nowhere else: every path is written `${CLAUDE_PLUGIN_ROOT}/…`, the two scripts resolve their
output root from `CLAUDE_PROJECT_DIR` (falling back to the working directory) instead of walking up from
their own location — a plugin install is not the repository it writes a ledger for — and the step registry
names its agents `slack-bug-triage:triage-…`, because a plugin agent is addressed by its namespaced slug
and the bare one reaches this repository’s copy instead. **Two copies means every edit lands twice**:
change the file under `.claude/` or `scripts/`, then apply the same change to the mirror, or the plugin
quietly ships the old behaviour. The plugin bundles no `.mcp.json` — the agents’ tool grants name
`mcp__slack__*` and `mcp__atlassian__*` literally, and a plugin-provided server is exposed under a scoped
name that would not match; its README carries the snippet a host project needs instead.
