# API Spec Etalon

The house form for a Playwright API spec under `tests/api/`. One document, two readers: whoever writes
a new spec copies this shape, and whoever reviews one calibrates against it. A style finding is a
departure from *this*, never from a preference formed on the spot.

**The files on disk outrank this sketch.** `tests/api/admin-api.spec.ts` and
`tests/api/login-api.spec.ts` are the canonical in-repo references for file layout, titles and
assertion style; where the repository and this document disagree, the repository is right and the
difference is not a finding.

One rule survives that precedence, because it post-dates the specs on disk: **the `// Act` is always
the builder, one `with*()` call per field sent.** An older spec that acts through a controller method
or through `withMatchingPassword` predates the rule. New code follows the rule; the old specs are not
retrofitted to match, and they are not evidence against it.

## The layers

```
fixtures/api-fixture.ts          test, expect, and the fixtures `api`, `ownerToken`, `createdAdminEmails`
  └─ ApiFacade                   api.auth, api.admin
       └─ AuthApi / AdminApi     controller — one method per common call
            └─ *RequestBuilder   fluent with*() → send*(), the escape hatch
                 └─ toApiResult  { response, status, ok, body }

utils/test-data/*                AdminTestData, AuthTestData — every value a spec sends
utils/response-patterns.ts       ResponsePatterns — every regex a spec asserts
@framework/configuration/config  Config — every credential, from .env
```

`toApiResult` never assumes JSON: an empty body becomes `undefined`, a non-JSON body stays raw text.
That is why a negative test can assert `result.status` without dying in a parse error — and why a spec
asserts `result.status` / `result.ok` / `result.body`, never the raw `APIResponse`.

## Which layer a scenario needs

The rule is the phase, not the payload: **the builder performs the Act, the controller performs the
preconditions and the postconditions.** A reader of the `// Act` block must be able to see every field
the request carries without opening another file, and that is only true when each field has its own
`with*` call.

| Phase | Layer | Call |
|---|---|---|
| `// Arrange` — data must exist before the Act | controller | `api.admin.createAdmin(ownerToken, AdminTestData.createAdminPayload(email))` |
| `// Arrange` — a token, a seeded record, an id to act on | controller | `api.auth.login({ email, password })`, `api.admin.listAdmins(ownerToken)` |
| **`// Act` — the request under test, happy path or negative, always** | **builder** | `api.admin.adminBuilder().withBearerToken(ownerToken).withEmail(e).withPassword(p).withConfirmPassword(p).sendCreateAdmin()` |
| `// Assert` — the cross-check that the record does or does not exist | controller | `api.admin.listAdmins(ownerToken)` |
| cleanup outside `createdAdminEmails` | controller | `api.admin.deleteAdmin(ownerToken, id)` |

Inside the Act, spell the request out field by field:

| The Act sends | Write |
|---|---|
| every field of a well-formed body | `.withEmail(e).withPassword(p).withConfirmPassword(p)` — one call per field, in body order |
| a mismatched confirmation, or any two fields set apart | ``.withPassword(p).withConfirmPassword(`${p}x`)`` |
| a field the scenario omits | leave its `with*` call out, and say so in the `// Arrange` comment |
| a body no type allows — a string, a number, `{}`, `null` | `.withRawBody({})`, `.withRawBody("not-json")` |
| missing or invalid auth | omit `withBearerToken`, or `.withBearerToken(AuthTestData.MALFORMED_TOKEN)` |
| a call no controller or builder exposes yet | add the method to `services/api/controllers/` or `services/api/builders/` and the route to `services/api/endpoints.ts` — never a raw `request.post(...)` in a spec |

Two shortcuts are **banned in an `// Act` block**, because both hide a sent value from the reader:

- `withMatchingPassword(p)` — it sets two fields under one name. Write
  `.withPassword(p).withConfirmPassword(p)`.
- `withBody(payload)` / `AdminTestData.createAdminPayload(email)` as the Act body — the fields live in
  another file. Both stay legal in `// Arrange`, where the call is a precondition and its exact shape
  is not what the test is about.

`withRawBody` is the one exception: a body that is deliberately not an object has no fields to spell
out, and the literal in the call already shows what was sent.

`Config` (`@framework/configuration/config`) is the only source of credentials — `Config.OWNER_EMAIL`,
`Config.OWNER_PASSWORD` — and `api.auth.loginAsOwner()` already wraps the owner login the `ownerToken`
fixture uses.

