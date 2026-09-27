# Direct vs indirect prompts

A model does what the prompt says, not what it hints at. A polite, indirect prompt
("I would like to know…", "Could you maybe…", "It would be nice if…") leaves out the
action, the scope and what "done" means, so the model has to guess all three. Often it
guesses "explain" when you meant "change the code".

A direct prompt says **what to do, where, with what constraints, and what to return**.
It is not rude. It is just specific.

---

## Example 1 — write a test

### ❌ Indirect (do not use)

```text
Hi! I would like to know if it's possible to maybe add some tests for the admin
creation feature? It would be great if they followed our style, if that's not
too much trouble. Thanks a lot!
```

What goes wrong:

- **"I would like to know if it's possible"** is a yes/no question. A literal answer is "Yes."
- **"some tests"**: how many, API or UI, which cases?
- **"our style"**: which file defines it?
- **No done criteria**: nothing says whether the tests must run, or pass.

### ✅ Direct (use this)

```text
Add API tests for POST /api/admin in tests/api/admin-create.spec.ts.

Cases:
1. Owner creates an admin with a valid email and matching passwords → 201.
2. Duplicate email → 409.
3. Password confirmation mismatch → 400.
4. No bearer token → 401.

Follow docs/automation/etalons/api-spec-etalon.md (# Core).
Import test/expect from @fixtures/api-fixture. Use the builder in // Act.
Push every created email to createdAdminEmails for cleanup.

Done when `npm run test:api` and `npm run typecheck` both pass.
Return the file path and the run summary.
```

---

## Example 2 — investigate a failure

### ❌ Indirect (do not use)

```text
I would like to know why the owner test is failing sometimes, if you have a moment
could you perhaps take a look?
```

### ✅ Direct (use this)

```text
tests/ui/owner.spec.ts › "add a new admin" fails about 1 run in 5 with
"locator.click: Timeout 30000ms exceeded".

Find the root cause. Do not add waitForTimeout or retries.
Run the test 10 times with --repeat-each=10 to confirm the fix.
Report the cause (file:line), the fix, and the 10-run result.
```

---

## Example 3 — ask for a review

### ❌ Indirect (do not use)

```text
I would like to know what you think about my changes, any feedback would be appreciated.
```

### ✅ Direct (use this)

```text
Review the uncommitted diff in pages/ and tests/ui/.
Check only: assertions inside page objects, fixed waits, and locators outside the
tier ladder in docs/automation/etalons/ui-spec-etalon.md.
Output one line per finding: file:line — problem — fix. No praise, no summary.
```

---

## Checklist for a direct prompt

| Element | Indirect prompt | Direct prompt |
|---|---|---|
| **Action** | "I would like to know…" | Imperative verb: *Add*, *Fix*, *Review*, *Explain* |
| **Target** | "the admin feature" | Exact file, route or test title |
| **Scope** | "some tests" | Listed cases, or a limit ("only X") |
| **Constraints** | "follow our style" | The file that defines the style, plus the hard bans |
| **Done criteria** | none | The command that must pass |
| **Output** | none | The shape of the answer: table, file list, one line per finding |

## Phrases to replace

| Instead of | Write |
|---|---|
| I would like to know if you could… | *Do X.* |
| Could you maybe take a look at… | *Find the cause of X in `<file>`.* |
| It would be nice if… | *Add / change X.* |
| If it's not too much trouble… | *(remove it)* |
| Any feedback would be appreciated | *Review X for A, B, C. Output format: …* |
| Something like… / kind of… | The exact value, name or path |

> Politeness costs nothing, but vagueness does. "Please" is fine. What causes trouble
> is a question standing in for an instruction, and a prompt with no finish line.
