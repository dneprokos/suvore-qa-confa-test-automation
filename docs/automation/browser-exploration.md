# Browser Exploration Protocol

How an agent opens the application under test (AUT), reads its real DOM, and reports selectors.

Read this file **before** your first `playwright-cli` command. Every rule below is enforced by the
agent body, not by the tool grant — `Bash` alone does not tell you what you are allowed to look at.

Full command reference: `.claude/skills/playwright-cli/SKILL.md`.

---

## 1. Preflight

The AUT must be running at `Config.BASE_URL` — see `framework/configuration/config.ts:28`, sourced from
`BASE_URL` in `.env`. `http://localhost:9000/` is the documented local default, not a constant: read the
value, then preflight the value you read.

```bash
curl -s -o /dev/null -w "%{http_code}" <BASE_URL>
```

Anything other than a 2xx/3xx means **stop**. Report the run as blocked with the status code you got.
Never guess a selector, a route, or an error string because the app was unreachable — an invented
`data-testid` produces a test that fails on the first real run and looks like an app bug.

Every command in §2 and §3 opens that same `BASE_URL`. Preflighting one host and exploring another is
how a run produces confident selectors for an application nobody checked was up.

## 2. Session protocol

Always a **named** session. Always closed.

```bash
playwright-cli -s=<agent-name> open <BASE_URL>/login
playwright-cli -s=<agent-name> snapshot
playwright-cli -s=<agent-name> close
```

Use your own agent slug as the session name (`-s=aqa-ui-test-creator`, `-s=env-explorer`). The API and UI streams
run in parallel; an unnamed session is shared state and the two runs will overwrite each other's page.

`close` is not optional, and it is not deferred to the end of your run. Close the session the moment
exploration ends — before you write code, before you run a suite, and **before you return on any path**,
including an abort, a block or a failure. An unclosed session leaves a browser process alive between runs
and collides with the other stream. Check for strays with `playwright-cli list` — it should print
`(no browsers)` once you are done.

Each command writes its snapshot and console log to `.playwright-cli/` in the repo root and prints the
path. That directory is gitignored; read from it freely, never commit it, never clean it up by hand.

## 3. Discovery loop

`snapshot` returns a YAML accessibility tree with a `ref` per element (`e5`, `e12`, …). Use the ref to
pull the real attribute you intend to commit:

```bash
playwright-cli -s=env-explorer snapshot
playwright-cli -s=env-explorer eval "el => el.getAttribute('data-testid')" e5
```

**Refs are snapshot-local.** They change on every navigation and re-render. A ref must never appear in
committed test code, in a page object, or in a selector map — it is a handle for the current
conversation only.

To reach an authenticated page, drive the login form the same way a test would, then continue
exploring:

```bash
playwright-cli -s=env-explorer fill e3 "$OWNER_EMAIL"
playwright-cli -s=env-explorer fill e4 "$OWNER_PASSWORD"
playwright-cli -s=env-explorer click e5
playwright-cli -s=env-explorer snapshot
```

Credentials come from `.env` (`OWNER_EMAIL` / `OWNER_PASSWORD` / `ADMIN_EMAIL` / `ADMIN_PASSWORD`,
typed in `framework/configuration/config.ts:31-34`). Never paste a literal password into a command you
report, and never copy one into a document.

## 4. Translating findings into locators

A locator comes from the **highest tier the application makes possible**. See `pages/login-page.ts:11-14`
and `pages/home-page.ts:8-9` for the house style — both are tier 1 throughout.

| Tier | Locator | Status |
|---|---|---|
| 1 | `getByRole`, `getByLabel`, `getByPlaceholder`, `getByTestId` | preferred |
| 2 | `#id` — an author-written, stable id | allowed with justification |
| 3 | `[data-*]` — a stable attribute other than the testid | allowed with justification |
| 4 | structural CSS (`table > tbody > tr`) | last resort, with justification |
| — | XPath; a generated or hashed class name (`.css-1a2b3c`, a CSS-module class); a text match on copy product can reword; `nth()` on a **data** row | **banned at every tier** |

| Snapshot shows | Confirm with | Write as | Tier |
|---|---|---|---|
| element with `data-testid` | `eval "el => el.getAttribute('data-testid')" e5` | `page.getByTestId("email-input")` | 1 |
| `button "Logout"` | role + accessible name are in the snapshot already | `page.getByRole("button", { name: "Logout" })` | 1 |
| `status` / `alert` live region | role is in the snapshot | `page.getByRole("status")` | 1 |
| no testid, no role name, but an id in the markup | `eval "el => el.id" e5` | `page.locator("#game-genre")` | 2 |
| no testid, no role name, no id, but a stable `data-*` | `eval "el => el.dataset" e5` | `page.locator("[data-column='genre']")` | 3 |
| none of the above, but a stable structural position | `eval "el => el.outerHTML" e5` | a structural CSS selector | 4 |
| nothing stable at any tier | — | report it as a gap; **never** invent a hook |

Every tier below 1 has to earn it. `eval` the higher tiers first and record what you found — the
justification comment says what was actually tried, so "no role" means you looked. Three things travel
with a tier drop:

1. `// LOCATOR-FALLBACK: tier <n> — <why every higher tier is impossible>` on the locator field,
2. a `LOCATOR_GAPS` entry in the receipt,
3. the `Tier` column of the selector map below.

The ladder is not a licence to guess. An element with no stable hook **at any tier** is still a finding
to escalate, not a problem to solve with a selector you hope holds. Say so in the report so the app team
can add a `data-testid`.

## 5. Output contract

An exploration run ends with a **selector map**, not prose:

```markdown
### /login
| Element | Role | data-testid | Tier | Locator |
|---|---|---|---|---|
| Email field | textbox | email-input | 1 | page.getByTestId("email-input") |
| Password field | textbox | password-input | 1 | page.getByTestId("password-input") |
| Submit button | button | login-button | 1 | page.getByTestId("login-button") |
| Error banner | status | — | 1 | page.getByRole("status") |
| Genre cell | — | — | 2 | page.locator("#game-genre") |
```

One table per page or route. Every row must trace to something you actually observed in a snapshot, and
every row whose `Tier` is not 1 must also appear under `LOCATOR_GAPS`.

## 6. Must not

- Report a selector that did not appear in a snapshot you ran in this session.
- Drop below tier 1 without having `eval`ed the higher tiers, or without the three receipts in §4.
- Use an XPath, a generated class name, or a text match on product copy at any tier. Those are not
  tier 4; they are outside the ladder.
- Leave a session open, or use the default unnamed session.
- Put a `ref` (`e5`) into any committed file.
- Write to `tests/`, `pages/`, `fixtures/`, or `services/` during an exploration run — exploration
  produces a map; implementing from it is a separate step with a separate tool grant.
- Hardcode credentials into a command you report or into a document.
- Derive a *requirement* from the UI. What the app currently does is not evidence of what it should
  do. Requirements, error strings, status codes, and limits come from
  `requirements/<TICKET-ID>-requirements.md` only.
