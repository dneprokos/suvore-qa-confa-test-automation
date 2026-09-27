# A prompt is a spec — context, goal, limits, output

The model cannot see your repo, your ticket or your intent. Only your words. A vague prompt is a vague
spec, and the model fills every gap by guessing. The recipe is the one you already use for a good bug
report:

| Part | Answers | Bug report equivalent |
|---|---|---|
| **Context** | What is this, where does it fail, what do we already know? | Environment, preconditions |
| **Goal** | What must be true when you are done? | Expected result |
| **Limits** | What must not change, how big may the change be? | Scope, affected components |
| **Output** | What exactly do you hand back? | Attachments |

---

## Example 1 — a flaky test

### ❌ Weak (do not use)

```text
fix it
```

```text
the login test does not work
```

No context, no criteria. The model will pick a test, guess a cause, and change whatever makes the red
go away. Often that means a longer timeout or a weaker assertion.

### ✅ Strong — same request, specified

```text
CONTEXT
tests/ui/login.spec.ts > "Login as owner - Should be able to login with valid credentials" passes locally in Chromium and fails only on Firefox in CI.
The failure is a timeout on the first assertion after the login click.

GOAL
Find why the assertion times out on Firefox and propose a fix.

LIMITS
- Do not touch fixtures/ or playwright.config.ts.
- No waitForTimeout, no networkidle, no longer timeout.
- Keep the change under 20 lines.

OUTPUT
A diff, plus one line naming the root cause.
```

---

## Example 2 — "take a look"

### ❌ Weak

```text
can you take a look at the search tests and make them better
```

### ✅ Strong

```text
CONTEXT
tests/ui/search-games.spec.ts was written before docs/automation/etalons/ui-spec-etalon.md existed.

GOAL
Review it against the etalon's # Core: locator tiers, web-first assertions, meaningful assertions,
cleanup. Report only; do not edit.

LIMITS
Cite each finding by file:line. Skip formatting nits. At most 10 findings, most severe first.

OUTPUT
A table: line · rule broken · why it matters · suggested fix. Then one line: keep, fix or rewrite.
```

---

## Checklist

- [ ] Could a new colleague do the task from this prompt alone, without asking a question?
- [ ] Does it name the file, the test, the endpoint? Not "the test".
- [ ] Is "done" a command that passes, or a shape you can check?
- [ ] Does it say what must **not** change?
- [ ] Does it say what to return?

> The four parts are the same whether the reader is a model or a person. The difference is that a
> person asks when something is missing, and the model guesses.

See also: `direct-vs-indirect-prompts.md` (say it as an instruction), `code-examples-in-prompts.md`
(show the shape), `structured-data-in-prompts.md` (separate instructions from data).