## Two response shapes, and one environment limit

- `GET /api/admin/users` returns Mongoose documents: `AdminUser._id`, plus `updatedAt` and an optional
  `lastLogin`.
- `POST /api/admin/users` returns `CreateAdminResponse.admin.id` — `id`, not `_id`, and no `lastLogin`.
  Asserting `_id` on a create response fails for a reason that has nothing to do with the scenario.
- `.env` currently points `ADMIN_EMAIL` at the same address as `OWNER_EMAIL`, so a token obtained "as
  admin" is an owner token. A scenario that needs a **non-owner role rejected with 403** cannot be
  honestly automated here: it would pass for the wrong reason. Skip it, name this as the reason, and
  record it under `Known Limitations` — `tests/api/admin-api.spec.ts` carries exactly that comment at
  the top of the file.

## Setup and cleanup over the API — always

| Situation | Do |
|---|---|
| the test needs an admin that already exists | seed it with `api.admin.createAdmin` in `// Arrange`, assert the seed status, push the e-mail to `createdAdminEmails` |
| the create call *is* the Act | push the e-mail to `createdAdminEmails` **before** the call, so cleanup runs even when the assertion fails |
| the delete call is the Act | still push it — `findAdminIdsByEmail` returns nothing afterwards and cleanup becomes a no-op |
| an entity `createdAdminEmails` does not cover | delete it over the API in `test.afterEach`; never leave a record behind |
| the request under test must fail before anything is created | no registration needed, and say so in a comment |

Never arrange through a second HTTP client, a database call, or a UI flow. `createdAdminEmails` cleanup
runs through the owner token the fixture already holds.

## Reading the API surface

**`Read` `docs/automation/api-surface-reading.md`.** The `# API Surface` section of a requirements
document — what it answers, what it never answers, how `## Spec Gaps` and an inherited `Auth:` line are
read, what `Source:` means, and what to do when the section is missing — lives there, because both
streams read the same section and a second copy of those rules would drift from the first.

One line of it decides every question this stream asks of the surface: **a value you assert must appear
in the test design's `Expected:`.** The surface supplies the route, the verb, the parameter names and the
bearer requirement; the design supplies everything the test claims.

## Query parameters

`GET` collections take their filters and paging in the query string. The `// Act` rule does not change:
**one `with*()` per parameter the request sends**, so the whole request still reads at the point it is
made. A parameter set with a payload object, or spliced into the URL as a string, hides what was sent —
the same defect as `withBody` in an Act block.

The builder holds the query the way it already holds headers, and Playwright serialises it through
`params`:

```ts
export class GamesRequestBuilder {
  private query: Record<string, string | number | boolean> = {};
  private headers: Record<string, string> = {};

  constructor(private readonly request: APIRequestContext) {}

  // #region Query
  withQueryParam(name: string, value: string | number | boolean): this {
    this.query[name] = value;
    return this;
  }

  /** Named sugar for the parameters the API documents. */
  withLimit(limit: number): this {
    return this.withQueryParam("limit", limit);
  }

  withPage(page: number): this {
    return this.withQueryParam("page", page);
  }

  withSearch(search: string): this {
    return this.withQueryParam("search", search);
  }
  // #endregion

  async sendListGames(): Promise<ListGamesApiResult> {
    const response = await this.request.get(Endpoints.games.list, {
      params: this.query,
      headers: this.headers,
    });

    return toApiResult<ListGamesResponse | GamesErrorResponse>(response);
  }
}
```

and the Act reads as one line naming every parameter it sends:

```ts
// Act
const result = await api.games.builder().withLimit(10).withPage(2).sendListGames();
```

Rules for the sugar:

- Add a named `with*()` for a parameter the API surface documents, and use it. `withLimit(10)` says what the
  request means; `withQueryParam("limit", 10)` only says what it contains.
- Keep `withQueryParam` for a parameter no scenario names repeatedly, and for one the surface does not
  document — that case needs the escape hatch precisely because there is nothing to name it after.
- Never add a `with*()` for a parameter no scenario uses. A builder is grown by the tests that need it, not
  filled in from a route list.
- A parameter omitted from the chain is a parameter the request does not send. That is a meaningful test
  input — the default-paging case is `sendListGames()` with an empty chain, not `withPage(1)`.

