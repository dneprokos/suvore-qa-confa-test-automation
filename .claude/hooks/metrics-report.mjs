#!/usr/bin/env node
/**
 * Renders `.workflow/metrics/<TICKET-ID>.jsonl` as the run-cost table the orchestrator prints at the
 * end of a workflow: one row per agent run in the order the runs finished, then a total.
 *
 *   node .claude/hooks/metrics-report.mjs SCRUM-139                # markdown table
 *   node .claude/hooks/metrics-report.mjs SCRUM-139 --json         # aggregate + one entry per run
 *   node .claude/hooks/metrics-report.mjs SCRUM-139 --no-reconcile # leave launch records alone
 *
 * Multiple runs of the same agent stay as separate rows on purpose — the iteration count is the
 * point of the table.
 *
 * WHAT THE TOKEN COLUMNS ARE, AND ARE NOT. They are the agent's *final message*, not a sum over its
 * run — `usage.iterations` is a single-element array and `totalTokens` is that one message's figures
 * added together. A row reading 115 tool calls against 1,214 output tokens is the last turn of a long
 * run, not a cheap one. So the columns are headed `End context`, and the run's actual work is the
 * `Tools` column, which is a true count. The cumulative spend is not obtainable from the harness at
 * all; this prints what exists and names it correctly rather than summing it into something that
 * looks like a bill.
 *
 * THE `End ctx $` COLUMN PRICES THAT FINAL MESSAGE AND NOTHING ELSE. It is the token columns beside
 * it multiplied by the model's published rates, so it inherits their scope exactly: a real price for
 * one turn, not the run's bill. It exists because "which agent stopped carrying the most context" is
 * a question the raw token counts answer badly across models charged at different rates, and because
 * the half of a cost report that *is* computable should not wait on the half that is not. A row whose
 * model this build has no rate for is left blank rather than guessed, and the footnote says how many.
 * Rates, their dates and the two declared assumptions live in `lib/pricing.mjs`.
 *
 * `Mode` comes from the `run_mode:` line the caller wrote into the delegation prompt. `undeclared`
 * means the prompt carried none — not that the run was a first run. Rows written before the field
 * existed show `—`, which is the same statement about an older log.
 *
 * RECONCILIATION. A launch that never completed leaves a record in `metrics/pending/`. By default
 * this script promotes any such record into the log as an `interrupted` row and removes it, so an
 * interrupted run is recorded exactly once and the pending directory stays small. That row carries a
 * start time and no cost: the harness computes a token total when a subagent stops, so a run that
 * never stopped has none, and printing a number there would be inventing one.
 *
 * NOTHING HERE EVER CRASHES ON BAD DATA. This is the last thing a `DECLINED` or `PAUSED` return
 * prints, and a throw at that point would destroy the whole cost section — which is exactly the
 * record that matters most when a run stopped early. A torn line is skipped and counted.
 */

import { readFileSync, existsSync, readdirSync, appendFileSync, unlinkSync, mkdirSync } from "node:fs";
import path from "node:path";
import { resolveProjectDir, metricsDir, metricsFile, pendingDir } from "./lib/paths.mjs";
import { priceRow, formatUsd, RATES_AS_OF, ASSUMED_CACHE_TTL } from "./lib/pricing.mjs";

const ticket = process.argv[2];
const asJson = process.argv.includes("--json");
const reconcile = !process.argv.includes("--no-reconcile");

if (!ticket || ticket.startsWith("--")) {
  console.error("usage: node .claude/hooks/metrics-report.mjs <TICKET-ID> [--json] [--no-reconcile]");
  process.exit(1);
}

const projectDir = resolveProjectDir(null);
const file = metricsFile(projectDir, ticket);

/** Promote every unreconciled launch record for this ticket into the log, once. */
function reconcilePending() {
  const dir = pendingDir(projectDir);
  if (!existsSync(dir)) return 0;
  let promoted = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const pendingPath = path.join(dir, name);
    let record;
    try {
      record = JSON.parse(readFileSync(pendingPath, "utf8"));
    } catch {
      continue;
    }
    if (record?.ticket !== ticket) continue;
    try {
      mkdirSync(metricsDir(projectDir), { recursive: true });
      const seq = existsSync(file)
        ? readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).length + 1
        : 1;
      appendFileSync(
        file,
        `${JSON.stringify({
          seq,
          ticket,
          ticket_source: record.ticket_source ?? null,
          tool_use_id: record.tool_use_id ?? null,
          agent: record.agent ?? "unknown",
          description: record.description ?? "",
          run_mode: record.run_mode ?? null,
          prompt_chars: record.prompt_chars ?? null,
          // A background launch is not an interrupt. Its post hook fired on the launch and carried no
          // cost, so the run may have finished perfectly and simply never reported — calling that
          // `interrupted` would be a false claim, and calling it nothing at all is what lost three
          // runs from this log.
          status: record.async ? "async_uncosted" : "interrupted",
          model: null,
          started_at: record.started_at ?? null,
          started_at_measured: Boolean(record.started_at),
          finished_at: null,
          duration_ms: null,
          end_context: null,
          tokens: null,
          tool_uses: null,
          reason: record.async ? "async_launch_no_cost" : "no_completion_record",
          session_id: record.session_id ?? null,
        })}\n`,
        "utf8",
      );
      unlinkSync(pendingPath);
      promoted += 1;
    } catch {
      /* leave it pending; the next report tries again */
    }
  }
  return promoted;
}

