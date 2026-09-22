---
ticket: SCRUM-99
revision: 1
---

# Test Design — SCRUM-99: Implement login with email and password

_Derived from requirements/SCRUM-99-requirements.md._

# Summary

Scenarios: 14  |  Automatable: 10  |  Manual only: 4
Levels: Unit 2, Integration 3, E2E API 4, E2E UI 2, Requirement Gap 3
Requirements: FR 5/5, AC 2/2 covered
Techniques: EP 8/10 (2 traced-only), BVA 2/2, DT 3/4 (1 traced-only), ST 2/4

# Scenarios

## SCN-001: Valid owner credentials return a token and the documented user object
Requirement: FR-02.3
Category: Happy path
Technique: Decision Table Testing
Coverage Item: DT-01/R1, EP-01, EP-04
Priority: High
Preconditions: The owner account exists and its credentials are the configured ones.
Action: A login request is sent carrying the owner e-mail and the matching password.
Expected: The request succeeds with HTTP 200 and a body carrying the success message, a token in JWT form, and a user object whose id, e-mail, role "owner" and creation timestamp are all present and well-formed.
Suggested Level: E2E API
Assigned Level: E2E API
Level Rationale: An authorization contract is only real at the public surface — factor 1; the token and the user object are what a caller receives.
Automation Suitability: High
Notes: —

## SCN-002: A wrong password is refused with the shared credential message and no token
Requirement: FR-02.2
Category: Negative path
Technique: Decision Table Testing
Coverage Item: DT-01/R2, EP-05
Priority: High
Preconditions: The owner account exists.
Action: A login request is sent carrying the owner e-mail and a password that does not match it.
Expected: The request fails with a client-error status and a body carrying the message "Invalid email or password", and the body carries no token.
Suggested Level: E2E API
Assigned Level: E2E API
Level Rationale: The refusal is a contract about status and message text that only the real route emits — factor 1.
Automation Suitability: High
Notes: —

## SCN-003: A login request that omits the password is refused without a token
Requirement: FR-02.1
Category: Validation rules
Technique: Equivalence Partitioning
Coverage Item: EP-06
Priority: High
Preconditions: The owner account exists.
Action: A login request is sent carrying the owner e-mail and no password field at all.
Expected: The request fails with a client-error status below 500 and the body carries no token.
Suggested Level: E2E API
Assigned Level: E2E API
Level Rationale: The request is malformed before it reaches any component, so only the public surface can refuse it as a caller sees it — factor 1.
Automation Suitability: High
Notes: The exact status is asserted as a 4xx range rather than as 400 — unknown: which of 400 or 401 an absent field takes, since FR-02.1 names an empty password and not an absent one.

## SCN-004: An owner signing in through the form reaches the portal as a privileged user
Requirement: AC-1, FR-02.3
Category: Happy path
Technique: State Transition Testing
Coverage Item: ST-01/T1
Priority: High
Preconditions: The owner account exists and the login page is open.
Action: The owner fills the e-mail and password fields with valid credentials and submits the form.
Expected: The browser lands on the portal root, and the navigation bar shows the signed-in e-mail address, a logout control and the privileged Owner and Admin links.
Suggested Level: E2E UI
Assigned Level: E2E UI
Level Rationale: A journey across routes with a real session and a real navigation render — factor 3, no stub reproduces it.
Automation Suitability: High
Notes: API coverage: linked SCN-001 — the token and user-object contract behind this sign-in is asserted there; this scenario asserts only what the screen shows afterwards.

## SCN-005: Invalid credentials keep the user on the login page with the error shown in place
Requirement: AC-2, FR-02.2
Category: Negative path
Technique: State Transition Testing
Coverage Item: ST-01/T2
Priority: High
Preconditions: The owner account exists and the login page is open.
Action: The owner fills the e-mail field with a valid address and the password field with a wrong password, and submits the form.
Expected: The browser stays on the login route and the page's status region reads "Invalid email or password".
Suggested Level: E2E UI
Assigned Level: E2E UI
Level Rationale: The failure exit of the same journey: the route must not change and the page must render the server message — factor 3.
Automation Suitability: High
Notes: API coverage: linked SCN-002 — the status and message contract is asserted there; this scenario asserts only that the page stays put and surfaces the message.

