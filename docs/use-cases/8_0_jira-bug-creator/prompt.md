# Jira bug creator — scripts draft, human approves, model files

`/jira-bug-creator` files a bug in SCRUM from one of three sources. The scripts parse, validate and render;
they hold no credentials. The only Jira write is an MCP call the model makes **after** you approve the
preview.

```text
draft-bug.js  →  duplicate check (MCP)  →  preview + your OK  →  createJiraIssue (MCP)  →  render-created.js
```

## A. From a failed Playwright test

Make one test fail on purpose (or use a real red run), then:

```text
/jira-bug-creator file a bug for the failing test in test-results/results.json.
The run was against http://localhost:9000.
```

Offline variant, no app needed: list the failures in the sample report used by `4_2_build-sub-agent`.

```text
/jira-bug-creator list the failed tests in docs/use-cases/4_2_build-sub-agent/playwright-report.json
and draft a bug for the checkout one. Stop at the preview: do not create anything.
```

## B. From a plain description — watch it ask instead of guess

```text
/jira-bug-creator the game details page shows "undefined" as the release year for some games.
```

The script exits `2` with a `MISSING` block (steps, expected, actual…). The model asks you for each one
instead of inventing a reproduction.

## C. A duplicate

Run B again with the same summary. The duplicate check finds the ticket from the first run and asks:
**create anyway**, **comment on the existing issue**, or **abort**.

## What to point at

- **The preview.** Summary, phase, priority, labels and full description — nothing is filed before your yes.
- **`INFERRED` fields.** Values the script assumed (for example the Defect Detection Phase from
  `localhost` = `Development`) are printed for you to correct, not hidden.
- **Exit codes as a contract:** `0` ready · `2` missing or invalid · `1` input unreadable.
- **No secret in any script.** Authentication is the MCP server's job, so nothing here can leak a token.
- The draft lives in `.jira-bug/draft.json` (gitignored). `--draft` reloads it for another round.