const promoted = reconcile ? reconcilePending() : 0;

if (!existsSync(file)) {
  console.log(`No metrics recorded for ${ticket} (${file} does not exist).`);
  process.exit(0);
}

let skipped = 0;
const rows = readFileSync(file, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      skipped += 1;
      return null;
    }
  })
  .filter(Boolean);

/** A finite number, or null. Anything an interrupted row left empty must not enter a sum. */
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * `end_context` is the honest name and the one records carry from now on; `tokens` is the same object
 * under the name records written before that change used. Reading both is what lets one log hold rows
 * from either side of the rename without a migration.
 */
const tok = (row, field) => num(row?.end_context?.[field] ?? row?.tokens?.[field]);
const hasCost = (row) => Boolean(row?.end_context ?? row?.tokens);

const counted = rows.filter((r) => num(r.duration_ms) !== null || hasCost(r));
const uncounted = rows.length - counted.length;

const total = counted.reduce(
  (acc, r) => ({
    duration_ms: acc.duration_ms + (num(r.duration_ms) ?? 0),
    total: acc.total + (tok(r, "total") ?? 0),
    input: acc.input + (tok(r, "input") ?? 0),
    output: acc.output + (tok(r, "output") ?? 0),
    cache_read: acc.cache_read + (tok(r, "cache_read") ?? 0),
    cache_creation: acc.cache_creation + (tok(r, "cache_creation") ?? 0),
    tool_uses: acc.tool_uses + (num(r.tool_uses) ?? 0),
  }),
  { duration_ms: 0, total: 0, input: 0, output: 0, cache_read: 0, cache_creation: 0, tool_uses: 0 },
);

/** Wall-clock spans the whole run; the sum of durations exceeds it whenever two streams ran in parallel. */
const starts = rows.map((r) => Date.parse(r.started_at ?? "")).filter((n) => Number.isFinite(n));
const finishes = rows.map((r) => Date.parse(r.finished_at ?? "")).filter((n) => Number.isFinite(n));
const wallClockMs = starts.length && finishes.length ? Math.max(...finishes) - Math.min(...starts) : null;

const runsPerAgent = rows.reduce((m, r) => m.set(r.agent, (m.get(r.agent) ?? 0) + 1), new Map());

/**
 * One entry per run, in log order.
 *
 * This exists because the aggregate alone hid the thing worth seeing. Every per-agent question — which
 * agent carries the most context, whether revisions cost what first runs do, how tool calls track
 * duration — meant hand-parsing the jsonl, and the one that went unasked for the life of this log was
 * "does 115 tool calls against 1,214 output tokens make sense", which is how a final-turn figure was
 * mistaken for a run's spend. Whatever the table can show, `--json` can now be asked.
 */
const records = (() => {
  const iteration = new Map();
  return rows.map((r) => {
    const i = (iteration.get(r.agent) ?? 0) + 1;
    iteration.set(r.agent, i);
    return {
      seq: r.seq ?? null,
      agent: r.agent ?? "unknown",
      run: i,
      runs_for_agent: runsPerAgent.get(r.agent) ?? 1,
      run_mode: r.run_mode ?? null,
      status: r.status ?? "unknown",
      model: r.model ?? null,
      duration_ms: num(r.duration_ms),
      tool_uses: num(r.tool_uses),
      tool_stats: r.tool_stats ?? null,
      prompt_chars: num(r.prompt_chars),
      end_context: hasCost(r)
        ? {
            total: tok(r, "total"),
            input: tok(r, "input"),
            output: tok(r, "output"),
            cache_read: tok(r, "cache_read"),
            cache_creation: tok(r, "cache_creation"),
            scope: r.end_context?.scope ?? "final_turn",
            messages: num(r.end_context?.messages),
          }
        : null,
      // The price of that final message, on the same terms as `end_context` above. Never a run cost.
      end_context_usd: priceRow(r),
      started_at: r.started_at ?? null,
      started_at_measured: Boolean(r.started_at_measured),
      finished_at: r.finished_at ?? null,
      description: r.description ?? "",
    };
  });
})();

/**
 * Summed over the rows that could be priced, and counted separately from the rows that could not. A
 * total that silently omits an unpriced row reads as complete; the count is what stops it doing that.
 */
const priced = records.filter((r) => r.end_context_usd !== null);
const unpricedWithCost = records.filter((r) => r.end_context_usd === null && r.end_context !== null);
const totalUsd = priced.length ? priced.reduce((a, r) => a + r.end_context_usd.usd, 0) : null;

