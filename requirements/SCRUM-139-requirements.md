---
ticket: SCRUM-139
ticket_url: https://dneprokos-test.atlassian.net/browse/SCRUM-139
issue_type: Story
parent_epic: SCRUM-94 — [F-11] Admin User Management & Portal Statistics (Owner Panel)
jira_status_before: To Do
jira_status_after: To Do (unchanged — document regenerated outside a qa-requirements-collector run)
retrieved_at: 2026-08-01T16:59:12Z
generated_by: qa-requirements-collector
acceptance_criteria_count: 1
functional_requirement_count: 4
retrieval_gaps: none
---

# Ticket Summary

**SCRUM-139** — List and create admin accounts
Type: Story | Priority: Low | Status: To Do | Labels: backend, f-11, retro-portal
Reporter: Kostiantyn Teltov | Assignee: Unassigned
Created: 2026-08-01T12:03:36+0200 | Updated: 2026-08-01T12:03:36+0200
Parent Epic: SCRUM-94 — [F-11] Admin User Management & Portal Statistics (Owner Panel)

# Original Description

_Verbatim from Jira. No derived content._

```text
_User Story:_ As the Owner, I want to see all existing Admin accounts and provision new ones, so that I can staff the portal's editorial team.

_Scope / Functional Requirements:_

* FR-11.1 The system shall provide an Owner-only operation listing all Admin accounts, most recently created first, excluding password data.
* FR-11.2 The system shall provide an Owner-only operation creating an Admin account from `email`, `password` and `confirmPassword`, returning HTTP 201.
* FR-11.3 The system shall reject Admin creation with HTTP 400 when the e-mail is malformed, the password is shorter than 6 characters, or the confirmation does not match ("Passwords must match").
* FR-11.4 The system shall reject Admin creation with HTTP 400 "User with this email already exists" when the address is already registered in any role.

_Acceptance Criteria:_

* Given the Add New Admin form with a valid e-mail, a 6+ character password and a matching confirmation, When it is submitted, Then a success toast appears, the form closes and the new Admin appears in the list with role badge "ADMIN" and last login "Never".

_Traceability:_ F-11, FR-11.1, FR-11.2, FR-11.3, FR-11.4
```

# Acceptance Criteria

_Verbatim from Jira. No derived content._

## Functional Requirements (stated)

### FR-11.1
The system shall provide an Owner-only operation listing all Admin accounts, most recently created first, excluding password data.

### FR-11.2
The system shall provide an Owner-only operation creating an Admin account from `email`, `password` and `confirmPassword`, returning HTTP 201.

### FR-11.3
The system shall reject Admin creation with HTTP 400 when the e-mail is malformed, the password is shorter than 6 characters, or the confirmation does not match ("Passwords must match").

### FR-11.4
The system shall reject Admin creation with HTTP 400 "User with this email already exists" when the address is already registered in any role.

## Acceptance Criteria (stated)

### AC-1

Verbatim: Given the Add New Admin form with a valid e-mail, a 6+ character password and a matching confirmation, When it is submitted, Then a success toast appears, the form closes and the new Admin appears in the list with role badge "ADMIN" and last login "Never".

- **Given** the Add New Admin form with a valid e-mail, a 6+ character password and a matching confirmation,
- **When** it is submitted,
- **Then** a success toast appears, the form closes and the new Admin appears in the list with role badge "ADMIN" and last login "Never".

Traceability: F-11, FR-11.1, FR-11.2, FR-11.3, FR-11.4

# Subtasks

None.

# Linked Issues

None.

# Dependencies

_Inferred by qa-requirements-collector. Not stated in the Jira ticket._

- (derived) An existing user/authentication system with a role concept that includes an `ADMIN` role — from: FR-11.1 "listing all Admin accounts" and the AC's role badge "ADMIN".
- (derived) An Owner-only authorization check enforceable on both the list and the create operation — from: FR-11.1 and FR-11.2 "Owner-only operation".
- (derived) A cross-role user store that can be queried for an e-mail address regardless of role — from: FR-11.4 "already registered in any role".
- (derived) A login-tracking mechanism capable of representing "no login yet" — from: the AC's last login "Never".
- (derived) A client-side toast/notification mechanism in the Owner Panel — from: the AC's "a success toast appears".

# Affected Components

_Inferred by qa-requirements-collector. Not stated in the Jira ticket._

- (derived) Backend — Admin account list operation — from: FR-11.1.
- (derived) Backend — Admin account create operation — from: FR-11.2.
- (derived) Backend — user/auth service, for cross-role e-mail uniqueness — from: FR-11.4.
- (derived) Backend — input validation for e-mail format, password length and confirmation match — from: FR-11.3.
- (derived) Frontend — Owner Panel Admin accounts list view — from: FR-11.1 and the AC's "appears in the list".
- (derived) Frontend — "Add New Admin" form — from: the AC's "the Add New Admin form".

# Testing-Relevant Information

- (stated) The list operation is Owner-only — FR-11.1.
- (stated) The list operation returns Admin accounts most recently created first — FR-11.1.
- (stated) The list operation excludes password data from the response — FR-11.1.
- (stated) The create operation is Owner-only — FR-11.2.
- (stated) The create operation takes `email`, `password` and `confirmPassword` — FR-11.2.
- (stated) A successful create returns HTTP 201 — FR-11.2.
- (stated) A malformed e-mail is rejected with HTTP 400 — FR-11.3.
- (stated) A password shorter than 6 characters is rejected with HTTP 400 — FR-11.3.
- (stated) A non-matching confirmation is rejected with HTTP 400 and the message "Passwords must match" — FR-11.3.
- (stated) An e-mail already registered in any role is rejected with HTTP 400 and the message "User with this email already exists" — FR-11.4.
- (stated) On UI success: a success toast appears, the form closes, and the new Admin appears in the list with role badge "ADMIN" and last login "Never" — AC-1.
- (derived) The exact error message strings for the malformed-e-mail and short-password cases are not given; only the "Passwords must match" and "User with this email already exists" strings are stated — from: FR-11.3, FR-11.4.

# Known Constraints

- (stated) Password minimum length is 6 characters — FR-11.3.
- (stated) E-mail uniqueness is checked across all roles, not only within the Admin role — FR-11.4.
- (stated) Both the list and the create operation are restricted to the Owner role — FR-11.1, FR-11.2.
- (derived) No maximum password length and no password complexity rule are stated — from: FR-11.3 stating only a minimum.
- (derived) No pagination, page size, or result cap is stated for the list operation — from: FR-11.1 "listing all Admin accounts".
- (derived) The response shape of the list operation is unspecified beyond the exclusion of password data — from: FR-11.1.

# Existing Open Questions

- (stated) None recorded in the ticket description or comments — the ticket has zero comments.
- (derived) FR-11.1, FR-11.2, FR-11.3 and FR-11.4 are all backend behaviors, but the single acceptance criterion covers only the UI success path. FR-11.1, FR-11.3 and FR-11.4 have no covering acceptance criterion.
- (derived) The e-mail format validation rule is unspecified — FR-11.3 says "malformed" without defining the rule.
- (derived) No maximum password length or complexity requirement is stated — FR-11.3.
- (derived) The tie-break for "most recently created first" when two Admin accounts share a creation timestamp is unspecified — FR-11.1.
- (derived) Whether the create operation returns the created account body, and which fields it contains, is unspecified — FR-11.2.
