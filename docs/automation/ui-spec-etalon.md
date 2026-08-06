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
| E7 | role-based locators only, declared as `readonly Locator` fields in the constructor, with a documented missing-`data-testid` gap |
| E8 | zero `expect` in the page object; the spec calls page-object members, never `page.getByRole` directly |
| E9 | the network-triggering click wrapped in `Promise.all([page.waitForResponse(...), action])`, with both the response status and the rendered result asserted |
| E10 | the `window.confirm` handler registered **before** the click |
| E11 | an absence assertion (`toBeHidden`) **paired with the `toBeVisible` on the same locator in `// Arrange`** — that pairing is what proves the locator resolves at all, since `toBeHidden` passes on a locator matching nothing — plus an API cross-check |
| E12 | `// Arrange` / `// Act` / `// Assert`, a `// SCN-` id per test, an `FR-`/`AC-` id on the assertion carrying it, title `"As an owner, I should …"` |
| E13 | no `waitForTimeout`, no CSS or XPath, no credential literal, no URL string — `Endpoints` supplies the route |

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
| 2 | title does not follow `"As a <role>, I should …"`, and no `// SCN-` id | Minor |
| 3 | `waitForTimeout(3000)` as synchronization — replace with a web-first assertion | Major |
| 4 | `.css-1a2b3c` is a generated class name, and `nth(2)` indexes a data row whose position depends on other tests running in parallel | Major |
| 5 | locator built inline in the spec instead of on the page object; no dialog handler registered, so `window.confirm` is auto-dismissed and the DELETE never fires | Major |
| 6 | the click is not wrapped in `waitForResponse`, so the test cannot tell a failed request from a slow one | Major |
| 7 | `toBeVisible()` on a generic text match, where the scenario names an exact toast string; it would pass on an unrelated success banner | Major |
| 8 | `expect` inside a page object — the assertion cannot be read from the test | Major |

No test data is created here at all, so the run also silently depends on an admin someone else left
behind — an isolation defect on top of the eight above. None of these is a **coverage** finding, which
is the separate and more valuable question: whether every scenario the test design assigned to this
stream actually got a test, and whether that test asserts what the scenario says.
