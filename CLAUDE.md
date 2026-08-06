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
locators for the spec to assert on. Page objects hold **no assertions** — `expect` lives in the spec.

Locator policy, enforced by `docs/automation/browser-exploration.md`: `getByTestId` and `getByRole` only.
No CSS, no XPath, no matching on marketing copy. An element with no stable hook is a **gap to report**, not
a problem to solve with a brittle selector — `pages/owner-page.ts` documents exactly that for the Owner
Panel, which ships no `data-testid` at all.

Wait policy: web-first assertions and Playwright auto-waiting only. No `waitForTimeout`.

### Test conventions

- Title format is `"<Subject> - Should <behavior>"`, where the subject is the feature under test:
  `"Create admin - Should reject a malformed e-mail"`, `"Login as owner - Should reject invalid
  credentials"`. `describe` blocks are named for the endpoint in API specs (`"POST /api/admin/users"`) and
  for the feature in UI specs (`"Owner feature"`). `tests/ui/owner.spec.ts` uses a user-story phrasing
  instead — `"As an owner, I should be able to …"` — and new Owner Panel tests follow that file.
- `// Arrange` / `// Act` / `// Assert` comments delimit the three phases.
- Test data lives in `utils/`, never inline in a spec: `AdminTestData` and `AuthTestData`
  (`utils/test-data/`) own generated e-mails, passwords, boundary values and invalid credentials, and
  `ResponsePatterns` (`utils/response-patterns.ts`) owns the contract regexes. New data goes there, not
  into a local `const`. Expected response messages are the exception — they stay in the spec, next to
  the assertion they belong to.
- Each test creates its own data with a unique e-mail — `AdminTestData.uniqueApiEmail()` in API specs,
  `uniqueUiEmail()` in UI specs, so the two streams never collide; both are dot- and plus-free because
  the server runs `normalizeEmail()` on create — and registers it in `createdAdminEmails`.
  No shared mutable state between tests; `fullyParallel` is on.
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
  (default 2, auto mode only), and always ends by delegating the ship phase to `qa-ship-tests`, which in
  turn drives `git-workflow-orchestrator`. Manual mode asks for every transition; auto mode routes on the
  verdict but keeps the git confirmations.
- Every agent body carries an `# Inputs` table and writes path templates out in full
  (`requirements/<TICKET-ID>-requirements.md`), with the parameter as an override.
- **Reviewers get no `Edit`/`Write`.** A reviewer that can fix what it finds returns `Pass` and the
  Needs-Revision signal disappears.
- Phase 1 agents (`qa-*`) write only to `requirements/` and `test-design/`. Only Phase 2 agents
  (`aqa-api-*`, `aqa-ui-*`) write to `tests/` — the `aqa-` prefix marks every agent that writes or reviews
  test code, and the stream segment after it says which half. Slug prefix and tool grant must always agree.
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

Shared knowledge the agents `Read` at runtime lives in `docs/automation/` — a doc, never a skill, because
no agent's `tools:` list includes `Skill`. Six files: `implementation-report.md` and
`browser-exploration.md`, the two spec etalons (`api-spec-etalon.md`, `ui-spec-etalon.md`, one per stream,
read by that stream's creator *and* its reviewer so the two cannot calibrate against different code), and
the two process contracts (`revision-contract.md` for the creators, `review-verdict-contract.md` for the
reviewers). **None of them may name an agent** — they speak in stream terms, or the no-sibling-names rule
leaks through the back door.

Browser exploration through `playwright-cli` follows `docs/automation/browser-exploration.md`: named
session per agent, always `close`d, snapshot `ref`s (`e5`) never committed, and never derive a requirement
from what the UI currently does.