## SCN-006: An unknown e-mail is refused identically to a wrong password
Requirement: FR-02.2
Category: Negative path
Technique: Decision Table Testing
Coverage Item: DT-01/R3, EP-03
Priority: High
Preconditions: No account exists for the e-mail address used.
Action: A login request is sent carrying a syntactically valid but unregistered e-mail and any password.
Expected: The response is indistinguishable from the wrong-password response of SCN-002 — the same status and the same message — so that the response does not reveal whether the account exists.
Suggested Level: E2E API
Assigned Level: Integration
Level Rationale: Demoted. The behaviour under test is the route and the user store converging on one response; an integration test over both reproduces it in full, and SCN-002 already pins the public shape.
Automation Suitability: High
Notes: The value under test is the convergence of a store miss and a hash mismatch on one response, which is route-and-store wiring rather than a public-surface contract SCN-002 does not already pin.

## SCN-007: A syntactically invalid e-mail is rejected with a field-level error list
Requirement: FR-02.1
Category: Validation rules
Technique: Decision Table Testing
Coverage Item: DT-01/R4, EP-02
Priority: Medium
Preconditions: None.
Action: A login request is sent carrying a string that is not a valid e-mail address and any password.
Expected: Not assertable — FR-02.1 requires HTTP 400 and "a field-level error list", and neither the ticket nor the OpenAPI document states the shape of that list, its container key or its field names.
Suggested Level: E2E API
Assigned Level: Requirement Gap
Level Rationale: The Expected: records a requirement gap rather than an outcome — no level has a truthful oracle for a response body nothing specifies.
Automation Suitability: Manual only
Notes: unknown: the shape of the FR-02.1 field-level error list — not assertable. The status alone could be asserted, but a validation scenario that checks only the status number asserts none of the behaviour the requirement is about.

## SCN-008: No response ever carries the stored password hash
Requirement: FR-02.3
Category: Data
Technique: Equivalence Partitioning
Coverage Item: EP-09, EP-10
Priority: High
Preconditions: The owner account exists.
Action: The user object is serialised for a login response.
Expected: The serialised object carries the documented fields only, and no password or password-hash field under any name.
Suggested Level: E2E API
Assigned Level: Unit
Level Rationale: Demoted. The projection that omits the hash lives in one function; a wide test proves it for the one route it walks and leaves every other caller unproven.
Automation Suitability: High
Notes: An absence assertion over a projection that lives in one function — a wide test would prove it for the one route it walks and nothing else.

## SCN-009: The issued token expires after the configured lifetime
Requirement: FR-02.4
Category: Boundary
Technique: Boundary Value Analysis (2-value)
Coverage Item: BV-02
Priority: Medium
Preconditions: The token lifetime is set to a known value.
Action: A token is issued for a successful login and its claims are decoded.
Expected: The difference between the expiry claim and the issued-at claim equals the configured lifetime, and a token one second past that expiry is refused while one a second before it is accepted.
Suggested Level: E2E API
Assigned Level: Unit
Level Rationale: Demoted. Signing and expiry are the token helper’s own arithmetic, and the boundary needs the lifetime controlled — which only the unit level can do cheaply.
Automation Suitability: High
Notes: The default lifetime is seven days, so this boundary can only be reached by controlling the configured value or the clock; it cannot be reached by waiting inside a test run.

## SCN-010: A successful login records the login timestamp on the user record
Requirement: FR-02.5
Category: Data
Technique: State Transition Testing
Coverage Item: ST-01/T1
Priority: Medium
Preconditions: The owner account exists and has a known previous login timestamp.
Action: A successful login is performed.
Expected: Not assertable — FR-02.5 states that the timestamp is recorded but names no observable for it, and the ticket does not say whether the authenticated-user route's lastLogin field is the intended oracle.
Suggested Level: E2E API
Assigned Level: Requirement Gap
Level Rationale: The Expected: records a requirement gap: FR-02.5 states the write and names no observable, so no level can assert it truthfully.
Automation Suitability: Manual only
Notes: unknown: the intended oracle for the FR-02.5 login timestamp — not assertable. The authenticated-user route documents a lastLogin field, which is the only documented way to read it, but nothing states that it is what FR-02.5 means.

## SCN-011: An empty password is refused exactly as a missing one is
Requirement: FR-02.1
Category: Boundary
Technique: Boundary Value Analysis (2-value)
Coverage Item: BV-01
Priority: Medium
Preconditions: The owner account exists.
Action: A login request is sent carrying the owner e-mail and a password of zero characters, and then one carrying a password of one character.
Expected: The empty password is refused as a validation failure, and the one-character password is refused as a credential failure — the two sides of the boundary take different paths, and neither returns a token.
Suggested Level: E2E API
Assigned Level: Integration
Level Rationale: Demoted. The two sides of the boundary are decided by validation and by credential comparison, both of which an integration test over the route reproduces.
Automation Suitability: High
Notes: The boundary separates "the field was not filled in" from "the field was filled in wrongly", which is the distinction FR-02.1 draws against FR-02.2.

