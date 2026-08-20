/**
 * Tests for .claude/hooks/lib/pricing.mjs and the `End ctx $` column it feeds.
 *
 * Two halves, and the second is the one that matters. The unit half checks the arithmetic: the four
 * token classes carry different multipliers, so a bug that bills cache reads at the input rate is a
 * 10x error that looks perfectly plausible on the page. The integration half checks that the column
 * says what it is — a price of the *final message*, never of the run — because the whole reason this
 * repository had no price column for so long is that a plausible number in a cost table is worse than
 * no number at all.
 *
 * Every expected dollar figure here is computed by hand in the test, from the published per-MTok
 * rates, rather than by calling the module under test with different arguments.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  RATES,
  RATES_AS_OF,
  ASSUMED_CACHE_TTL,
  normalizeModel,
  rateFor,
  priceTokens,
  priceRow,
  formatUsd,
} from "../../.claude/hooks/lib/pricing.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const report = join(repoRoot, ".claude", "hooks", "metrics-report.mjs");

const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: got ${actual}, expected ${expected}`);

// ---------------------------------------------------------------------------------------------
// The rate table
// ---------------------------------------------------------------------------------------------

test("a model string keeps its identity through a context marker and a date snapshot", () => {
  assert.equal(normalizeModel("claude-opus-5"), "claude-opus-5");
  assert.equal(normalizeModel("claude-opus-5[1m]"), "claude-opus-5");
  assert.equal(normalizeModel("claude-haiku-4-5-20251001"), "claude-haiku-4-5");
  assert.equal(normalizeModel("  claude-sonnet-5  "), "claude-sonnet-5");
});

test("an unknown model is unpriced, not guessed at from its name", () => {
  // The tier is legible to a human and that is exactly the temptation being refused here.
  assert.equal(normalizeModel("claude-opus-9"), null);
  assert.equal(normalizeModel("some-other-vendor-model"), null);
  assert.equal(normalizeModel(null), null);
  assert.equal(normalizeModel(""), null);
  assert.equal(priceTokens({ output: 1_000_000 }, "claude-opus-9", "2026-08-19"), null);
});

test("the rate is chosen by the record's own date — the sonnet-5 intro price expires", () => {
  const intro = rateFor("claude-sonnet-5", "2026-08-31T23:59:00Z");
  const full = rateFor("claude-sonnet-5", "2026-09-01T00:00:01Z");
  assert.deepEqual([intro.input, intro.output], [2, 10]);
  assert.deepEqual([full.input, full.output], [3, 15]);
});

test("a record with no usable start time is unpriced rather than priced at today's rate", () => {
  assert.equal(rateFor("claude-sonnet-5", null), null);
  assert.equal(rateFor("claude-sonnet-5", "not a date"), null);
  assert.equal(priceRow({ end_context: { output: 1000 }, model: "claude-sonnet-5" }), null);
});

test("every rate period is well-formed: ordered, non-overlapping, positive", () => {
  for (const [model, periods] of Object.entries(RATES)) {
    let previousUntil = -Infinity;
    for (const p of periods) {
      const from = p.from === null ? -Infinity : Date.parse(p.from);
      const until = p.until === null ? Infinity : Date.parse(p.until);
      assert.ok(from < until, `${model}: period starts after it ends`);
      assert.ok(from >= previousUntil, `${model}: periods overlap or are out of order`);
      assert.ok(p.input > 0 && p.output > 0, `${model}: non-positive rate`);
      assert.ok(p.output >= p.input, `${model}: output should not be cheaper than input`);
      previousUntil = until;
    }
    assert.equal(periods.at(-1).until, null, `${model}: no period is current`);
  }
});

// ---------------------------------------------------------------------------------------------
// The arithmetic
// ---------------------------------------------------------------------------------------------

test("each token class is billed at its own multiple of the input rate", () => {
  // One million of each class on Opus 5 ($5 in / $25 out), so every term reads as its own rate.
  const priced = priceTokens(
    { input: 1_000_000, output: 1_000_000, cache_read: 1_000_000, cache_creation: 1_000_000 },
    "claude-opus-5",
    "2026-08-19T00:00:00Z",
  );
  // 5 + 25 + (5 * 0.1) + (5 * 1.25) = 36.75. Billing cache reads at the input rate would give 41.25,
  // which is the plausible-looking 10x error this case exists to catch.
  close(priced.usd, 36.75, "per-class rates");
  assert.equal(priced.model, "claude-opus-5");
});

test("a real row prices to the hand-computed figure", () => {
  // SCRUM-132 seq 10 — the row the whole footnote is about: 115 tool calls, a few cents.
  const priced = priceTokens(
    { input: 2, output: 1214, cache_read: 282_887, cache_creation: 1562 },
    "claude-sonnet-5",
    "2026-08-10T00:00:00Z",
  );
  const expected =
    (2 * 2) / 1e6 + (1214 * 10) / 1e6 + (282_887 * 0.2) / 1e6 + (1562 * 2.5) / 1e6;
  close(priced.usd, expected, "seq 10");
  assert.ok(priced.usd < 0.1, "a 1601-second run priced under a dime — that is the point");
});

test("a missing token class is zero, but a missing usage object is unpriced", () => {
  const priced = priceTokens({ output: 1000 }, "claude-opus-5", "2026-08-19T00:00:00Z");
  close(priced.usd, 0.025, "output only");
  assert.equal(priceRow({ model: "claude-opus-5", started_at: "2026-08-19T00:00:00Z" }), null);
});

test("the assumptions ride on the result, so a figure cannot be read without them", () => {
  const priced = priceTokens({ output: 1 }, "claude-opus-5", "2026-08-19T00:00:00Z");
  assert.equal(priced.assumed_cache_ttl, ASSUMED_CACHE_TTL);
  assert.equal(priced.assumes_standard_speed, true);
  assert.equal(priced.rates_as_of, RATES_AS_OF);
});

test("the 1-hour cache TTL costs more than the assumed 5-minute one", () => {
  const short = priceTokens({ cache_creation: 1e6 }, "claude-opus-5", "2026-08-19T00:00:00Z");
  const long = priceTokens({ cache_creation: 1e6 }, "claude-opus-5", "2026-08-19T00:00:00Z", {
    cacheTtl: "1h",
  });
  close(short.usd, 6.25, "5m write");
  close(long.usd, 10, "1h write");
});

test("a figure too small for four decimals is not printed as zero", () => {
  assert.equal(formatUsd(0.0721), "$0.0721");
  assert.equal(formatUsd(0.00001), "<$0.0001");
  assert.equal(formatUsd(0), "$0.0000");
  assert.equal(formatUsd(null), "—");
});

// ---------------------------------------------------------------------------------------------
// The column
// ---------------------------------------------------------------------------------------------

/** A throwaway project root holding one metrics log. */
function projectWith(ticket, records) {
  const dir = mkdtempSync(join(tmpdir(), "metrics-pricing-"));
  writeFileSync(join(dir, ".git"), "gitdir: irrelevant\n", "utf8");
  mkdirSync(join(dir, ".workflow", "metrics"), { recursive: true });
  writeFileSync(
    join(dir, ".workflow", "metrics", `${ticket}.jsonl`),
    records.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8",
  );
  return dir;
}

