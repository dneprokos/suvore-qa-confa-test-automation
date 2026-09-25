# Playwright bulk upgrade — one pull request per repository

```text
Goal: bring every one of my GitHub repositories that uses Playwright up to the
latest stable Playwright version, one pull request per repository.

Context
  - GitHub account: dneprokos. Use the gh CLI; it is already authenticated.
  - Scope: my own repositories only. Skip forks and archived repositories.
  - Playwright means the npm packages @playwright/test and playwright.
    If a repository uses Playwright for Python, Java or .NET, list it in the
    report but do not change it.

Step 1 - Find the target version
  Run `npm view @playwright/test version`. That number is LATEST.
  Stable releases only: no -alpha, -beta or -next.

Step 2 - Find the outdated repositories
  For each repository, read package.json on the default branch over the
  GitHub API. Do not clone anything yet.
  A repository is outdated when the installed Playwright version is lower
  than LATEST. Read the lockfile if there is one; otherwise use the
  package.json range.
  Skip a repository that already has an open pull request bumping Playwright.

  Then STOP and show me a table:
    | Repository | Current version | LATEST | Action |
  Wait for my OK before you change anything. A pull request is visible to
  other people, so I approve the list first.

Step 3 - Update in parallel
  Spawn one agent per approved repository, all in one message, so they run
  in parallel. Each agent works in its own temporary folder and touches only
  its own repository.

  Each agent:
    1. Clones the repository and creates the branch chore/playwright-<LATEST>.
    2. Updates the dependency with the repository's own package manager
       (npm, pnpm or yarn), so the lockfile is regenerated.
    3. Runs `npx playwright install` and then `npx playwright test --list`.
       If the project has a typecheck script, it runs that too. Do not run the
       whole suite: most of these projects need an application that is not
       running here.
    4. Ships the change by reading and following
       .claude/skills/git-workflow-orchestrator/SKILL.md, script-driven
       mode (section B):
         - commit message: chore(deps): bump Playwright <old> -> <LATEST>
         - -PathspecFile listing only package.json and the lockfile
         - pull request body: old version, new version, and the output of
           the checks from step 3
    5. Returns exactly one line:
         <repository> | SUCCESS | <PR URL>
         <repository> | FAILED  | <phase> - <reason in one sentence>

  Rules for every agent:
    - Never push to main or master, and never force-push.
    - If a check fails, do not open the pull request. Report FAILED.
      Do not edit tests to make them pass.
    - Change no files other than package.json and the lockfile.

Step 4 - Report
  When every agent has finished, show one table:
    | Repository | Old -> New | Status | Pull request |
  List every pull request link. Then list the skipped repositories and why
  each was skipped: already up to date, open PR exists, fork or archived,
  or not an npm project.
```
