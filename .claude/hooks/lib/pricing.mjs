/**
 * List prices for the models the metrics log records, and the functions that apply them.
 *
 * WHAT THIS PRICES. Two shapes of token count reach it, and it says which it was handed:
 *
 *   - a `billed` block (see `transcript-usage.mjs`) — every API call of a run summed from the
 *     subagent's transcript, with the cache-write TTL split and the speed read off each call. Priced
 *     by `priceBilled`, this is the run's list-price bill, and nothing about it is assumed except the
 *     rate table itself.
 *   - a final-turn `end_context` block — one message's usage, which is all the harness hands a hook
 *     directly. Priced by `priceRow` for rows written before the transcript measure existed, and
 *     named `end_context_usd` so it cannot be mistaken for the run's cost.
 *
 * WHY THE RATES ARE DATED. A log spans days, and prices change under it. `claude-sonnet-5` is on an
 * introductory rate that expires 2026-08-31 and rises 50% the next morning; a single hardcoded pair of
 * numbers would go quietly wrong on a log that already contains rows from either side. So each model
 * carries a list of periods and the rate is chosen by the record's own `started_at`. A record with no
 * start time is not priced — the alternative is picking a period on the reader's behalf and calling
 * the result a price.
 *
 * WHAT IS ASSUMED, AND WHEN. Cache writes bill at 1.25x input for the 5-minute TTL and 2x for the
 * 1-hour TTL. A `billed` block carries the split, so nothing is assumed there; only a cache write whose
 * TTL the transcript did not record falls back to the 5-minute default, and the result counts how many
 * tokens went that way. A final-turn block carries no split and is priced at the 5-minute rate with the
 * assumption declared on the result. Speed is likewise read from the transcript: a run at anything but
 * `standard` is left unpriced, because fast mode reprices the model and this table holds list rates.
 *
 * UNKNOWN MODEL MEANS NO PRICE. Not a guess at a tier from the name, not the nearest neighbour, not
 * zero. `null`, with the reason, and the caller reports how many rows went unpriced. A model string
 * this table has never seen is exactly the case where a plausible number is worst.
 */

/** The day this table was last checked against published pricing. Bump it when a rate changes. */
export const RATES_AS_OF = "2026-08-19";

/** Cache read is 0.1x base input; cache write is 1.25x (5m TTL) or 2x (1h TTL). */
export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = { "5m": 1.25, "1h": 2 };

/** The TTL assumed for a cache write whose TTL was not recorded — the API default. */
export const ASSUMED_CACHE_TTL = "5m";

/**
 * US dollars per million tokens, per model, per period.
 *
 * `from` is inclusive, `until` exclusive; `until: null` means "still current". Periods are listed
 * oldest first and must not overlap.
 */
export const RATES = {
  "claude-fable-5": [{ from: null, until: null, input: 10, output: 50 }],
  "claude-fable-5-1": [{ from: null, until: null, input: 10, output: 50 }],
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
const q = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Price one bundle of token counts at one model's rate.
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
 * Price a run's `billed` block — the transcript sum, per model, with the TTL split honoured.
 *
 * Returns `{ usd, models, rates_as_of, assumed_ttl_tokens }` or `{ usd: null, reason }`. The reasons
 * are the three honest ways a measured run can still have no price: a model absent from the table, a
 * speed other than `standard`, or no start date to choose a rate period by. `assumed_ttl_tokens` is the
 * count of cache-write tokens whose TTL the transcript did not record and which were priced at the
 * 5-minute rate; zero on every transcript observed so far.
 */
export function priceBilled(billed, at) {
  if (!billed || typeof billed !== "object") return { usd: null, reason: "no_billed_block" };
  if (billed.speed && billed.speed !== "standard") return { usd: null, reason: `speed:${billed.speed}` };
  const byModel = billed.by_model && typeof billed.by_model === "object" ? billed.by_model : null;
  if (!byModel || Object.keys(byModel).length === 0) return { usd: null, reason: "no_model_split" };

  let usd = 0;
  let assumedTtlTokens = 0;
  const models = [];
  for (const [model, t] of Object.entries(byModel)) {
    const rate = rateFor(model, at);
    if (!rate) {
      const known = normalizeModel(model) !== null;
      return { usd: null, reason: known ? "no_start_date" : `unknown_model:${model}` };
    }
    const unknownTtl = q(t.cache_write_unknown_ttl);
    assumedTtlTokens += unknownTtl;
    usd +=
      q(t.input) * perToken(rate.input) +
      q(t.output) * perToken(rate.output) +
      q(t.cache_read) * perToken(rate.input * CACHE_READ_MULTIPLIER) +
      q(t.cache_write_5m) * perToken(rate.input * CACHE_WRITE_MULTIPLIER["5m"]) +
      q(t.cache_write_1h) * perToken(rate.input * CACHE_WRITE_MULTIPLIER["1h"]) +
      unknownTtl * perToken(rate.input * CACHE_WRITE_MULTIPLIER[ASSUMED_CACHE_TTL]);
    models.push(rate.model);
  }
  return { usd, models, rates_as_of: RATES_AS_OF, assumed_ttl_tokens: assumedTtlTokens, scope: "run_list_price" };
}

/**
 * Price one legacy record's final-turn block.
 *
 * THE RESULT IS THE PRICE OF THE RECORD'S FINAL MESSAGE. It exists for rows written before the
 * transcript measure, is named `end_context_usd` everywhere it is stored or printed, and is never to be
 * presented as what the run cost.
 */
export function priceRow(record) {
  const tokens = record?.end_context ?? record?.tokens ?? null;
  if (!tokens) return null;
  return priceTokens(tokens, record?.model ?? null, record?.started_at ?? null);
}

/**
 * `$7.38` at cent precision once a figure reaches a cent, `$0.0042` below it, `<$0.0001` for a figure
 * too small to render at all without reading as zero.
 */
export function formatUsd(usd) {
  if (typeof usd !== "number" || !Number.isFinite(usd)) return "—";
  if (usd > 0 && usd < 0.0001) return "<$0.0001";
  if (usd >= 0.01) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}
