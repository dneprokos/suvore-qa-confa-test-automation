# Claude models — pick the model for the job

The client decides where Claude runs. The model decides how well it thinks, how fast it answers and
how much it costs. Using one model for every task is like running every test in a headed browser:
it works, but it is slow and expensive for most of the work.

## The families

| Family | Current model | Strength | Trade-off | Price per 1M tokens, input / output* |
|---|---|---|---|---|
| **Haiku** | Haiku 4.5 | Fast, cheap, good at simple and well-defined tasks | Weaker at long reasoning and ambiguity | $1 / $5 |
| **Sonnet** | Sonnet 5 | The everyday workhorse: strong coding, good speed | Can miss what a deep review would catch | $3 / $15 |
| **Opus** | Opus 5.5 | Deep reasoning, careful review, long multi-step work | Slower and more expensive | $5 / $25 |
| **Fable** | Fable 5.1 | The most capable tier, for the hardest problems | The most expensive | $10 / $50 |

\* List rates as recorded in this repo's `.claude/hooks/lib/pricing.mjs` (checked 2026-08-19; the Opus
row is the Opus 5 rate). Prices change, so check the official pricing page before you quote them.

> Bigger is not always better. A bigger model costs more on every call, and in an agent loop that
> means dozens of calls. Choose the smallest model that does the task **reliably**.

## How to choose the model in Claude Code

| Where | How | Scope |
|---|---|---|
| Session | `/model` → pick Opus, Sonnet, Haiku… | The current conversation |
| Start-up | `claude --model sonnet` | The whole session |
| Settings | `"model": "sonnet"` in `settings.json` | Every session in this project or for this user |
| Sub-agent | `model: haiku` in the agent's front matter | Only that agent, in its own context window |
| Effort | The effort setting (see [non-determinism](../1_1_prompts/1_non-determinism-and-hallucination.md)) | How hard the same model thinks |

The per-agent setting is the one that matters most for automation. Each step of a workflow can run on
a different model.

## Use case: this repository mixes all three

The QA workflow and the Slack bug triage in this repo do not run on one model. Each agent has a model
chosen for its job (`model:` in `.claude/agents/*.md`):

| Model | Agents | Why this model |
|---|---|---|
| **Haiku** | `qa-jira-transition`, `git-change-analyst`, `triage-slack-collector`, `triage-bug-filer`, `triage-slack-responder` | Mechanical work: move a ticket, read `git status`, post a reply. Clear input, clear output, many calls. Speed and price win. |
| **Sonnet** | `qa-requirements-collector`, `qa-scenario-generator`, `aqa-api-test-creator`, `aqa-ui-test-creator`, `triage-bug-drafter`, `triage-duplicate-scout` | Writing: requirements, test design, Playwright code. Needs good coding and reasoning, runs long, so the price has to stay sane. |
| **Opus** | `qa-scenario-reviewer`, `aqa-api-test-reviewer`, `aqa-ui-test-reviewer` | Reviewing: the quality gate before a PR. Finding a missing boundary case or a flaky wait needs the deepest reasoning. A weak reviewer passes weak work. |

**The pattern:** a cheaper model creates, a stronger model reviews. The reviewer runs fewer times and
reads less than the creator writes, so the expensive model is used where one missed defect costs the
most.

## QA use cases by model

| Task | Model | Why |
|---|---|---|
| Summarise a test run log, reformat a bug report, rename things in bulk | Haiku | Well-defined, low risk, fast feedback |
| Classify Slack messages or failures into "bug / not a bug" | Haiku | Short input, fixed set of answers, many items |
| Write a Playwright spec or page object from an example | Sonnet | Good code quality at an everyday price |
| Turn a Jira ticket into requirements and test scenarios | Sonnet | Structured writing with some reasoning |
| Review test design for missing negative and boundary cases | Opus | Needs to see what is **not** there |
| Review test code for flaky patterns and wrong assertions | Opus | One missed defect ships to the PR |
| Debug a flaky test with unclear cause across several layers | Opus / Fable | Long reasoning over many files and hypotheses |
| Plan a framework migration or a new test architecture | Opus / Fable | Many trade-offs, expensive to get wrong |

## Rules of thumb

- **Start with Sonnet.** Move down to Haiku when the task is simple and repeated. Move up to Opus when
  the output is wrong in ways a better prompt does not fix.
- **Review with a stronger model than you create with.** Same model, same blind spots.
- **Change the model before you rewrite the prompt five times.** Sometimes the task is too hard for the
  model, not badly described.
- **The model is not the only cost.** Context size and the number of calls matter as much — see
  [the context window](../1_2_context-window/context-window.md).