## SCN-012: An Admin signing in is served the same contract with the admin role
Requirement: FR-02.3
Category: Permission / authorization
Technique: Equivalence Partitioning
Coverage Item: EP-08
Priority: Medium
Preconditions: An admin account exists.
Action: A login request is sent carrying the admin e-mail and its matching password.
Expected: Not assertable — the user story covers "an Admin or Owner", but no acceptance criterion names an Admin login and nothing states whether an Admin's response differs from an Owner's beyond the role value.
Suggested Level: E2E API
Assigned Level: Requirement Gap
Level Rationale: The Expected: records a requirement gap — no acceptance criterion states what an Admin login is supposed to produce.
Automation Suitability: Manual only
Notes: unknown: whether an Admin login has any observable difference from an Owner login — not assertable. The role value could be asserted, but that assertion would come from the surface rather than from a requirement.

## SCN-013: A failed login leaks no credential material
Requirement: FR-02.3
Category: Non-functional
Technique: Experience-based (error guessing)
Coverage Item: —
Priority: Medium
Preconditions: The owner account exists.
Action: A login request is sent with a wrong password while the server's output is observed.
Expected: Neither the submitted password nor the stored hash appears in the response body, the response headers or the server's log output.
Suggested Level: E2E API
Assigned Level: E2E API
Level Rationale: Log output and response headers are only observable against the running server — factor 1; it stays Manual only because the observation is a read, not an assertion.
Automation Suitability: Manual only
Notes: Experience-based because no requirement partitions this: the risk is that a debugging aid echoes the submitted credential, which is a mistake rather than a rule, and it is observed by reading the log output rather than by asserting on a documented field.
 
## SCN-014: A token minted by this login is accepted by the owner-only routes
Requirement: FR-02.4
Category: Integration
Technique: Equivalence Partitioning
Coverage Item: EP-07
Priority: High
Preconditions: The owner account exists.
Action: A token obtained from a successful owner login is presented to an owner-only route.
Expected: The route accepts the token and serves the owner-only response rather than refusing it as unauthenticated.
Suggested Level: Integration
Assigned Level: Integration
Level Rationale: Demoted. The question is whether the token helper and the auth middleware agree; an integration test over both answers it, and the owner-only routes already have their own E2E coverage.
Automation Suitability: High
Notes: This is what makes FR-02.4 worth anything — a token nothing downstream accepts is a signed string, not a session.

# Traceability Matrix

| Requirement | Scenarios |
|---|---|
| FR-02.1 | SCN-003, SCN-007, SCN-011 |
| FR-02.2 | SCN-002, SCN-005, SCN-006 |
| FR-02.3 | SCN-001, SCN-004, SCN-008, SCN-012, SCN-013 |
| FR-02.4 | SCN-009, SCN-014 |
| FR-02.5 | SCN-010 |
| AC-1 | SCN-004 |
| AC-2 | SCN-005 |

# Coverage Matrix

| Category | Scenarios |
|---|---|
| Happy path | SCN-001, SCN-004 |
| Negative path | SCN-002, SCN-005, SCN-006 |
| Boundary | SCN-009, SCN-011 |
| Validation rules | SCN-003, SCN-007 |
| Error handling | _Not applicable — the ticket states no server-side failure path; every refusal it names is a validation or a credential outcome._ |
| Permission / authorization | SCN-012 |
| Data | SCN-008, SCN-010 |
| Integration | SCN-014 |
| Retry / timeout | _Not applicable — login calls no external service and the ticket states no retry or timeout behaviour._ |
| State transition | _Not applicable — the session model is exercised through SCN-004 and SCN-005; no scenario walks the transitions as its own subject._ |
| Non-functional | SCN-013 |
| Regression impact | _Not applicable — SCN-014 covers the downstream effect of the token as an integration concern, and the ticket names no existing behaviour this change alters._ |

# Technique Coverage Matrix

