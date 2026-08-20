/**
 * List prices for the models the metrics log records, and the one function that applies them.
 *
 * WHAT THIS PRICES, AND WHAT IT DOES NOT. It prices whatever token counts it is handed. The counts in
 * `.workflow/metrics/<TICKET-ID>.jsonl` are `end_context` — the agent's *final message*, not a sum
 * over its run — so the figure this produces for such a record is the price of that one turn. It is a
 * real number about a real message and it is not the run's bill. Every caller must say so; the report
 * heads its column `End ctx $` and footnotes it for exactly that reason. The cumulative token spend of
 * a subagent is not exposed by the harness (see `agent-metrics.mjs`), so no honest run cost can be
 * computed here no matter how good the rate table gets.
 *
 * WHY THE RATES ARE DATED. A log spans days, and prices change under it. `claude-sonnet-5` is on an
 * introductory rate that expires 2026-08-31 and rises 50% the next morning; a single hardcoded pair of
 * numbers would go quietly wrong on a log that already contains rows from either side. So each model
 * carries a list of periods and the rate is chosen by the record's own `started_at`. A record with no
 * start time is not priced — the alternative is picking a period on the reader's behalf and calling
 * the result a price.
 *
 * WHAT IS ASSUMED, ONCE, AND DECLARED. Cache writes are billed at 1.25x input for the 5-minute TTL and
 * 2x for the 1-hour TTL, and *the metrics record does not say which was used*. This module assumes the
 * 5-minute default, reports that assumption on every result, and never hides it. Cache reads are 0.1x
 * input, which has no such ambiguity. Fast mode reprices Opus 5 to $10/$50 and is likewise not
 * recorded; a fast-mode run is therefore under-priced here, which is the second declared assumption.
 *
 * UNKNOWN MODEL MEANS NO PRICE. Not a guess at a tier from the name, not the nearest neighbour, not
 * zero. `null`, and the caller reports how many rows went unpriced. A model string this table has
 * never seen is exactly the case where a plausible number is worst.
 */

/** The day this table was last checked against published pricing. Bump it when a rate changes. */
export const RATES_AS_OF = "2026-08-19";

/** Cache read is 0.1x base input; cache write is 1.25x (5m TTL) or 2x (1h TTL). */
export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = { "5m": 1.25, "1h": 2 };

/** The TTL assumed when a record does not say — the API default. */
export const ASSUMED_CACHE_TTL = "5m";

/**
 * US dollars per million tokens, per model, per period.
 *
 * `from` is inclusive, `until` exclusive; `until: null` means "still current". Periods are listed
 * oldest first and must not overlap.
 */
export const RATES = {
  "claude-fable-5": [{ from: null, until: null, input: 10, output: 50 }],
  "claude-mythos-5": [{ from: null, until: null, input: 10, output: 50 }],
  "claude-opus-5": [{ from: null, until: null, input: 5, output: 25 }],
  "claude-opus-4-8": [{ from: null, until: null, input: 5, output: 25 }],
  "claude-opus-4-7": [{ from: null, until: null, input: 5, output: 25 }],
  "claude-opus-4-6": [{ from: null, until: null, input: 5, output: 25 }],
  "claude-opus-4-5": [{ from: null, until: null, input: 5, output: 25 }],
  // The introductory rate is the reason this table is dated rather than flat.
  "claude-sonnet-5": [
    { from: null, until: "2026-09-01", input: 2, output: 10 },
    { from: "2026-09-01", until: null, input: 3, output: 15 },
  ],
  "claude-sonnet-4-6": [{ from: null, until: null, input: 3, output: 15 }],
  "claude-sonnet-4-5": [{ from: null, until: null, input: 3, output: 15 }],
  "claude-haiku-4-5": [{ from: null, until: null, input: 1, output: 5 }],
};

/**
 * Strip what a model string carries beyond its identity: a `[1m]`-style context marker (1M context is
 * charged at standard rates on every model here, so the marker changes nothing), and a trailing date
 * snapshot. Anything left unmatched stays unmatched — see the unknown-model rule in the header.
 */
export function normalizeModel(model) {
  if (typeof model !== "string" || !model.trim()) return null;
  const bare = model.trim().replace(/\[[^\]]*\]$/, "");
  if (RATES[bare]) return bare;
  const dateless = bare.replace(/-\d{8}$/, "");
  return RATES[dateless] ? dateless : null;
}

/** The rate period covering `at` (an ISO date string), or `null`. */
export function rateFor(model, at) {
  const key = normalizeModel(model);
  if (!key) return null;
  const when = Date.parse(at ?? "");
  if (!Number.isFinite(when)) return null;
  for (const period of RATES[key]) {
    const from = period.from === null ? -Infinity : Date.parse(period.from);
    const until = period.until === null ? Infinity : Date.parse(period.until);
    if (when >= from && when < until) return { model: key, input: period.input, output: period.output };
  }
  return null;
}

const perToken = (perMillion) => perMillion / 1_000_000;

/**
 * Price one bundle of token counts.
 *
 * `tokens` takes `{ input, output, cache_read, cache_creation }`; a missing field is zero, because a
 * record that carries a usage object and omits a class genuinely used none of it. Returns `null` when
 * the model is unknown or the date does not resolve to a period — never a zero standing in for
 * "couldn't tell".
 */
export function priceTokens(tokens, model, at, { cacheTtl = ASSUMED_CACHE_TTL } = {}) {
  const rate = rateFor(model, at);
  if (!rate || !tokens) return null;
  const write = CACHE_WRITE_MULTIPLIER[cacheTtl] ?? CACHE_WRITE_MULTIPLIER[ASSUMED_CACHE_TTL];
  const q = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const usd =
    q(tokens.input) * perToken(rate.input) +
    q(tokens.output) * perToken(rate.output) +
    q(tokens.cache_read) * perToken(rate.input * CACHE_READ_MULTIPLIER) +
    q(tokens.cache_creation) * perToken(rate.input * write);
  return {
    usd,
    model: rate.model,
    rate_input_per_mtok: rate.input,
    rate_output_per_mtok: rate.output,
    // Carried on every result so a consumer cannot read the figure without reading what it assumed.
    assumed_cache_ttl: cacheTtl,
    assumes_standard_speed: true,
    rates_as_of: RATES_AS_OF,
  };
}

/**
 * Price one metrics record's `end_context` block.
 *
 * THE RESULT IS THE PRICE OF THE RECORD'S FINAL MESSAGE. It is named `end_context_usd` everywhere it
 * is stored or printed, and it is never to be presented as what the run cost.
 */
export function priceRow(record) {
  const tokens = record?.end_context ?? record?.tokens ?? null;
  if (!tokens) return null;
  return priceTokens(tokens, record?.model ?? null, record?.started_at ?? null);
}

/** `$0.0721`, or `<$0.0001` for a figure too small to render at that precision without reading as zero. */
export function formatUsd(usd) {
  if (typeof usd !== "number" || !Number.isFinite(usd)) return "—";
  if (usd > 0 && usd < 0.0001) return "<$0.0001";
  return `$${usd.toFixed(4)}`;
}
