# UI Spec Etalon

The house form for a Playwright UI spec under `tests/ui/` and the page object it calls under `pages/`.
One document, two readers: whoever writes a new spec copies this shape, and whoever reviews one
calibrates against it. A style finding is a departure from *this*, never from a preference formed on
the spot.

**The files on disk outrank this sketch.** `tests/ui/owner.spec.ts` and `pages/owner-page.ts` are the
canonical in-repo references; where the repository and this document disagree, the repository is right
and the difference is not a finding.

## The fixture chain

```
@playwright/test → fixtures/api-fixture.ts → fixtures/pages-fixture.ts → tests/ui/*.spec.ts
```

A UI spec imports from `@fixtures/pages-fixture`, which **extends** the API fixture — so one destructure
gives you the page objects and the whole API layer at once.

| Fixture | What it is | Use it for |
|---|---|---|
| `ownerPage` / `loginPage` / `homePage` | page objects | every UI action and every locator |
| `ownerSession` | the owner JWT seeded into `localStorage` via `addInitScript` before the first navigation | implied by `ownerPage` — you never log in through the UI to set up |
| `page` | the raw Playwright page | `page.waitForResponse` and dialogs only; locators belong in the page object |
| `api` | `ApiFacade` — `api.auth`, `api.admin` | arranging data and cross-checking the result |
| `ownerToken` | owner JWT obtained over the API | first argument to every `api.admin.*` call |
| `createdAdminEmails` | cleanup list, drained over the API after the test | push every e-mail the test causes to exist |
| `cleanupTasks` | removal steps for any **other** resource, drained in reverse after the test | push `{ label, run }` the instant the resource exists |
| `uncleanableResources` | labels warned about at teardown, never deleted | the last resort: a record the application offers no way to remove |

`ownerSession` uses `addInitScript` on purpose: `AuthContext` reads `localStorage` once on mount and
then calls `GET /api/auth/me`, so a token written after `goto` would not restore the session without a
reload. Never write the token by hand.

## Setup and cleanup over the API — always, and always in the short form

The UI is what the scenario is testing, not what gets it into position. A ten-step UI setup is ten ways
for an unrelated test to fail.

Every API call in a UI spec is a **helper**. It is never the thing under test, so it gets the shortest
form the facade offers — the controller method, with `AdminTestData.createAdminPayload(email)` as the
body:

| Want | Write | Not |
|---|---|---|
| seed an admin | `api.admin.createAdmin(ownerToken, AdminTestData.createAdminPayload(email))` | a builder chain of `with*()` calls |
| seed an admin with one field changed | `AdminTestData.createAdminPayload(email, { password: AdminTestData.MIN_LENGTH_PASSWORD })` | `.withEmail(…).withPassword(…).withConfirmPassword(…)` |
| cross-check the result | `api.admin.listAdmins(ownerToken)` | `api.admin.adminBuilder().withBearerToken(ownerToken).sendListAdmins()` |
| delete something `createdAdminEmails` does not cover | `api.admin.deleteAdmin(ownerToken, id)` | `.sendDeleteAdmin(id)` off a builder |

`api.admin.adminBuilder()` and `api.auth.loginBuilder()` exist for tests whose subject *is* the HTTP
request. That is never a UI test. A scenario that genuinely needs a hand-shaped request is an API
scenario, and it belongs to whoever implements `Assigned Level: E2E API`.

The one thing a helper call must still do is fail loudly — assert the seed status
(`expect(seedResult.status).toBe(201)`), so a broken precondition never reads as a UI defect.

| Situation | Do |
|---|---|
| the scenario needs an admin that already exists | seed it with `api.admin.createAdmin(ownerToken, …)` in `// Arrange`, assert the seed status, push the e-mail to `createdAdminEmails` |
| the scenario **is** the UI create flow | fill the form through the page object, but push the e-mail to `createdAdminEmails` **before** the submit |
| the scenario is the UI delete flow | still push it — `findAdminIdsByEmail` returns nothing afterwards and cleanup becomes a no-op |
| the test needs an authenticated owner | take `ownerPage`; that is all |
| the test needs a state the API cannot seed | record it under `Known Limitations`; do not build a UI setup chain to reach it |