if (asJson) {
  console.log(
    JSON.stringify(
      {
        ticket,
        runs: rows.length,
        interrupted: rows.filter((r) => r.status === "interrupted").length,
        unreadable_lines: skipped,
        promoted_this_run: promoted,
        // Named for what it is. `total.total` and the four below it are a sum of final-turn context
        // sizes, not the run's token spend, which the harness does not expose.
        totals_scope: "sum_of_final_turn_context",
        total,
        // Same scope as `total`: the sum of per-row final-message prices, not the run's spend.
        total_end_context_usd: totalUsd,
        pricing: {
          rates_as_of: RATES_AS_OF,
          assumed_cache_ttl: ASSUMED_CACHE_TTL,
          priced_rows: priced.length,
          unpriced_rows_with_cost: unpricedWithCost.length,
          scope: "final_turn_list_price",
        },
        wall_clock_ms: wallClockMs,
        records,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const n = (v) => (v === null ? "—" : v.toLocaleString("en-US"));
const dur = (v) => (num(v) === null ? "—" : secs(v));

console.log(`### Agent run cost — ${ticket}\n`);
console.log(
  "| # | Agent | Run | Mode | Status | Duration | Tools | End context | End ctx $ | In | Out | Cache read | Cache write | Prompt chars |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of records) {
  console.log(
    `| ${r.seq} | \`${r.agent}\` | ${r.run}/${r.runs_for_agent} | ${r.run_mode ?? "—"} | ${r.status} | ` +
      `${dur(r.duration_ms)} | ${n(r.tool_uses)} | ${n(r.end_context?.total ?? null)} | ` +
      `${r.end_context_usd ? formatUsd(r.end_context_usd.usd) : "—"} | ` +
      `${n(r.end_context?.input ?? null)} | ${n(r.end_context?.output ?? null)} | ` +
      `${n(r.end_context?.cache_read ?? null)} | ${n(r.end_context?.cache_creation ?? null)} | ` +
      `${n(r.prompt_chars)} |`,
  );
}
// `—` rather than `0` when no row carried one: a log written before the field existed has an unknown
// prompt size, and zero is a measurement.
const totalPromptChars = records.some((r) => r.prompt_chars !== null)
  ? records.reduce((a, r) => a + (r.prompt_chars ?? 0), 0)
  : null;
console.log(
  `| **Σ** | **${rows.length} runs** | | | | **${secs(total.duration_ms)}** | **${total.tool_uses}** | ` +
    `**${n(total.total)}** | **${totalUsd === null ? "—" : formatUsd(totalUsd)}** | ` +
    `**${n(total.input)}** | **${n(total.output)}** | **${n(total.cache_read)}** | ` +
    `**${n(total.cache_creation)}** | **${n(totalPromptChars)}** |`,
);

console.log(
  `\n**End context is the final message, not the run.** The harness exposes one message's usage and no ` +
    `cumulative figure, so these columns say how much context each agent was carrying when it stopped. ` +
    `\`Tools\` is a true count over the whole run and is the honest measure of how much work it did.`,
);

console.log(
  `
**\`End ctx $\` is the list price of that final message — not what the run cost.** It is the four ` +
    `token columns at the model's published rates, so it says exactly what they say and nothing more: ` +
    `a row showing hundreds of tool calls against a few cents is one cheap last turn of an expensive ` +
    `run. Do not sum it into anything called a bill. Rates as of ${RATES_AS_OF}; cache writes assume ` +
    `the ${ASSUMED_CACHE_TTL} TTL and standard speed, neither of which the record states.`,
);
if (unpricedWithCost.length > 0) {
  console.log(
    `${unpricedWithCost.length} run(s) carry token counts but no price: the model was unrecorded or ` +
      `absent from the rate table, and a tier guessed from a name is not a price.`,
  );
}

if (uncounted > 0) {
  console.log(
    `\n${uncounted} run(s) contributed nothing to the total: an interrupted agent never produced a ` +
      `token count, and no figure can be reconstructed for it.`,
  );
}
const asyncUncosted = rows.filter((r) => r.status === "async_uncosted").length;
if (asyncUncosted > 0) {
  console.log(
    `${asyncUncosted} run(s) were launched in the background: the tool call returned at launch, so the ` +
      `hook saw no cost. They are not interrupts and may have completed normally — the cost is simply ` +
      `not observable from a tool-call hook.`,
  );
}
if (skipped > 0) console.log(`${skipped} unreadable line(s) skipped.`);

if (wallClockMs === null) {
  console.log(`\nWall clock: unavailable (no run carries both a start and a finish).`);
} else {
  console.log(`\nWall clock (first start -> last finish): ${secs(wallClockMs)}`);
  if (total.duration_ms > wallClockMs) {
    console.log(`Parallelism saved ${secs(total.duration_ms - wallClockMs)} against serial execution.`);
  }
}
