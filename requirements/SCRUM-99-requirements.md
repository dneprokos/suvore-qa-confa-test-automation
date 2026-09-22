---
ticket: SCRUM-99
ticket_url: https://dneprokos-test.atlassian.net/browse/SCRUM-99
issue_type: Story
parent_epic: SCRUM-85 — [F-02] Authentication & Session Management
jira_status_before: Done
jira_status_after: Done
retrieved_at: 2026-09-22T18:39:03Z
generated_by: qa-requirements-collector
acceptance_criteria_count: 2
functional_requirement_count: 5
retrieval_gaps: none
api_surface: partial
api_surface_provenance: openapi
api_surface_operations: 5
api_surface_gaps: 3
---

# Ticket Summary

SCRUM-99 — "Implement login with email and password", a Story under epic SCRUM-85 ([F-02] Authentication &
Session Management), labels `backend`, `f-02`, `retro-portal`, priority Medium. The ticket asks for an
e-mail/password login operation that returns a bearer token, so that an Admin or an Owner can reach the
privileged parts of the Retro Video Games Portal.

Five functional requirements (FR-02.1 … FR-02.5) and two acceptance criteria. The ticket carries no
subtasks, no issue links and no components.

# Original Description

_Verbatim from Jira. No derived content._

```text
_User Story:_ As an Admin or Owner, I want to log in with my email and password, so that I receive a bearer token that lets me access privileged features.

_Scope / Functional Requirements:_

* FR-02.1 The system shall provide a login operation accepting `email` and `password` and shall reject syntactically invalid emails or an empty password with HTTP 400 and a field-level error list.
* FR-02.2 The system shall return HTTP 401 with the message "Invalid email or password" both when the email is unknown and when the password does not match.
* FR-02.3 On successful login the system shall return a JWT plus the user's `id`, `email`, `role` and `createdAt`, and shall never return the password hash.
* FR-02.4 The system shall sign tokens with a server-side secret and shall expire them after `JWT_EXPIRES_IN` (default 7 days).
* FR-02.5 The system shall record the timestamp of each successful login on the user record.

_Acceptance Criteria:_

* Given valid Owner credentials, When the login form is submitted, Then a success toast appears and the browser is redirected to `/`.
* Given an unregistered email, When login is submitted, Then an error toast reading "Invalid email or password" appears and the user remains on `/login`.

_Traceability:_ F-02, FR-02.1, FR-02.2, FR-02.3, FR-02.4, FR-02.5
```

# Acceptance Criteria

_Verbatim from Jira. No derived content._

## Functional Requirements (stated)

### FR-02.1
The system shall provide a login operation accepting `email` and `password` and shall reject syntactically invalid emails or an empty password with HTTP 400 and a field-level error list.

### FR-02.2
The system shall return HTTP 401 with the message "Invalid email or password" both when the email is unknown and when the password does not match.

### FR-02.3
On successful login the system shall return a JWT plus the user's `id`, `email`, `role` and `createdAt`, and shall never return the password hash.

### FR-02.4
The system shall sign tokens with a server-side secret and shall expire them after `JWT_EXPIRES_IN` (default 7 days).

### FR-02.5
The system shall record the timestamp of each successful login on the user record.

## Acceptance Criteria (stated)

### AC-1

Verbatim: Given valid Owner credentials, When the login form is submitted, Then a success toast appears and the browser is redirected to `/`.

- **Given** valid Owner credentials,
- **When** the login form is submitted,
- **Then** a success toast appears and the browser is redirected to `/`.

### AC-2

Verbatim: Given an unregistered email, When login is submitted, Then an error toast reading "Invalid email or password" appears and the user remains on `/login`.

- **Given** an unregistered email,
- **When** login is submitted,
- **Then** an error toast reading "Invalid email or password" appears and the user remains on `/login`.

# Subtasks

None.

# Linked Issues

None.

# Dependencies

_Inferred by qa-requirements-collector. Not stated in the Jira ticket._