| Technique | Coverage items | Exercised | Traced-only | Coverage | Uncovered |
|---|---|---|---|---|---|
| Equivalence Partitioning | 10 | 8 | 2 | 80% | — |
| Boundary Value Analysis | 2 | 2 | 0 | 100% | — |
| Decision Table Testing | 4 | 3 | 1 | 75% | — |
| State Transition Testing | 4 | 2 | 0 | 50% | ST-01/T3, ST-01/T4 |

# Coverage Gaps

- SCN-003 asserts a status range rather than a status code, because FR-02.1 names an empty password and not an absent one and no source states which of 400 or 401 an absent field takes. It exercises EP-06 and its assertion is truthful; what is missing is the precision, and answering the open question about the absent-field case is what sharpens it.
- SCN-007 is blocked by an unknown: FR-02.1 requires a field-level error list and no source states its shape. It traces FR-02.1 and asserts nothing, so DT-01/R4 and EP-02 are counted traced-only. Answering the open question about the 400 body's shape releases it.
- SCN-010 is blocked by an unknown: FR-02.5 states that a login timestamp is recorded but names no observable for it. It traces FR-02.5 and asserts nothing, so its citation of ST-01/T1 is traced-only. Confirming the authenticated-user route's lastLogin field as the intended oracle releases it.
- SCN-012 is blocked by an unknown: no acceptance criterion covers an Admin login, so EP-08 is cited but not exercised. An acceptance criterion naming the Admin response releases it.
- DT-01/R4 is traced-only. The invalid-e-mail rule is modelled and cited, but the only scenario citing it cannot assert its outcome.
- EP-02 is traced-only for the same reason: the syntactically invalid e-mail partition has a scenario and no oracle.
- EP-08 is traced-only: the admin-role partition has a scenario and no stated expectation.
- ST-01/T3, the signed-in to signed-out transition on logout, is uncovered here. Logout is specified by a different ticket and no requirement of SCRUM-99 states it.
- ST-01/T4, the signed-in to signed-out transition on token expiry, is uncovered. The default lifetime is seven days, so the transition cannot be reached inside a test run without controlling the configured lifetime or the clock, and FR-02.4 states neither.
- FR-02.4 and FR-02.5 carry no acceptance criterion of their own. Their scenarios are derived from the functional requirement text alone, which is why one of them (SCN-010) has no oracle.

# Approved Assumptions

_None._

# Test Basis Research

| Aspect | Findings | Feeds |
|---|---|---|
| Actors & roles | Owner, Admin, unauthenticated caller | EP-07, EP-08, DT-01 |
| Entities & states | Session: signed out -> signed in; user record carries a login timestamp | ST-01 |
| Inputs | email, password | EP-01..EP-06, BV-01 |
| Limits | password must not be empty (FR-02.1); token lifetime JWT_EXPIRES_IN, default 7 days (FR-02.4); no stated maximum password length | BV-01, BV-02 |
| Oracles | HTTP status; the message string "Invalid email or password"; token and user object shape; the redirect and the navigation bar after sign-in | Expected: |
| Permissions | login itself is unauthenticated; the token it mints is what the owner-only routes require | SCN-014, EP-07 |
| Dependencies | a user store holding a password hash, a server-side signing secret, the toast and navigation surfaces | SCN-008, SCN-009, SCN-004 |
| Data lifetime | the token outlives any test run at the default lifetime; the login timestamp is overwritten on every successful login | BV-02, SCN-010 |
| Domain terms | "Owner" and "Admin" are distinct roles; "invalid credentials" covers both an unknown e-mail and a wrong password | EP-03, EP-05, DT-01 |
| Unknowns | the shape of the FR-02.1 field-level error list; the intended oracle for the FR-02.5 timestamp; whether an Admin response differs | Coverage Gaps |

# Test Basis Analysis

_Black-box test techniques per ISTQB CTFL v4.0 §4.2. The coverage items below are cited by the `Coverage Item:` field of each scenario._

## Equivalence Partitions (§4.2.1)

| ID | Parameter | Partition | Valid / Invalid | Source |
|---|---|---|---|---|
| EP-01 | email | syntactically valid and registered | Valid | FR-02.3 |
| EP-02 | email | syntactically invalid | Invalid | FR-02.1 |
| EP-03 | email | syntactically valid, not registered | Invalid | FR-02.2 |
| EP-04 | password | matches the stored hash | Valid | FR-02.3 |
| EP-05 | password | non-empty, does not match | Invalid | FR-02.2 |
| EP-06 | password | absent or empty | Invalid | FR-02.1 |
| EP-07 | role of the authenticated user | owner | Valid | FR-02.3 |
| EP-08 | role of the authenticated user | admin | Valid | FR-02.3 |
| EP-09 | success response body | the documented fields only | Valid | FR-02.3 |
| EP-10 | success response body | carries the password hash | Invalid | FR-02.3 |