## Compliant — the shape a new spec is expected to have

Every line below is the real shape of `tests/api/admin-api.spec.ts`. Copy the shape, not the scenarios.

```ts
import { test, expect } from "@fixtures/api-fixture";
import {
  AdminErrorResponse,
  CreateAdminResponse,
  ListAdminsResponse,
} from "@services/api/types/admin";
import { ResponsePatterns } from "@utils/response-patterns";
import { AdminTestData } from "@utils/test-data/admin-test-data";
import { AuthTestData } from "@utils/test-data/auth-test-data";

/** Flattens the express-validator messages of a 400 body. */
function errorMessages(body: AdminErrorResponse): string[] {
  return [body.message, ...(body.errors ?? []).map((e) => e.msg)].filter(
    (message): message is string => typeof message === "string",
  );
}

test.describe("POST /api/admin/users", () => {
  // SCN-012 — the Act is the builder, one with*() per field, so the whole request reads here
  test("Create admin - Should create an admin with a valid payload", async ({
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
    await expect(result.response).toBeOK();
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      message: "Admin user created successfully",
      admin: {
        id: expect.any(String),
        email: newAdminEmail,
        role: "admin",
        createdAt: expect.any(String),
      },
    });

    const created = (result.body as CreateAdminResponse).admin;
    expect(created.id).toMatch(ResponsePatterns.OBJECT_ID);
    expect(created.createdAt).toMatch(ResponsePatterns.ISO_DATE);
    expect(created).not.toHaveProperty("password");

    // The record really exists, not just the response said so
    const listResult = await api.admin.listAdmins(ownerToken);
    expect(listResult.status).toBe(200);
    expect(
      (listResult.body as ListAdminsResponse).admins.map((a) => a.email),
    ).toContain(newAdminEmail);
  });

  // SCN-013 — precondition through the controller, Act through the builder
  test("Create admin - Should reject an e-mail that is already registered", async ({
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange - a precondition, not the request under test, so the short form
    const duplicateEmail = AdminTestData.uniqueApiEmail();
    createdAdminEmails.push(duplicateEmail);

    const seedResult = await api.admin.createAdmin(
      ownerToken,
      AdminTestData.createAdminPayload(duplicateEmail),
    );
    expect(seedResult.status).toBe(201);

    // Act - the same fields again, spelled out: the duplicate e-mail is the point of the test
    const result = await api.admin
      .adminBuilder()
      .withBearerToken(ownerToken)
      .withEmail(duplicateEmail)
      .withPassword(AdminTestData.DEFAULT_PASSWORD)
      .withConfirmPassword(AdminTestData.DEFAULT_PASSWORD)
      .sendCreateAdmin();

    // Assert - FR-11.4
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(errorMessages(result.body as AdminErrorResponse)).toContain(
      "User with this email already exists",
    );
  });

  // SCN-014 — the request itself is under test, so drop to the builder
  test("Create admin - Should reject a request without a bearer token", async ({
    api,
    ownerToken,
  }) => {
    // Arrange - no withBearerToken below, so nothing is created and nothing needs cleanup
    const newAdminEmail = AdminTestData.uniqueApiEmail();

    // Act
    const result = await api.admin
      .adminBuilder()
      .withEmail(newAdminEmail)
      .withPassword(AdminTestData.DEFAULT_PASSWORD)
      .withConfirmPassword(AdminTestData.DEFAULT_PASSWORD)
      .sendCreateAdmin();

    // Assert - AC-4, and the account must not exist afterwards
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);

    const listResult = await api.admin.listAdmins(ownerToken);
    expect(listResult.status).toBe(200);
    expect(
      (listResult.body as ListAdminsResponse).admins.map((a) => a.email),
    ).not.toContain(newAdminEmail);
  });

  // SCN-016 — a boundary case: the value lives in the test data class, not here
  test("Create admin - Should accept a password of exactly 6 characters", async ({
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange - the minimum length is inclusive
    const newAdminEmail = AdminTestData.uniqueApiEmail();
    createdAdminEmails.push(newAdminEmail);

    // Act
    const result = await api.admin
      .adminBuilder()
      .withBearerToken(ownerToken)
      .withEmail(newAdminEmail)
      .withPassword(AdminTestData.MIN_LENGTH_PASSWORD)
      .withConfirmPassword(AdminTestData.MIN_LENGTH_PASSWORD)
      .sendCreateAdmin();

    // Assert - FR-11.3
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      admin: { email: newAdminEmail, role: "admin" },
    });
  });

  // SCN-017 — an invalid credential value, also from the shared data class
  test("Create admin - Should reject a malformed e-mail", async ({
    api,
    ownerToken,
  }) => {
    // Arrange & Act
    const result = await api.admin
      .adminBuilder()
      .withBearerToken(ownerToken)
      .withEmail(AuthTestData.MALFORMED_EMAIL)
      .withPassword(AdminTestData.DEFAULT_PASSWORD)
      .withConfirmPassword(AdminTestData.DEFAULT_PASSWORD)
      .sendCreateAdmin();

    // Assert - FR-11.3. The test design leaves the exact message for this case
    // open, so only the status and the error shape are asserted.
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect((result.body as AdminErrorResponse).errors ?? []).not.toHaveLength(0);
  });
});
```