const row = (over = {}) => ({
  seq: 1,
  ticket: "SCRUM-900",
  agent: "qa-scenario-generator",
  status: "completed",
  model: "claude-opus-5",
  started_at: "2026-08-19T00:00:00Z",
  finished_at: "2026-08-19T00:02:00Z",
  duration_ms: 120_000,
  tool_uses: 20,
  end_context: { total: 1_000_000, input: 0, output: 1_000_000, cache_read: 0, cache_creation: 0 },
  ...over,
});

function runReport(dir, ...args) {
  const result = spawnSync(process.execPath, [report, ...args], {
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  assert.equal(result.error, undefined, `failed to spawn: ${result.error?.message}`);
  return result;
}

test("the table carries the price column, and its header and separator agree", () => {
  const dir = projectWith("SCRUM-900", [row()]);
  const { status, stdout } = runReport(dir, "SCRUM-900", "--no-reconcile");
  assert.equal(status, 0, stdout);
  const lines = stdout.split("\n").filter((l) => l.startsWith("|"));
  assert.ok(lines[0].includes("| End ctx $ |"), lines[0]);
  // A column added to the header and not to the separator renders as unformatted text in every
  // markdown viewer, which is exactly the kind of break nobody notices in a terminal.
  const cells = (l) => l.split("|").length;
  assert.equal(cells(lines[1]), cells(lines[0]), "separator width");
  for (const l of lines.slice(2)) assert.equal(cells(l), cells(lines[0]), `row width: ${l}`);
  assert.ok(stdout.includes("$25.0000"), stdout); // 1M output tokens on Opus 5
});

test("the column says it is the final message's price and not the run's cost", () => {
  const dir = projectWith("SCRUM-900", [row()]);
  const { stdout } = runReport(dir, "SCRUM-900", "--no-reconcile");
  assert.match(stdout, /not what the run cost/);
  assert.ok(stdout.includes(`Rates as of ${RATES_AS_OF}`), "the footnote dates its rates");
  assert.ok(stdout.includes(`${ASSUMED_CACHE_TTL} TTL`), "the footnote declares the TTL assumption");
});

test("an unpriceable row shows a dash and is counted, not silently dropped from the total", () => {
  const dir = projectWith("SCRUM-900", [
    row(),
    row({ seq: 2, model: "claude-unknown-9", agent: "qa-scenario-reviewer" }),
  ]);
  const { stdout } = runReport(dir, "SCRUM-900", "--no-reconcile");
  assert.match(stdout, /1 run\(s\) carry token counts but no price/);
  // The Σ prices only what could be priced — and the sentence above is what stops that reading as all.
  assert.ok(stdout.includes("**$25.0000**"), stdout);
});

test("an async_uncosted row has no price to show", () => {
  const dir = projectWith("SCRUM-900", [
    { seq: 1, ticket: "SCRUM-900", agent: "a", status: "async_uncosted", model: null, end_context: null, prompt_chars: 900 },
  ]);
  const { stdout } = runReport(dir, "SCRUM-900", "--no-reconcile");
  // No price anywhere in the table, and no unpriced-with-cost complaint either: there were no token
  // counts to price. (The footnote still names the column, so the check is for a dollar *figure*.)
  assert.ok(!/\$\d/.test(stdout), stdout);
  assert.ok(!stdout.includes("carry token counts but no price"), stdout);
});

test("--json carries the per-record price and the pricing block that qualifies it", () => {
  const dir = projectWith("SCRUM-900", [row(), row({ seq: 2, model: "claude-unknown-9" })]);
  const { status, stdout } = runReport(dir, "SCRUM-900", "--no-reconcile", "--json");
  assert.equal(status, 0, stdout);
  const payload = JSON.parse(stdout);
  close(payload.total_end_context_usd, 25, "json total");
  assert.equal(payload.pricing.priced_rows, 1);
  assert.equal(payload.pricing.unpriced_rows_with_cost, 1);
  assert.equal(payload.pricing.scope, "final_turn_list_price");
  assert.equal(payload.pricing.rates_as_of, RATES_AS_OF);
  close(payload.records[0].end_context_usd.usd, 25, "json record");
  assert.equal(payload.records[1].end_context_usd, null);
});

test("a log with nothing priceable reports no total rather than a total of zero", () => {
  const dir = projectWith("SCRUM-900", [row({ model: "claude-unknown-9" })]);
  const { stdout } = runReport(dir, "SCRUM-900", "--no-reconcile", "--json");
  assert.equal(JSON.parse(stdout).total_end_context_usd, null);
});
