| ID | Type | Given | When | Then | AC |
|----|------|-------|------|------|----|
| TC-01 | Positive | Owner is logged in; `new.admin@test.com` does not exist | Adds an admin with email `new.admin@test.com`, password `Passw0rd!`, confirmation `Passw0rd!` | Admin `new.admin@test.com` is created | AC-1 |
| TC-02 | Negative | Owner is logged in; admin `existing@test.com` exists | Adds an admin with email `existing@test.com`, password `Passw0rd!`, confirmation `Passw0rd!` | No second admin is created; an error is shown (see Q1) | AC-2, AC-5 |
| TC-03 | Boundary | Owner is logged in | Adds an admin with a 7-character password `Passw0r` and matching confirmation | Admin is not created; an error is shown (see Q1) | AC-3, AC-5 |
| TC-04 | Boundary | Owner is logged in | Adds an admin with an 8-character password `Passw0rd` and matching confirmation | Admin is created | AC-3 |
| TC-05 | Boundary | Owner is logged in | Adds an admin with a 9-character password `Passw0rd!` and matching confirmation | Admin is created | AC-3 |
| TC-06 | Negative | Owner is logged in | Adds an admin with password `Passw0rd!` and confirmation `Passw0rd?` | Admin is not created; an error is shown (see Q1) | AC-4, AC-5 |
| TC-07 | Negative | Owner is logged in | Adds an admin with an empty email, password `Passw0rd!`, confirmation `Passw0rd!` | Admin is not created (see Q2) | AC-1, AC-5 |
| TC-08 | Negative | An admin (not the owner) is logged in | Tries to add an admin with valid data | Admin is not created (see Q3) | AC-6 |
| TC-09 | Negative | No user is logged in | Tries to add an admin with valid data | Admin is not created (see Q3) | AC-6 |

Coverage: AC-1 ✓ · AC-2 ✓ · AC-3 ✓ · AC-4 ✓ · AC-5 ✓ · AC-6 ✓

OPEN QUESTIONS
Q1. AC-5 says "a clear error is shown" but gives no text, placement or per-field rule — what exactly should each error say, and where? — affects TC-02, TC-03, TC-06
Q2. AC-1 does not say whether the email format is validated (e.g. `not-an-email`) or whether an empty field is blocked in the form or rejected by the server — affects TC-07
Q3. AC-6 does not say what a non-owner sees: the option hidden, an error, or a redirect — affects TC-08, TC-09
