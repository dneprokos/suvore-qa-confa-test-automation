# Run cost — the metrics log

Read this **once per session, before the first delegation**, and again before composing a terminal
return. It is part of the skill: same rules, including the one that no file here names an agent.

Every agent run costs tokens and wall time, and **no agent can report its own**. The numbers are
produced by the harness after the subagent has already stopped, so an agent that printed them would
be guessing. They arrive from outside instead: three hooks on the subagent tool, all of them
`.claude/hooks/agent-metrics.mjs`, registered in `.claude/settings.json`.

| Hook | Fires | Records |
|---|---|---|
| `PreToolUse --pre` | at launch | a measured start time, in `.workflow/metrics/pending/` |
| `PostToolUse --post` | on completion | the full cost, in `.workflow/metrics/<TICKET-ID>.jsonl`; clears the launch record |
| `PostToolUseFailure --failed` | on an interrupt, timeout or error | the event and its duration, with no token figures; clears the same |

The ticket is taken from the prompt, which is why **every delegation must name the ticket id in its
prompt**. Miss it and the run lands in `unassigned.jsonl`. The **mode** is taken from the prompt for the
same reason and with the same consequence — see *What the numbers are* below.

`--post` emits an `AGENT_RUN_METRICS:` line into the transcript immediately after that agent's own
output:

```text
AGENT_RUN_METRICS: seq=3 ticket=SCRUM-139 agent=<the agent that just ran> mode=first_run
status=completed model=claude-opus-5 duration=109.0s end_context=63563 in=2 out=5872
cache_read=50682 cache_write=7007 tool_uses=26 prompt_chars=1256
log=.workflow/metrics/SCRUM-139.jsonl
```

(The `agent=` field carries a real name in the real line; it is elided here because a reference file
inherits the skill's rule against naming one.)

Treat that line as the last field of the receipt. Read it after every step, echo `agent`, `mode`,
`duration` and `tool_uses` in the step summary, and copy `duration_s`, `tool_uses` and `end_context`
into the `history` entry you were writing anyway. It costs one line of state and makes an expensive
loop visible while it is still running rather than after the bill.

## What the numbers are

**`end_context` is not the run's token spend.** The harness exposes one message's usage and no
cumulative figure, so every token column is the agent's *final message* — how much context it was
carrying when it stopped. A row reading 115 tool calls against 1,214 output tokens is the last turn of
a long run, not a cheap one. It is the right number for "how heavy is this step's prompt" and the wrong
one for "what did this step spend", and there is no second number available: the cumulative spend
cannot be obtained from outside the conversation at all.

**`tool_uses` is the honest measure of work**, being a true count over the whole run, and it tracks
wall time closely enough to be the figure to watch. Two regimes show up in it: a step that makes many
cheap calls, and a step that makes few expensive ones. They get expensive for different reasons and a
total hides both.

**`mode` is declared, not inferred.** It comes from the `run_mode:` line every delegation prompt
carries. `undeclared` on a row means the prompt omitted the line — it does **not** mean the run was a
first run, and it must never be read as one. `prompt_chars` measures only what the delegation prompt
itself weighed; everything a step reads on its own is invisible from here and shows up inside
`end_context` instead.

Everything else stays in the log file. Do not aggregate by hand and do not re-print the per-run lines
you already echoed — at the end of the run, render the table with

```bash
node .claude/hooks/metrics-report.mjs <TICKET-ID>
```

which prints one row per run **in completion order**, an `n/N` run counter per agent so a
three-iteration review loop reads as three rows, a `Σ` total, and the wall clock. The wall clock is
shorter than the sum whenever the parallel pairs of Phase 2 ran together; that gap is the
parallelism, not an error.

**The report is printed whole or not at all.** The column names are its first two lines, so piping it
through `tail`, `grep` or any other filter strips the header and leaves a table of unlabelled numbers
that reads as something it is not. Run the command bare and quote from what it printed. The two
footnotes under the table are part of it: they are what stop `End context` and `End ctx $` being read
as the run's spend, and a table quoted without them makes exactly the claim they exist to prevent.

## `End ctx $` — a price, and not the run's

The report prices each row's token columns at the model's published rates and prints the result as
`End ctx $`. It inherits `End context`'s scope exactly: **the final message, at list price.** A row
showing 115 tool calls against seven cents is one cheap last turn of an expensive run, and the seven
cents is a true statement about that turn and a false one about the run.

So: quote it as the price of the final message, or not at all. Never call it the run's cost, never
call the `Σ` a bill, and never put it in a `NOTES:` line, a ticket comment or a pull-request body as
what the workflow cost. The two rules below already forbid relabelling a real number; this is the
number most likely to tempt it, because it is denominated in the unit a reader wants.

A dash means unpriced — an unrecorded model, one absent from the rate table, or a row with no start
time to date the rate against. The footnote counts those. A guessed tier is not a price, so nothing
is filled in there, and **the run's actual spend stays unavailable**: pricing the final turn does not
make the cumulative figure exist.

## An interrupted run is a row, not a hole

A launch that never completed is promoted into the log as an `interrupted` row carrying its start
time and dashes for duration and tokens, and the table footnotes how many runs contributed nothing to
the total. The dashes are not a reporting gap to be filled in: the harness computes a token count
when a subagent *stops*, so a run that never stopped has none, and any figure written there would be
invented. A partial usage number scraped from the transcript is a different number, and presenting it
as the run's cost is the same offence.

An interrupt is caught twice over, which is why the row appears whether or not this harness build
supports the failure hook: `--failed` records the event when it fires, and `metrics-report.mjs`
promotes an unreconciled launch record when it does not. **Two things stay uncapturable, and the
report says so rather than guessing** — the tokens an interrupted agent spent, and a kill in the
window before the launch record was written.

## The two rules

* **Never invent, estimate or extrapolate a number, and never relabel one.** A missing
  `AGENT_RUN_METRICS` line means the hook is not installed or the run predates it — say
  `metrics unavailable`, never a plausible figure. If the run is in the log but the figure is a dash,
  the dash is the answer. And `end_context` is reported as end context: calling it the run's cost, or
  summing it into a total described as one, is inventing a number out of a real one.
* **Cost is a report, never a routing input.** An expensive stream is not thereby a failing one, and
  no iteration is skipped, no review shortened and no cap lowered because the token count looked
  high. Routing reads verdicts only.

Both survive as one-line rules in `SKILL.md` as well. They are the two that cost something real when
forgotten, so they are stated in the place that is always loaded and again in the place that explains
them.
