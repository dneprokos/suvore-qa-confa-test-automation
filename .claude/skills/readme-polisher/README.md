# README Polisher

A skill (Claude Code, also usable from Copilot/Cursor skill folders) for drafting or refreshing project `README.md` files from real repository evidence.

## What it does

- inspects the repo for package managers, scripts, licenses, and CI clues
- suggests a practical README structure instead of a one-size-fits-all wall of text
- adds badges only when the underlying metadata is present
- keeps small projects short and complex projects organized
- can add a simple Mermaid diagram when the architecture is worth explaining

## Folder Layout

```text
<skills-dir>/readme-polisher/          # e.g. .claude/skills/
├── SKILL.md
├── README.md
├── assets/
│   ├── badges.json
│   ├── diagram-ideas.md
│   └── readme-template.md
├── evals/
│   ├── evals.json
│   ├── trigger-evals.json   # should/should-not trigger queries for the description
│   └── files/               # fixture repositories the evals run against
├── references/
│   └── readme-guidelines.md
└── scripts/
    └── scan_project.ps1
```

## Suggested prompt

```text
Improve the README for this project using the readme-polisher skill. Inspect the repo first, keep the output accurate, and do not invent badges or setup steps.
```

## Notes

- The bundled scan script runs on PowerShell 7 (`pwsh`) or Windows PowerShell 5.1. It skips git-ignored files, reads the GitHub owner/repo from `origin`, and reads only variable names from `.env.example`.
- The template is meant to be adapted, not pasted blindly.
- `evals/evals.json` follows the skill-creator schema. Each eval points at a fixture repo under `evals/files/`.
