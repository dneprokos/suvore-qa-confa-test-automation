# Commit Message Guide

Use these rules when generating a commit message from git changes. The format follows the [Conventional Commits](https://www.conventionalcommits.org/) specification.

This file is the single source for commit message format. Everything that drafts a commit message —
`SKILL.md` step 3a, and any agent that proposes one — defers to it rather than carrying its own copy.
Change a rule here, never in a copy.

## Format

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Types

| Type | Purpose |
| ---- | ------- |
| `feat` | New feature or capability |
| `fix` | Bug fix or safety improvement |
| `docs` | Documentation changes only |
| `style` | Formatting, whitespace, or style (no logic change) |
| `refactor` | Code restructure without feature or bug-fix intent |
| `perf` | Performance improvement |
| `test` | Add, update, or fix tests |
| `build` | Build system or dependency changes |
| `ci` | CI pipeline or configuration changes |
| `chore` | Maintenance, housekeeping, or tooling |
| `revert` | Revert a previous commit |

## Optional scope

Add a module or area name in parentheses after the type to narrow context:

```text
feat(auth): add JWT refresh endpoint
fix(parser): handle empty input gracefully
docs(readme): update installation steps
test(SCRUM-139): automate admin creation
```

A ticket key is a valid scope when the caller supplied one, or when the branch name carries it. Omit the
scope rather than invent one.

## Subject line rules

- Use **imperative mood**: `add`, `fix`, `update`, `remove`, `refactor` — not `added`, `fixes`.
- Describe the **actual change**, not vague intent.
- Keep the subject under **72 characters**.
- No period at the end.

## Body (optional)

Add a blank line after the subject, then prose or bullets for context. Use when the diff is large or when the reason for the change matters:

```text
feat: add git commit creator skill

- prompt whether to stage all files
- collect git status and staged diff summary
- create a commit on the active branch
```

## Breaking changes

Mark a breaking change only when the diff shows a **removed or renamed public surface** — never on a
guess. Use `!` after the type/scope, or a `BREAKING CHANGE` footer, or both:

```text
feat!: remove deprecated /v1/users endpoint

feat(api): change response envelope shape

BREAKING CHANGE: `data` field renamed to `result`
```

## Footer / issue references

Reference related issues in the footer:

```text
fix: handle null pointer in session handler

Closes #123
Refs #456
```

Common keywords: `Closes`, `Fixes`, `Resolves`, `Refs`.

Add a footer only when the issue number actually appears — in the caller's context, or in the branch
name. Never invent one.

## Secrets warning

Never commit files that contain secrets (`.env`, `credentials.json`, private keys, API tokens). If staged files contain secrets, warn the user and stop.

## Good examples

```text
feat: add branch creation skill
feat(auth): implement OAuth2 login flow
fix: handle missing branch name safely
fix(parser): prevent crash on empty input
docs: refresh README skill list
style: normalise indentation in helper scripts
refactor: simplify git diff summary output
perf: cache token resolution on repeated calls
test: add coverage for empty staged changes
build: upgrade PowerShell module dependencies
ci: add lint step to PR workflow
chore: remove unused script fragments
revert: revert "feat: remove legacy endpoint"
```

## Avoid

```text
update
changes
misc fixes
various
work in progress
stuff
fixed bug
```
