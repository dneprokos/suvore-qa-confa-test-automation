---
name: readme-polisher
description: >-
  Create or improve a repository README using verified project details. Use this
  skill when the user asks to polish a repo, add badges, explain setup, improve
  first impressions, or generate a concise project overview with optional
  diagrams. Prefer accurate, evidence-based documentation and skip anything you
  cannot confirm from the codebase.
argument-hint: "project path or repo context"
---

# README Polisher

Build a README that is clear, practical, and tailored to the repository.

## When this skill fits

Use it for requests like:

- "improve my README"
- "make this repo look more professional"
- "add badges and quick start steps"
- "generate a README for this project"

Do **not** use it for:

- API reference generation
- changelog writing
- release notes
- CI/CD setup

## Workflow

### 1. Inspect the project first

Gather facts from files such as `README.md`, `package.json`, `pyproject.toml`,
`Cargo.toml`, `go.mod`, `.github/workflows/*`, `.env.example`, and license files.

If shell access is available, run the scan script bundled with this skill. Its
path is `scripts/scan_project.ps1` relative to this `SKILL.md` — in a Claude
Code project that is usually `.claude/skills/readme-polisher/scripts/scan_project.ps1`:

```powershell
pwsh -NoProfile -File <skill-dir>/scripts/scan_project.ps1 <project-path>
```

Without PowerShell 7, use Windows PowerShell instead:
`powershell -NoProfile -ExecutionPolicy Bypass -File <skill-dir>/scripts/scan_project.ps1 <project-path>`.
If neither is available, collect the same facts by reading the files above.

The scan returns JSON. Use it as a starting point, then check the important details:

- `topLevelDirs` / `topLevelFiles` already leave out anything git ignores, and
  every real `.env*` file (only `.env.example`/`.sample`/`.template` are listed).
  Build the Project Map from them, never from a raw directory listing.
- `license.manifestOnly: true` means a manifest declares a license but there is
  no LICENSE file. `npm init` writes `ISC` by default, so the value may not be a
  real choice. Do not write a License section or badge from it. Ask the user,
  or say in one line that no license file exists.
- `github.owner` / `github.repo` come from the `origin` remote. When they are
  empty, or `github.isGitRoot` is `false` (the project is a sub-folder of a
  larger repository), leave out every GitHub badge.
- `envExample.keys` lists configuration variable **names** from the committed
  example file. Use them for the Configuration section.

### 1b. Read the existing README

If `README.md` exists, read it in full before drafting. List what it contains
that a template would lose: setup caveats, env notes, links, credits, badges
that are already verified. That list is kept. You are polishing this README,
not replacing it, unless the user asks for a rewrite.

### 2. Load the writing guidance

Read `references/readme-guidelines.md` before drafting. It covers section order,
tone, proportionality, and common documentation mistakes.

### 3. Start from the template

Use `assets/readme-template.md` as a scaffold for structure. Merge the list from
step 1b into it. Replace every placeholder with real information. Remove any
section that does not help this project.

### 4. Add only verifiable badges

Check `assets/badges.json` for badge patterns. Include badges only when the
underlying metadata exists. No fake versions, broken build badges, or guessed
social links.

- `{{OWNER}}` / `{{REPO}}` come only from the scan's `github` field, never from
  the folder name or a guess.
- Shields.io GitHub badges show "repo not found" on private repositories. If
  `gh` is available, check with `gh repo view <owner>/<repo> --json visibility`.
  If the repo is private, or visibility cannot be confirmed, skip the GitHub
  badges (license, stars, workflow) and say so.

### 5. Keep it proportional

- Small utility: short overview + usage is enough
- Library: install, example, and API entry points
- App/service: setup, configuration, and run steps
- Monorepo: explain packages and add a diagram only if it helps

### 6. Validate before finishing

Confirm that:

- commands are real
- no placeholders remain
- section titles are relevant
- links resolve or are clearly marked as local
- tone matches the project rather than sounding generic

### 7. Optional diagram

If the repo has multiple moving parts, adapt a Mermaid starter from
`assets/diagram-ideas.md`. Skip diagrams for simple repos.

### 8. Show the change before writing

When `README.md` already exists, do not overwrite it silently. Show the user a
summary of what changes: sections added, removed and rewritten, and the
existing content kept from step 1b. Write the file after the user confirms.
A new README for a repository that has none can be written directly.

## Hard rules

- Never invent package names, releases, CI status, or contact links
- Never read `.env` or any other file that holds real credentials. Document
  configuration from `.env.example` (or the config schema) by **variable name
  only**. Never copy a value, including example-looking ones, for any key whose
  name suggests a secret (`*PASSWORD*`, `*TOKEN*`, `*SECRET*`, `*KEY*`).
- Prefer concise and useful wording over hype
- Preserve important existing instructions if the current README already has them
- If details are missing, say less instead of guessing
