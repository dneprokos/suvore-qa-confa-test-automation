# Caveman plugin — why use many token when few do trick

Source: [github.com/juliusbrussee/caveman](https://github.com/juliusbrussee/caveman) · installed here as the
`caveman@caveman` plugin (user scope).

## The idea

Every word the agent writes costs tokens and your reading time. Most of it is politeness and filler.
Caveman makes Claude drop articles, filler, pleasantries and hedging and answer in short fragments, while
keeping every technical detail. **The code gets no smaller. Only the talk around it does.**

| Normal (69 tokens) | Caveman (19 tokens) |
|---|---|
| The reason your React component is re-rendering is likely because you're creating a new object reference on each render cycle. … I'd recommend using useMemo to memoize the object. | New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`. |

Same diagnosis, same fix, about a quarter of the words.

What it never compresses: code, commands, file paths, exact error messages, commit messages and PR text.
Security warnings and "are you sure?" confirmations come back in full sentences, then caveman resumes.

## What the plugin contains

A good example of everything a plugin can ship, in one package:

| Part | What it does here |
|---|---|
| **Hooks** (`SessionStart`, `UserPromptSubmit`) | Switch the mode on at session start and remind Claude on every prompt, so it doesn't drift back to long answers. |
| **Skill** `/caveman` | The rules. Levels: `lite`, `full` (default), `ultra`. Turn off with "normal mode". |
| **Skills** `/caveman-commit`, `/caveman-review` | Short commit messages and one-line review comments. |
| **Skill** `/caveman-compress <file>` | Rewrites a memory file such as `CLAUDE.md` in caveman style, so it costs fewer input tokens every session. Keeps a backup. |
| **Skill** `/caveman-stats` | Real token usage and savings for the session, read from the session log. |
| **Sub-agents** `cavecrew-investigator`, `-builder`, `-reviewer` | Search, small edits and reviews that return compressed results, so less text lands back in the main context. |

## Install

```text
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman
```

## Why it's in this talk

- **Hooks + skill together.** The skill holds the rules; the hooks make sure they apply on every turn.
  A rule alone gets forgotten after a long conversation.
- **Tokens are cost.** Shorter answers are cheaper and quicker to read, like the cost table in use case 7.
- **When to skip it:** explanations for beginners, documentation, anything a reader needs in full sentences.