- (derived) A user record store holding an e-mail, a password hash and a `createdAt` value must already exist before a login can be attempted — from: "FR-02.3 … shall return a JWT plus the user's `id`, `email`, `role` and `createdAt`".
- (derived) A token-signing secret and a `JWT_EXPIRES_IN` setting must be configured on the server — from: "FR-02.4 The system shall sign tokens with a server-side secret and shall expire them after `JWT_EXPIRES_IN`".
- (derived) A password-hash comparison (the store holds a hash, not the password) is required to decide FR-02.2 — from: "FR-02.3 … shall never return the password hash".
- (derived) The owner account must have been created before an Owner login can succeed, which the surface exposes as `POST /api/auth/register` and `GET /api/auth/owner-exists` — from: "As an Admin or Owner, I want to log in".
- (derived) A client-side session holder is needed for the redirect in AC-1 to leave the user signed in on `/` — from: "Then a success toast appears and the browser is redirected to `/`".

# Affected Components

_Inferred by qa-requirements-collector. Not stated in the Jira ticket._

- (derived) The authentication API route group `/api/auth` — from: the user story's "log in with my email and password".
- (derived) The user model and its `lastLogin` field — from: "FR-02.5 The system shall record the timestamp of each successful login on the user record".
- (derived) The token-issuing and token-verifying middleware — from: "FR-02.4 The system shall sign tokens with a server-side secret".
- (derived) The `/login` page and its form — from: "When the login form is submitted" in AC-1 and "the user remains on `/login`" in AC-2.
- (derived) The toast notification surface — from: "a success toast appears" (AC-1) and "an error toast reading …" (AC-2).
- (derived) The role-aware navigation shown after the redirect — from: "the browser is redirected to `/`" for a caller whose role is Owner or Admin.

# API Surface

_Derived from the application's OpenAPI document. Not stated in the ticket._

Source: http://localhost:5000/api-docs/swagger-ui-init.js
Fetched at: 2026-09-22T18:39:03.462Z
Base URL: http://localhost:9000 · Path prefix: /api
Match keys: auth, login
Match basis: tag (5 operations)

## POST /api/auth/login
Source: openapi
Summary: Login user and get JWT
Auth: none
Body (required): email (string), password (string)
Documented codes: 200
  200 — Login successful, returns JWT token — { message: string, token: string, user: { id: string, email: string, role: string, createdAt: string } }

## POST /api/auth/logout
Source: openapi
Summary: Log out the current user
Auth: bearerAuth
Documented codes: 200, 401
  200 — Logout successful — { message: string }
  401 — Missing, invalid or expired token — (no schema)

## GET /api/auth/me
Source: openapi
Summary: Get the currently authenticated user
Auth: bearerAuth
Documented codes: 200, 401, 500
  200 — Current user — { user: { id: string, email: string, role: string, createdAt: string, lastLogin: string } }
  401 — Missing, invalid or expired token — (no schema)
  500 — Server error — (no schema)

## GET /api/auth/owner-exists
Source: openapi
Summary: Check whether the owner account has been created
Auth: none
Documented codes: 200, 500
  200 — Owner existence flag — { exists: boolean }
  500 — Server error — (no schema)

## POST /api/auth/register
Source: openapi
Summary: Create the owner account (single use)
Auth: none
Body (required): email (string) *, password (string, minLength 6) *, confirmPassword (string) *
Documented codes: 201, 400, 403, 500
  201 — Owner account created, returns JWT token — { message: string, token: string, user: { id: string, email: string, role: string, createdAt: string } }
  400 — Validation error or owner account already exists — (no schema)
  403 — Email does not match the configured owner email — (no schema)
  500 — Server error — (no schema)

## Spec Gaps
- POST /api/auth/login: no error responses documented.
- POST /api/auth/logout: no request body documented.
- No matched operation documents an error response body, so no error message string is stated anywhere in the spec.

# Testing-Relevant Information