## What the compliant example demonstrates, point by point

| # | The etalon shows |
|---|---|
| E1 | `test`/`expect` from `@fixtures/api-fixture`, never `@playwright/test` |
| E2 | fixtures destructured, not constructed: `api`, `ownerToken`, `createdAdminEmails` |
| E3 | builder for every `// Act`, one `with*` call per field sent, so the request reads in full at the point it is made — no `withMatchingPassword`, no payload object, no `withBody` |
| E4 | controller for every precondition and postcondition — the seed, the cross-check, the cleanup — where the short form keeps those steps out of the reader's way |
| E5 | cleanup registered **before** the call that creates the record; no `createdAdminEmails` at all when the call is expected to create nothing |
| E6 | every sent value from `AdminTestData` / `AuthTestData`, every contract regex from `ResponsePatterns` — no literal e-mail, password, ObjectId or regex in the spec |
| E7 | the one literal that does belong here: the expected response message, next to its assertion |
| E8 | `// Arrange` / `// Act` / `// Assert`, a `// SCN-` id per test, an `FR-`/`AC-` id on the assertion carrying it |
| E9 | assertions on `result.status` / `result.ok` / `result.body` (and `await expect(result.response).toBeOK()` on a happy path), plus absence assertions and a cross-check against `listAdmins` |
| E10 | a file-local helper only for **reading** a response — `errorMessages` above. A helper that *produces* test data belongs in `utils/test-data/` |
| E11 | a comment stating why a case is asserted loosely, when the design left the value open |
| E12 | title `"<Feature> - Should <behavior>"`, describe block named for the endpoint |
| E13 | no URL string, no credential literal, no `waitForTimeout` |

## Non-compliant — the same intent, and the defects it carries

```ts
import { test, expect } from "@playwright/test";              // (1)

const OWNER_PASSWORD = "Owner12345@";                          // (2)

test("should create admin", async ({ request }) => {           // (3)
  const login = await request.post(
    "http://localhost:9000/api/auth/login",                     // (4)
    { data: { email: "owner@example.com", password: OWNER_PASSWORD } },
  );
  const token = (await login.json()).token;

  const response = await request.post(
    "http://localhost:9000/api/admin/users",
    {
      data: {                                                   // (5)
        email: "new.admin+1@example.com",
        password: OWNER_PASSWORD,
        confirmPassword: OWNER_PASSWORD,
      },
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  expect(response.ok()).toBeTruthy();                           // (6)
});
```

| # | Defect | Severity |
|---|---|---|
| 1 | import from `@playwright/test`; the fixtures vanish and cleanup never runs | Major |
| 2 | credential literal in the spec instead of `Config` | Critical |
| 3 | title does not follow `"<Feature> - Should <behavior>"` | Minor |
| 4 | raw `request.post` and a URL literal, bypassing the controller, the builder and `Endpoints` | Major |
| 5 | a hard-coded e-mail containing a dot and a plus — `normalizeEmail()` rewrites it, and the record is never registered for cleanup, so the second run collides | Major |
| 6 | assertion on the raw `APIResponse` with no status and no body check; a 200 would pass as loudly as a 201 | Major |

The credential is the only Critical here. Everything else is Major or Minor — and none of the six is a
**coverage** finding, which is the separate and more valuable question: whether every scenario the test
design assigned to this stream actually got a test, and whether that test asserts what the scenario says.