Cleanup is the fixture's job — no manual UI deletion in a teardown, and never leave a record behind.

### Cleaning up a resource that is not an admin

`createdAdminEmails` covers one resource type. Anything else registers a removal step on
`cleanupTasks`, and the route it calls comes from the `# API Surface` section of the requirements
document — see `docs/automation/api-surface-reading.md`, which is the only part of `requirements/`
this stream opens and is read for **arrange and cleanup mechanics only, never for an assertion**.

```ts
// Arrange - the game is a precondition, not the scenario
const createResult = await api.games.createGame(ownerToken, GameTestData.createGamePayload());
expect(createResult.status).toBe(201); // a broken precondition must fail loudly

// Registered here, not after the assertions: fixture teardown runs whether the
// test passed or failed, so a task registered at creation time survives a red run.
const gameId = (createResult.body as CreateGameResponse).game._id;
cleanupTasks.push({
  label: `game ${gameId}`,
  run: async () => void (await api.games.deleteGame(ownerToken, gameId)),
});
```

Three rules govern that block:

- **Register at creation, never after the assertions.** This is the whole of "clean up even when the
  test fails" — the teardown already runs on a failure; what does not run is a registration the failing
  assertion jumped over. In a UI create flow the registration goes **before the submit**.
- **Remove only what this test created.** Never a delete-all, never "every record matching the prefix".
  `fullyParallel` is on, and another test's data is not yours to remove.
- **No delete route anywhere → say so out loud.** Push a label to `uncleanableResources`, which prints
  one `[cleanup] NOT CLEANED UP: <label> - no delete endpoint` line at teardown, and record the same
  fact under `Known Limitations`. A leak that is reported is a known cost; a silent one poisons every
  later run.

```ts
// The API documents no DELETE for this resource - see ## Spec Gaps in the API surface.
uncleanableResources.push(`game "${gameName}" created through the Add Game form`);
```

## Locators — the tier ladder

A locator is chosen from the highest tier the application makes possible. Tier 1 needs no justification;
every step down needs all three of the receipts below.

| Tier | Locator | Status |
|---|---|---|
| 1 | `getByRole`, `getByLabel`, `getByPlaceholder`, `getByTestId` | preferred |
| 2 | `#id` — an author-written, stable id | allowed with justification |
| 3 | `[data-*]` — a stable attribute other than the testid | allowed with justification |
| 4 | structural CSS (`table > tbody > tr`) | last resort, with justification |
| — | XPath; a generated or hashed class name (`.css-1a2b3c`, a CSS-module class); a text match on marketing copy; `nth()` on a **data** row | **banned at every tier** |

Descending below tier 1 requires:

1. a `// LOCATOR-FALLBACK: tier <n> — <why every higher tier is impossible>` comment on the locator field,
2. a `LOCATOR_GAPS` entry in the receipt,
3. an `Explored Locators` row recording the tier.

```ts
// Tier 1 — preferred, no comment needed
this.addGameButton = page.getByRole("button", { name: "Add Game", exact: true });

// LOCATOR-FALLBACK: tier 2 — the cell carries no role name, no label and no
// data-testid; #game-genre is written in the template, not generated.
this.genreCell = page.locator("#game-genre");
```

An undocumented tier drop is a defect, and so is a tier drop where a higher tier was available — the
comment has to say what was actually tried. What the ladder does **not** do is license a guess: a
control the application ships no hook for at any tier is still a gap to report and a scenario to skip.

`nth()` on a **structural** element — the second rowgroup of a table is its body — is tier 1 and not a
fallback; see the note under the page object below. `nth()` reaching a particular data row is banned,
because its position depends on which other tests are running in parallel.

## Assertions — soft where the observables are independent, never weak

### `expect.soft` for independent observables

A loop of hard assertions reports the first failure and hides the rest, so a table missing three columns
looks like a table missing one. Independent observables inside `// Assert` are soft:

