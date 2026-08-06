# Browser Exploration Protocol

How an agent opens the application under test (AUT), reads its real DOM, and reports selectors.

Read this file **before** your first `playwright-cli` command. Every rule below is enforced by the
agent body, not by the tool grant — `Bash` alone does not tell you what you are allowed to look at.

Full command reference: `.claude/skills/playwright-cli/SKILL.md`.

---

## 1. Preflight

The AUT must be running at `Config.BASE_URL` — see `framework/configuration/config.ts:28`, currently
`http://localhost:9000/` from `.env`.

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/
```

Anything other than a 2xx/3xx means **stop**. Report the run as blocked with the status code you got.
Never guess a selector, a route, or an error string because the app was unreachable — an invented
`data-testid` produces a test that fails on the first real run and looks like an app bug.

## 2. Session protocol

Always a **named** session. Always closed.

```bash
playwright-cli -s=<agent-name> open http://localhost:9000/login
playwright-cli -s=<agent-name> snapshot
playwright-cli -s=<agent-name> close
```

Use your own agent slug as the session name (`-s=aqa-ui-test-creator`, `-s=env-explorer`). The API and UI streams
run in parallel; an unnamed session is shared state and the two runs will overwrite each other's page.

`close` is not optional. An unclosed session leaves a browser process alive between runs. Check for
strays with `playwright-cli list` — it should print `(no browsers)` once you are done.

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

This project uses `getByTestId` and `getByRole` only. No CSS, no XPath, no text-matching on copy that
product can reword. See `pages/login-page.ts:11-14` and `pages/home-page.ts:8-9` for the house style.

| Snapshot shows | Confirm with | Write as |
|---|---|---|
| element with `data-testid` | `eval "el => el.getAttribute('data-testid')" e5` | `page.getByTestId("email-input")` |
| `button "Logout"` | role + accessible name are in the snapshot already | `page.getByRole("button", { name: "Logout" })` |
| `status` / `alert` live region | role is in the snapshot | `page.getByRole("status")` |
| no testid, no stable role | — | report it as a gap; **do not** fall back to CSS |

That last row matters: an element with no stable hook is a finding to escalate, not a problem to solve
with a brittle selector. Say so in the report so the app team can add a `data-testid`.

## 5. Output contract

An exploration run ends with a **selector map**, not prose:

```markdown
### /login
| Element | Role | data-testid | Locator |
|---|---|---|---|
| Email field | textbox | email-input | page.getByTestId("email-input") |
| Password field | textbox | password-input | page.getByTestId("password-input") |
| Submit button | button | login-button | page.getByTestId("login-button") |
| Error banner | status | — | page.getByRole("status") |
```

One table per page or route. Every row must trace to something you actually observed in a snapshot.

## 6. Must not

- Report a selector that did not appear in a snapshot you ran in this session.
- Leave a session open, or use the default unnamed session.
- Put a `ref` (`e5`) into any committed file.
- Write to `tests/`, `pages/`, `fixtures/`, or `services/` during an exploration run — exploration
  produces a map; implementing from it is a separate step with a separate tool grant.
- Hardcode credentials into a command you report or into a document.
- Derive a *requirement* from the UI. What the app currently does is not evidence of what it should
  do. Requirements, error strings, status codes, and limits come from
  `requirements/<TICKET-ID>-requirements.md` only.