- (stated) The login operation takes exactly two inputs, `email` and `password` (FR-02.1), and the surface confirms both are the documented request body of `POST /api/auth/login`.
- (stated) Two different failure causes — an unknown e-mail and a wrong password — must produce the **same** response: HTTP 401, message "Invalid email or password" (FR-02.2). A test that distinguishes them by response is asserting a defect.
- (stated) A malformed input is a different class from a wrong credential: HTTP 400 with a field-level error list (FR-02.1) versus HTTP 401 with one message (FR-02.2).
- (stated) The success body has a fixed shape: `token`, and `user` carrying `id`, `email`, `role`, `createdAt` (FR-02.3), which the surface repeats along with `message`.
- (stated) The password hash must never appear in a response (FR-02.3) — an absence assertion, not a value assertion.
- (stated) Token expiry is configuration-driven (`JWT_EXPIRES_IN`, default 7 days, FR-02.4), so the expiry *value* is environment-dependent and only the claim's presence is stable.
- (stated) `lastLogin` is written on every successful login (FR-02.5). The surface exposes it on `GET /api/auth/me` only — the login response itself does not carry it.
- (derived) The observable for AC-1 is a redirect to `/` plus a success toast; for AC-2 it is staying on `/login` plus an error toast carrying the FR-02.2 message — from: the two Given/When/Then bullets.
- (derived) The owner credentials used by a test come from configuration (`OWNER_EMAIL` / `OWNER_PASSWORD`), never from a literal — from: this repository's configuration rule, applied to "valid Owner credentials" in AC-1.
- (derived) Both roles in the user story (Admin, Owner) exercise the same operation; only the `role` value in the response differs — from: "As an Admin or Owner".

# Known Constraints

- (stated) The 401 message is fixed text — "Invalid email or password" — and is shared by both failure causes (FR-02.2).
- (stated) The token is a JWT signed server-side (FR-02.4); a test may assert its shape but cannot assert the secret.
- (stated) The default expiry is 7 days (FR-02.4), which is far longer than any test run, so expiry cannot be observed by waiting.
- (derived) `POST /api/auth/login` documents **only** 200 (see Spec Gaps). Every non-200 status this ticket requires — 400 and 401 — is stated in the ticket and absent from the spec, so a test asserting an exact failure status is trusting the ticket, not the surface — from: "## Spec Gaps: POST /api/auth/login: no error responses documented".
- (derived) No error response body is documented anywhere in the matched surface, so the shape carrying the FR-02.2 message string is unstated at the API level — from: the third Spec Gaps bullet.
- (derived) `POST /api/auth/register` creates the owner account once and rejects a mismatched e-mail with 403; a test must therefore treat the owner account as pre-existing rather than create one — from: "Summary: Create the owner account (single use)".

# Existing Open Questions

- (derived) FR-02.1 requires HTTP 400 with "a field-level error list", but neither the ticket nor the OpenAPI document states the shape of that list — the field names, the container key, or whether one 400 can carry several entries.
- (derived) FR-02.1 names two rejectable inputs, a syntactically invalid e-mail and an empty password. It does not say what happens when the field is **absent** rather than empty, which is a different request.
- (derived) The exact text of the FR-02.1 400 response is unstated; only the 401 message is fixed by FR-02.2.
- (derived) FR-02.5 requires a login timestamp on the user record but states no observable for it. `GET /api/auth/me` returns `lastLogin`, which is the only documented way to read it; whether that is the intended oracle is not stated.
- (derived) FR-02.4 has no stated acceptance criterion — no AC covers signing or expiry, so nothing in the ticket says how either is to be demonstrated.
- (derived) FR-02.5 has no stated acceptance criterion.
- (derived) Neither AC names a role other than Owner, although the user story covers "an Admin or Owner". Whether an Admin login is expected to differ in any observable way is unstated.
- (derived) AC-1 and AC-2 both require a toast. The ticket does not say how long it stays, or whether the redirect in AC-1 happens before or after it appears.