```ts
// Assert - AC-1: every row shows name, genre, release year, platforms and multiplayer
for (const row of rows) {
  for (const column of gamesManagementPage.dataColumns) {
    await expect.soft(gamesManagementPage.cellFor(row, column)).not.toBeEmpty();
  }
}
```

Hard `expect` stays hard in four places, in every test:

| Keep hard | Why |
|---|---|
| anything in `// Arrange` | a failed precondition makes the rest of the test meaningless — `expect(seedResult.status).toBe(201)` |
| the `// Act` gate — the `waitForResponse` status | the assertions after it are about a response that arrived |
| any value a later line reads, navigates on, or passes to another call | soft does not stop execution, so the next line would run on garbage |
| the **presence** half of a presence/absence pairing | the pairing exists to prove the locator resolves at all |

Two mechanics worth stating: `expect.soft` does not short-circuit, so every line after one must be safe
to run against the failed state; and Playwright still fails the test at the end. A soft assertion is a
*better-reported* assertion, never a weakened one.

### Meaningful assertions

An assertion that a value merely exists cannot fail against a broken build. These are never the **only**
assertion on a value the scenario names:

| Weak | Use instead |
|---|---|
| `expect(rows.length).toBeGreaterThan(0)` | `toHaveCount(n)` against the number the design or an oracle gives |
| `expect((await cell.innerText()).trim().length).toBeGreaterThan(0)` | `toHaveText` / `toContainText` with the expected value, or `not.toBeEmpty()` **plus** a cross-check |
| `toBeTruthy()`, `not.toBeNull()`, `not.toBe("")` | the matcher for the actual value |
| a bare `toBeVisible()` where `Expected:` names a string | `toHaveText("…")` / `toContainText("…")` |

Where the design genuinely names no fixed value — a catalogue whose size varies between environments —
the assertion is tied to an **independent oracle** and a comment says which one:

```ts
// Assert - FR-10.1: the admin table is the same catalogue the public listing renders
expect(tableNames).toHaveLength(catalogueNames.length);
expect([...tableNames].sort()).toEqual([...catalogueNames].sort());
```

That is a real assertion: it fails when either view drifts. `toBeGreaterThan(0)` on the same data is not.

**One carve-out: the vacuity guard.** A `for` loop over an empty array asserts nothing and passes, so a
count check *before* a loop is doing real work — it stops an empty table from turning the loop green:

```ts
expect(rows.length).toBeGreaterThan(0); // guards the loop, not the behaviour
for (const row of rows) {
  await expect.soft(gamesManagementPage.editButtonFor(row)).toBeVisible();
}
```

That is legitimate because the loop behind it carries the actual assertions. The comment is what marks
it as a guard. The same line with no loop behind it, or standing in for a count the scenario names, is
the weak assertion the table above bans.

## Nothing lives at a spec's module scope

A spec file holds its imports and its `test.describe`. Nothing else. Every helper has a destination:

| What it is | Where it goes |
|---|---|
| traverses, reads or acts on the page | a page-object method |
| a value the test sends, or a domain constant | `utils/test-data/` |
| a column or field list | the page object that owns the table |
| shared by two specs | a page object or `utils/` — never an import from another spec |

One consequence catches everyone: **page objects hold no `expect`, so a page-object loop cannot use
`expect.poll`.** Waiting for a client-side re-render there uses the locator API instead — wait for the
element you are replacing to go away:

```ts
/** Every game name in the listing, collected by paging with Next until it is disabled. */
async allGameNames(): Promise<string[]> {
  const names: string[] = [];
  // The listing fetches its games after mount; wait for the first card before
  // reading any page, or an empty first read silently loses it.
  await this.gameNameHeadings.first().waitFor();

  for (;;) {
    names.push(
      ...(await this.gameNameHeadings.allInnerTexts()).map((h) => h.trim()),
    );

    if (await this.nextPageButton.isDisabled()) {
      return names;
    }

    // Pagination is client-side, so the next page has no request to wait on.
    // Waiting for the heading we just read to detach is what proves the
    // re-render finished - `expect.poll` cannot be used inside a page object.
    const previousFirst = this.headingByName(names[names.length - 1]);
    await this.nextPageButton.click();
    await previousFirst.waitFor({ state: "detached" });
  }
}
```

