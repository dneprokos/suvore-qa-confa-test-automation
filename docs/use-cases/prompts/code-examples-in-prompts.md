# Code examples in prompts (show, don't describe)

"Follow our style" asks the model to guess the style. "Use the builder, one `with*()`
per field, Arrange / Act / Assert comments" is better, but a paragraph of rules still
leaves room for interpretation. **One short example of the code you want is the most
precise specification you can give.** The model copies its shape: imports, naming,
comments, assertion style, cleanup.

An example works best when you also say:

- **what to copy** from it (the pattern),
- **what to change** (the data, the endpoint, the case),
- **what not to copy** (a value that belongs only to the example).

---

## Example 1 — generate an API test from a reference test

### ❌ Description only (do not use)

```text
Write an API test for deleting an admin. Use our framework and make it look like
the other tests.
```

What goes wrong:

- **"our framework"**: the model may import from `@playwright/test`, call `request.delete`
  with a URL string, or invent a helper that does not exist.
- **"like the other tests"**: which one? `tests/api/` holds four files written at
  different times, some before the current rules.
- **No cleanup rule**: if the delete fails, the seeded admin stays in the database.

### ✅ Description + example (use this)

````text
Add a test to tests/api/admin-api.spec.ts for SCN-012:
"Owner deletes an existing admin → 200, and the admin is no longer listed."

Copy the structure of <example> exactly:
- imports from @fixtures/api-fixture, never from @playwright/test;
- // Arrange, // Act, // Assert comments, each used once;
- the Act is a builder chain with one with*() per value the request sends;
- the controller (api.admin.*) is used only in Arrange and Assert;
- the created email is pushed to createdAdminEmails BEFORE the create call.

Change: the endpoint (sendDeleteAdmin), the title and the assertions.
Do not copy: the "Admin user created successfully" message — it belongs to the
create response, not the delete one. Assert only what SCN-012 states.

Done when `npx playwright test tests/api/admin-api.spec.ts` and
`npm run typecheck` pass. Return the new test only.

<example file="tests/api/admin-api.spec.ts">
test("Create admin - Should create an admin with a valid email", async ({
  api,
  ownerToken,
  createdAdminEmails,
}) => {
  // Arrange - registered before the call so cleanup runs even if it fails
  const newAdminEmail = AdminTestData.uniqueApiEmail();
  createdAdminEmails.push(newAdminEmail);

  // Act
  const result = await api.admin
    .adminBuilder()
    .withBearerToken(ownerToken)
    .withEmail(newAdminEmail)
    .withPassword(AdminTestData.DEFAULT_PASSWORD)
    .withConfirmPassword(AdminTestData.DEFAULT_PASSWORD)
    .sendCreateAdmin();

  // Assert - FR-11.2
  expect(result.status).toBe(201);
  expect(result.body).toMatchObject({
    message: "Admin user created successfully",
    admin: { email: newAdminEmail, role: "admin" },
  });
});
</example>
````

What the model can now produce without guessing:

```ts
test("Delete admin - Should remove an existing admin", async ({
  api,
  ownerToken,
  createdAdminEmails,
}) => {
  // Arrange - seed the admin to delete; cleanup is a no-op if the test removes it
  const adminEmail = AdminTestData.uniqueApiEmail();
  createdAdminEmails.push(adminEmail);

  const seedResult = await api.admin.createAdmin(
    ownerToken,
    AdminTestData.createAdminPayload(adminEmail),
  );
  expect(seedResult.status).toBe(201);
  const adminId = (seedResult.body as CreateAdminResponse).admin.id;

  // Act
  const result = await api.admin
    .adminBuilder()
    .withBearerToken(ownerToken)
    .sendDeleteAdmin(adminId);

  // Assert - SCN-012
  expect(result.status).toBe(200);

  const listResult = await api.admin.listAdmins(ownerToken);
  expect(listResult.status).toBe(200);
  expect(
    (listResult.body as ListAdminsResponse).admins.map((a) => a.email),
  ).not.toContain(adminEmail);
});
```

Same imports, same phases, same cleanup, same builder form — and no copied message
string, because the prompt said which part of the example was data.

---

## Example 2 — point at the file instead of pasting it

Pasting is best for a short, self-contained pattern. When the pattern is a whole file,
or it lives in a document that is kept up to date, point at it by path and name the part
to use. A pasted copy goes stale; the file does not.

### ❌ Vague reference (do not use)

```text
Create a page object for the admin statistics, similar to the existing ones.
```

### ✅ Exact reference (use this)

```text
Create pages/admin-stats-page.ts for the statistics panel on /admin.

Reference, in this order:
1. docs/automation/etalons/ui-spec-etalon.md, section "# Core" — the locator tier
   ladder and the "no expect in a page object" rule.
2. pages/home-page.ts — copy its constructor, its readonly locator fields and its
   waitFor({ state: "detached" }) loop for client-side re-renders.

Do not copy home-page.ts locators; explore /admin and pick locators from the
tier ladder. Add a LOCATOR-FALLBACK comment to any locator below tier 2.
Return the file and a table: field — locator — tier.
```

---

## Example 3 — give a good and a bad example together

A counter-example shows the boundary of the rule faster than a sentence can.

```text
Refactor the waits in tests/ui/search-games.spec.ts.

<good>
await expect(homePage.gameCards).toHaveCount(3);
</good>

<bad reason="fixed wait: slow on CI, still flaky on a slow backend">
await page.waitForTimeout(2000);
expect(await homePage.gameCards.count()).toBe(3);
</bad>

Replace every occurrence of the <bad> shape with the <good> shape.
Do not change the expected values. Run the file with --repeat-each=5 and report the result.
```

---

## Checklist for a prompt with a code example

| Element | Without it | With it |
|---|---|---|
| **The example** | Model invents the style | Model copies a real, working shape |
| **Source** | "like the other tests" | `file="tests/api/admin-api.spec.ts"` or an exact path + section |
| **What to copy** | Everything, including test data | A listed pattern: imports, phases, builder, cleanup |
| **What to change** | Model decides | Endpoint, title, assertions — named |
| **What not to copy** | Example-only strings leak into new code | "Do not copy the create message" |
| **Counter-example** | Rule is abstract | `<bad>` block shows the exact shape to avoid |
| **Done criteria** | Code that looks right | The command that must pass |

## Rules of thumb

| Do | Don't |
|---|---|
| Use one short example that already follows the current rules | Paste an old file that breaks them — the model copies the bugs too |
| Keep the example the same size as the expected output | Paste 500 lines to show a 20-line pattern |
| Wrap the example in a tag with its path: `<example file="…">` | Drop code into the prompt with no marker where it ends |
| Say which values are example-only | Let a hardcoded email or message travel into the new test |
| Prefer a path to a maintained file for a large pattern | Paste a copy that goes out of date next week |
| Pair a `<good>` with a `<bad>` when the rule is subtle | Describe the anti-pattern only in words |

> The model imitates what it sees more reliably than what it is told. Choose the example
> as carefully as the instruction: it is the part of the prompt that gets copied.
