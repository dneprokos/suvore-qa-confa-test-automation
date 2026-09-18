# Output template

Read at step 3 of the skill. The format is fixed so the result pastes straight into
a test-management tool or a spec file's comments.

## Table

```
| ID | Type | Given | When | Then | AC |
|----|------|-------|------|------|----|
```

- `ID` — `TC-01`, `TC-02`, … two digits, no gaps, in AC order.
- `Type` — exactly one of `Positive`, `Negative`, `Boundary`.
- `Given` — the state before the action: who is logged in, what data exists.
- `When` — one action, with the concrete input values used.
- `Then` — the observable result. Only what the story states; an unknown part
  reads `see Q<n>`.
- `AC` — the criterion id(s) the case covers.

Example row:

```
| TC-03 | Boundary | Owner is logged in | Adds an admin with a 7-character password | Admin is not created | AC-3 |
```

## Coverage line

One line, every criterion listed, `✓` when at least one case cites it:

```
Coverage: AC-1 ✓ · AC-2 ✓ · AC-3 ✓ · AC-4 ✓
```

## Open questions

```
OPEN QUESTIONS
Q1. <what the story does not say> — affects TC-05, TC-06
```

Write `OPEN QUESTIONS: none` when there are none. Never drop the heading.