## Compliant — the spec

```ts
import { test, expect } from "@fixtures/pages-fixture";
import { Endpoints } from "@services/api/endpoints";
import { ListAdminsResponse } from "@services/api/types/admin";
import { AdminTestData } from "@utils/test-data/admin-test-data";

test.describe("Owner feature", () => {
  // SCN-021
  test("As an owner, I should be able to delete an admin", async ({
    page,
    ownerPage,
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange - the existing admin is a precondition, not the scenario: seed it over the API
    const adminEmail = AdminTestData.uniqueUiEmail();
    createdAdminEmails.push(adminEmail);

    const seedResult = await api.admin.createAdmin(
      ownerToken,
      AdminTestData.createAdminPayload(adminEmail),
    );
    expect(seedResult.status).toBe(201); // a broken precondition must fail loudly, not silently

    await ownerPage.goto(); // ownerPage implies ownerSession — no UI login
    await expect(ownerPage.rowFor(adminEmail)).toBeVisible();

    // Act
    ownerPage.acceptNextConfirmDialog(); // before the click, or Playwright dismisses it
    const [deleteResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(Endpoints.admin.users) &&
          response.request().method() === "DELETE",
      ),
      ownerPage.deleteButtonFor(adminEmail).click(),
    ]);

    // Assert - AC-3
    expect(deleteResponse.status()).toBe(200);
    await expect(ownerPage.toast).toContainText(
      "Admin user deleted successfully",
    );
    await expect(ownerPage.rowFor(adminEmail)).toBeHidden();

    // Cheap API cross-check: the UI reflected real state, not local component state
    const adminsResult = await api.admin.listAdmins(ownerToken);
    expect(adminsResult.status).toBe(200);
    expect(
      (adminsResult.body as ListAdminsResponse).admins.map((a) => a.email),
    ).not.toContain(adminEmail);
  });
});
```

## Compliant — the page object it calls

```ts
import { Locator, Page } from "@playwright/test";

export class OwnerPage {
  readonly toast: Locator;
  readonly adminRows: Locator;

  constructor(private readonly page: Page) {
    this.toast = page.getByRole("status");
    // The Owner Panel ships no data-testid; the second rowgroup is the table body,
    // the first one holds the headers.
    this.adminRows = page
      .getByRole("table")
      .getByRole("rowgroup")
      .nth(1)
      .getByRole("row");
  }

  async goto() {
    await this.page.goto("/owner", { waitUntil: "domcontentloaded" });
  }

  rowFor(email: string): Locator {
    return this.adminRows.filter({ hasText: email });
  }

  deleteButtonFor(email: string): Locator {
    return this.rowFor(email).getByRole("button", { name: "Delete Admin" });
  }

  /** Registered before the click: Playwright dismisses unhandled dialogs. */
  acceptNextConfirmDialog() {
    this.page.once("dialog", (dialog) => void dialog.accept());
  }
}
```

Note the `nth(1)` in the page object: it indexes a **structural** rowgroup, not a data row, and it is
documented in a comment. That is not a locator-stability defect. `adminRows.nth(2)` to reach a
particular admin would be — its position depends on which other tests are running in parallel.

## What the two compliant files demonstrate, point by point

