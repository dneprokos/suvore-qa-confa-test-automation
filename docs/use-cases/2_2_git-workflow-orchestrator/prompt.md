# Git workflow orchestrator — one skill that composes four others

`git-workflow-orchestrator` does no git work itself. It runs `git-branch-creator`, `git-commit-creator`,
`git-push-creator` and `git-pr-creator` as four sequential phases, reports SUCCESS / FAILED / SKIPPED per
phase, stops on the first failure, and prints the PR URL exactly as `gh` returned it.

```text
.claude/skills/
├── git-workflow-orchestrator/   SKILL.md + scripts/run-git-ship-workflow.ps1
├── git-branch-creator/          Phase 1 — branch from latest main/develop
├── git-commit-creator/          Phase 2 — staging prompt, message OK / Not OK
├── git-push-creator/            Phase 3 — push, refuses main/develop
└── git-pr-creator/              Phase 4 — gh pr create, ticket prefix in title
```

## A. Agent-driven — every confirmation kept

```text
/git-workflow-orchestrator ship my current changes: create branch docs/use-cases-git-orchestrator,
commit, push and open a PR. Show me the phase summary table at the end.
```

## B. Script-driven — dry run first, then one command

```text
/git-workflow-orchestrator use orchestrator script with -DryRun:
branch docs/use-cases-git-orchestrator,
commit message "docs(use-cases): add git workflow orchestrator demo",
stage only docs/use-cases/2_2_git-workflow-orchestrator/prompt.md
```

```text
Looks good — run it for real, with token reporting.
```

## What to point at

- Phase table after the run: one row per phase, the run stops at the first FAILED.
- `-PathspecFile` stages only the listed paths, so nothing else in the tree lands in the commit.
  Without it the script falls back to `git add -A`.
- `PR_URL:` comes from `gh` verbatim, the skill does not build it.
- `qa-ship-tests` calls this same skill at the end of `/qa-workflow`: that skill asks the user to
  confirm first, then runs the script without prompts.
