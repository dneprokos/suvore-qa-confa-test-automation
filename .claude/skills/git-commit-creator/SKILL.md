---
name: git-commit-creator
description: >-
  Create a commit on the current Git branch from the collected repository changes.
  Use when the user asks to commit the current branch, save current work, or
  generate a commit message from git diff output. Prompt whether to stage all
  unstaged files before collecting the changes. Confirm the proposed commit
  message with the user before creating the commit.
argument-hint: "optional commit context or preferred commit style"
---

# Git Commit Creator

Create a commit for the current branch using the actual git changes.

## When this skill fits

Use it for requests like:

- "commit the current branch"
- "create a commit for my current changes"
- "write a commit message and commit the work"

Do **not** use it for:

- pushing to remote
- amending or rewriting commit history
- squashing or rebasing commits

## Workflow

### 1. Prompt about staging

Ask the user this question first:

```text
Do you want to stage all unstaged files before creating the commit?
```

Offer exactly these two options:

- `Yes` — stage all unstaged files
- `No` — keep the current staged set and continue

If the ask-questions tool is available, use it.

### 2. Collect git changes

After the staging choice is known, collect the current git state from the active repository.

#### 2a. Preferred, when a subagent runner is available

Delegate to the **`git-change-analyst`** agent instead of running the preview script on this thread. It
reads `git status` and the diff in its own context and returns the branch, the file lists, a secret
warning and one proposed Conventional Commits message — so the diff never enters this conversation.

| Parameter | Value |
|---|---|
| `staged_only` | `true` when the user chose **No** at step 1; `false` when they chose **Yes**, because stage-all has not run yet and the whole working tree is what will be committed |
| `context` | the user's commit context, when they supplied any |

Map its `GIT_CHANGE_ANALYST_RESULT` onto this workflow:

- `NO_CHANGES` — stop and return `No staged changes are available to commit.`
- `SECRETS_DETECTED` — warn the user, naming the paths it listed, and stop. Do not commit.
- `OK` — take its `PROPOSED_COMMIT_MESSAGE` as the draft, skip **3a**, and go to **3b**. The rules in
  3a still govern: if the proposal breaks one of them, rewrite it before showing it to the user.

The confirmation in **3b** is unchanged and still mandatory. The agent proposes; only the user approves.

#### 2b. Otherwise

In a runner with no subagents (Copilot, Cursor), use the helper script in preview mode:

```powershell
pwsh -NoProfile -File ./.claude/skills/git-commit-creator/scripts/create-commit.ps1 [-StageAll] -PreviewOnly
```

This previews:

- the current branch name
- `git status --short`
- staged file names
- staged diff summary

If there are no staged changes after the chosen flow, stop and return:

```text
No staged changes are available to commit.
```

### 3. Draft, show, and confirm the commit message

#### 3a. Draft

Skip this when step **2a** already returned a proposed message; go straight to 3b with it.

Produce **one** proposed commit message based only on the collected git changes.

Read [`references/commit-message-guidelines.md`](references/commit-message-guidelines.md) and follow it.
That file is the single source for the format, the type table, scope, breaking changes, footers and the
subject-line rules — do not restate its rules here, and do not draft from memory when it is available.

If it cannot be read, fall back to: `<type>[(scope)]: <description>`, type one of `feat` `fix` `docs`
`style` `refactor` `perf` `test` `build` `ci` `chore` `revert`, subject in the imperative under 72
characters describing **what changed**, never `update` / `changes` / `misc fixes` / `stuff` / `various`.
Add a bullet body only when the diff is large or the reason is not visible in the subject.

Never propose a commit that includes secrets (`.env`, `credentials.json`, private keys); warn the user and stop.

#### 3b. Show and confirm

Display the proposed message prominently: use a short label, then a single fenced block containing only the message (no nested fences), for example:

**Proposed commit message**

```text
<proposed-message>
```

Then ask:

```text
Is this commit message OK to use?
```

Offer exactly these two options:

- `OK` — use the proposed message
- `Not OK` — I will provide my own message

If the ask-questions tool is available, use it.

#### 3c. Branch on the answer

- If **OK** — go to **step 4** using `<proposed-message>` as the final message.
- If **Not OK** — tell the user to send their **exact** commit message in their next reply (one line subject, or subject plus body if they prefer). Do **not** create the commit until they provide it. After they send it, use **that** text as the final message for **step 4**. Do not invent or alter their wording unless they ask you to edit it.

### 4. Create the commit

Run the helper script with the **final** message (proposed after OK, or user-supplied after Not OK):

```powershell
pwsh -NoProfile -File ./.claude/skills/git-commit-creator/scripts/create-commit.ps1 [-StageAll] -CommitMessage "<final-message>"
```

Return the exact git result after the commit command completes.

## Hard rules

- Never invent changed files or behaviors.
- Do not commit if there are no staged changes.
- Do not amend, force-push, or rewrite history unless explicitly requested.
- Build the commit message from the real diff, not from assumptions.
- Keep the message clear and professional.
- Do not create the commit until the user chooses **OK** for the proposed message, or **explicitly supplies** their own message after **Not OK**.
- Never update the git config.
- Never skip hooks (`--no-verify`) unless the user explicitly asks.
- If a commit fails due to a pre-commit hook, fix the issue and create a **new** commit; do not amend.
- Never commit files that likely contain secrets (`.env`, `credentials.json`, private keys); warn the user and stop. A `SECRETS_DETECTED` result from step 2a is that warning — do not work around it by re-running the preview script and drafting a message anyway.
- Never treat a delegated proposal as approved. Step 2a produces a draft; only the user's **OK** in step 3b authorises the commit.