| # | The etalon shows |
|---|---|
| E1 | `test`/`expect` from `@fixtures/pages-fixture`, never `@playwright/test` and never the API fixture |
| E2 | data arranged over the API, the seed status asserted, the e-mail registered for cleanup **before** the seed call |
| E3 | the API call in its shortest form — one controller method, one `createAdminPayload()` body. It is a helper, so it takes as little room as it can; the UI steps are what the reader came for |
| E4 | every sent value from `AdminTestData` — `uniqueUiEmail()` for the e-mail, `createAdminPayload()` for the body. No literal e-mail, password or locally written generator in the spec |
| E5 | the one literal that does belong here: the expected rendered string, next to its assertion |
| E6 | `ownerPage` used for the session — no UI login, no manual token write |
| E7 | tier-1 locators throughout, declared as `readonly Locator` fields in the constructor, with a documented missing-`data-testid` gap — no tier drop was needed, so no `LOCATOR-FALLBACK` comment appears |
| E8 | zero `expect` in the page object; the spec calls page-object members, never `page.getByRole` directly |
| E9 | the network-triggering click wrapped in `Promise.all([page.waitForResponse(...), action])`, with both the response status and the rendered result asserted |
| E10 | the `window.confirm` handler registered **before** the click |
| E11 | an absence assertion (`toBeHidden`) **paired with the `toBeVisible` on the same locator in `// Arrange`** — that pairing is what proves the locator resolves at all, since `toBeHidden` passes on a locator matching nothing — plus an API cross-check |
| E12 | `// Arrange` / `// Act` / `// Assert`, a `// SCN-` id per test, an `FR-`/`AC-` id on the assertion carrying it, and one of the two accepted title forms |
| E13 | no `waitForTimeout`, no XPath, no generated class name, no credential literal, no URL string — `Endpoints` supplies the route |
| E14 | hard assertions where they belong: the seed status in `// Arrange`, the response status in `// Act`. This test asserts three dependent facts about one record, so nothing here is soft — the soft form is for the independent-observable loop shown under *Assertions* above |
| E15 | every assertion carries the value the scenario states — `toContainText("Admin user deleted successfully")`, not `toBeVisible()`; the API cross-check names the e-mail, not a count |
| E16 | nothing at module scope but the import lines and the `test.describe` |

## Non-compliant — the same intent, and the defects it carries

```ts
import { test, expect } from "@playwright/test";               // (1)

test("delete admin", async ({ page }) => {                     // (2)
  await page.goto("/owner");
  await page.waitForTimeout(3000);                             // (3)

  await page.locator(".css-1a2b3c").nth(2).click();            // (4)(5)

  await expect(page.getByText("Success")).toBeVisible();       // (6)(7)
});
```

```ts
// pages/owner-page.ts
async deleteAdmin(email: string) {
  await this.rowFor(email).getByRole("button").click();
  await expect(this.toast).toBeVisible();                      // (8)
}
```

| # | Defect | Severity |
|---|---|---|
| 1 | import from `@playwright/test`; the page objects and the seeded session vanish | Major |
| 2 | title follows neither accepted form, and no `// SCN-` id | Minor |
| 3 | `waitForTimeout(3000)` as synchronization — replace with a web-first assertion | Major |
| 4 | `.css-1a2b3c` is a generated class name — banned at every tier, not a tier-4 fallback — and `nth(2)` indexes a data row whose position depends on other tests running in parallel. Neither carries a `LOCATOR-FALLBACK` comment, and no tier was actually exhausted: the button has a role and an accessible name | Major |
| 5 | locator built inline in the spec instead of on the page object; no dialog handler registered, so `window.confirm` is auto-dismissed and the DELETE never fires | Major |
| 6 | the click is not wrapped in `waitForResponse`, so the test cannot tell a failed request from a slow one | Major |
| 7 | `toBeVisible()` on a generic text match, where the scenario names an exact toast string; it would pass on an unrelated success banner | Major |
| 8 | `expect` inside a page object — the assertion cannot be read from the test | Major |

No test data is created here at all, so the run also silently depends on an admin someone else left
behind — an isolation defect on top of the eight above. None of these is a **coverage** finding, which
is the separate and more valuable question: whether every scenario the test design assigned to this
stream actually got a test, and whether that test asserts what the scenario says.

## Two accepted title forms

| Form | For | Example |
|---|---|---|
| `"As a <role>, I should be able to <action>"` | a role-centric flow — the scenario is somebody doing something | `"As an owner, I should be able to delete an admin"` |
| `"<Subject> - Should <behavior>"` | a rendering or state check, where the role is incidental | `"Games management table - Should list every game with all fields rendered"` |

Pick the one the scenario fits and keep a file consistent. `tests/ui/owner.spec.ts` uses the first,
`tests/ui/games-management.spec.ts` the second; both are the house form, and neither is a finding.
Anything that is neither — `"delete admin"` — is a Minor.