Coverage criterion: Each Choice.

## Boundary Values (§4.2.2)

| ID | Boundary | Partitions | Version | Values | Source |
|---|---|---|---|---|---|
| BV-01 | password length at the empty boundary | EP-06 / EP-05 | 2-value | 0, 1 | FR-02.1 |
| BV-02 | token validity at the configured lifetime | valid / expired | 2-value | lifetime - 1s, lifetime + 1s | FR-02.4 |

## Decision Tables (§4.2.3)

### DT-01: Login

| Condition / Action | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| E-mail is syntactically valid | T | T | T | F |
| An account exists for the e-mail | T | T | F | N/A |
| Password matches the stored hash | T | F | — | N/A |
| **200 with a token** | X | | | |
| **401 "Invalid email or password"** | | X | X | |
| **400 with a field-level error list** | | | | X |

Infeasible columns removed: a non-existent account cannot have a matching password, so the password condition is don't-care in R3. Merged columns: none. Rules: DT-01/R1 … DT-01/R4.

## State Transitions (§4.2.4)

### ST-01: Browser session

| State \ Event | login succeeds | login fails | logout | token expires |
|---|---|---|---|---|
| Signed out | Signed in (T1) | Signed out (T2) | invalid | invalid |
| Signed in | Signed in | Signed in | Signed out (T3) | Signed out (T4) |

Target criterion: all valid transitions. Valid: T1, T2, T3, T4.

# Level Assignment Summary

_Recounted from the `Assigned Level:` lines of the scenario blocks above._

| Level | Count | Scenarios |
|---|---|---|
| Unit | 2 | SCN-008, SCN-009 |
| Component | 0 | — |
| Integration | 3 | SCN-006, SCN-011, SCN-014 |
| E2E API | 4 | SCN-001, SCN-002, SCN-003, SCN-013 |
| E2E UI | 2 | SCN-004, SCN-005 |
| Requirement Gap | 3 | SCN-007, SCN-010, SCN-012 |

Scenarios: 14 total, 14 assigned, 0 unassigned.
Executable coverage: 11 scenario(s) at a testing level; 3 recorded as Requirement Gap and excluded from every E2E figure.
Multi-level scenarios: — none
Overridden suggestions: SCN-006 (E2E API -> Integration), SCN-007 (E2E API -> Requirement Gap), SCN-008 (E2E API -> Unit), SCN-009 (E2E API -> Unit), SCN-010 (E2E API -> Requirement Gap), SCN-011 (E2E API -> Integration), SCN-012 (E2E API -> Requirement Gap)
E2E tests implied: E2E API 4, E2E UI 2.
E2E journeys: one — sign in from the login page and land on the portal as a privileged user (SCN-004), with SCN-005 walking the same entry point to its failure exit.
Demoted by the minimum-set pass: SCN-006 and SCN-011 to Integration, SCN-008 and SCN-009 to Unit — each has an oracle a lower level reproduces in full.
Folded by the minimum-set pass: — none

## Handed Off As Follow-Up Work

Scenarios at levels not implemented in this repository. Kept here for traceability.

| Scenario | Assigned Level | Requirement |
|---|---|---|
| SCN-006 | Integration | FR-02.2 |
| SCN-008 | Unit | FR-02.3 |
| SCN-009 | Unit | FR-02.4 |
| SCN-011 | Integration | FR-02.1 |
| SCN-014 | Integration | FR-02.4 |

## Blocked / Requirement Gaps

Scenarios whose `Expected:` records a missing or unassertable oracle. Not automation work and not coverage at any level — the requirement has to be specified before a level applies.

| Scenario | Requirement | Expected |
|---|---|---|
| SCN-007 | FR-02.1 | Not assertable — FR-02.1 requires HTTP 400 and "a field-level error list", and neither the ticket nor the OpenAPI document states the shape of that list, its container key or its field names. |
| SCN-010 | FR-02.5 | Not assertable — FR-02.5 states that the timestamp is recorded but names no observable for it, and the ticket does not say whether the authenticated-user route's lastLogin field is the intended oracle. |
| SCN-012 | FR-02.3 | Not assertable — the user story covers "an Admin or Owner", but no acceptance criterion names an Admin login and nothing states whether an Admin's response differs from an Owner's beyond the role value. |