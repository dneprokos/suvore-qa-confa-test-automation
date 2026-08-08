#!/usr/bin/env node
/**
 * Renders `.workflow/metrics/<TICKET-ID>.jsonl` as the run-cost table the orchestrator prints at the
 * end of a workflow: one row per agent run in the order the runs finished, then a total.
 *
 *   node .claude/hooks/metrics-report.mjs SCRUM-139           # markdown table
 *   node .claude/hooks/metrics-report.mjs SCRUM-139 --json    # aggregate only
 *
 * Multiple runs of the same agent stay as separate rows on purpose — the iteration count is the
 * point of the table.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ticket = process.argv[2];
const asJson = process.argv.includes('--json');

if (!ticket) {
  console.error('usage: node .claude/hooks/metrics-report.mjs <TICKET-ID> [--json]');
  process.exit(1);
}

const file = path.join(process.cwd(), '.workflow', 'metrics', `${ticket}.jsonl`);
if (!existsSync(file)) {
  console.log(`No metrics recorded for ${ticket} (${file} does not exist).`);
  process.exit(0);
}

const rows = readFileSync(file, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

const total = rows.reduce(
  (acc, r) => ({
    duration_ms: acc.duration_ms + r.duration_ms,
    total: acc.total + r.tokens.total,
    input: acc.input + r.tokens.input,
    output: acc.output + r.tokens.output,
    cache_read: acc.cache_read + r.tokens.cache_read,
    cache_creation: acc.cache_creation + r.tokens.cache_creation,
    tool_uses: acc.tool_uses + r.tool_uses,
  }),
  { duration_ms: 0, total: 0, input: 0, output: 0, cache_read: 0, cache_creation: 0, tool_uses: 0 }
);

/** Wall-clock spans the whole run; the sum of durations exceeds it whenever two streams ran in parallel. */
const wallClockMs =
  rows.length === 0
    ? 0
    : Math.max(...rows.map((r) => Date.parse(r.finished_at))) -
      Math.min(...rows.map((r) => Date.parse(r.started_at)));

if (asJson) {
  console.log(JSON.stringify({ ticket, runs: rows.length, total, wall_clock_ms: wallClockMs }, null, 2));
  process.exit(0);
}

const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const n = (v) => v.toLocaleString('en-US');

const runsPerAgent = rows.reduce((m, r) => m.set(r.agent, (m.get(r.agent) ?? 0) + 1), new Map());
const iterationOf = new Map();

console.log(`### Agent run cost — ${ticket}\n`);
console.log('| # | Agent | Run | Status | Duration | Total tokens | In | Out | Cache read | Cache write | Tools |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const i = (iterationOf.get(r.agent) ?? 0) + 1;
  iterationOf.set(r.agent, i);
  const run = `${i}/${runsPerAgent.get(r.agent)}`;
  console.log(
    `| ${r.seq} | \`${r.agent}\` | ${run} | ${r.status} | ${secs(r.duration_ms)} | ${n(r.tokens.total)} | ` +
      `${n(r.tokens.input)} | ${n(r.tokens.output)} | ${n(r.tokens.cache_read)} | ${n(r.tokens.cache_creation)} | ${r.tool_uses} |`
  );
}
console.log(
  `| **Σ** | **${rows.length} runs** | | | **${secs(total.duration_ms)}** | **${n(total.total)}** | ` +
    `**${n(total.input)}** | **${n(total.output)}** | **${n(total.cache_read)}** | **${n(total.cache_creation)}** | **${total.tool_uses}** |`
);
console.log(`\nWall clock (first start -> last finish): ${secs(wallClockMs)}`);
if (total.duration_ms > wallClockMs) {
  console.log(`Parallelism saved ${secs(total.duration_ms - wallClockMs)} against serial execution.`);
}
