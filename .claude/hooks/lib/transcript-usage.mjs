/**
 * The run's real cost, read off the subagent's own transcript.
 *
 * WHY THE TRANSCRIPT. Nothing the harness hands a hook describes a whole run. The `PostToolUse`
 * response for a subagent carries one message's `usage` — the final turn's context — and a background
 * launch carries no usage at all, because the tool call returns before the agent has done anything.
 * The task notification that announces a background completion is not a tool call and fires no hook,
 * and its `subagent_tokens` figure turns out to be the same final-turn context under another name.
 *
 * What the harness does write, for every subagent, is the agent's own transcript:
 * `~/.claude/projects/<slug>/<session_id>/subagents/agent-<agentId>.jsonl`, one line per content
 * block, each `assistant` line carrying `message.usage` for the API call that produced it, with the
 * input / output / cache-read / cache-write split, the cache TTL split, the service tier and the speed,
 * plus `message.model` and a timestamp. Summed over the run's API calls that is the bill — the number
 * every earlier version of this machinery declared uncapturable.
 *
 * TWO THINGS THAT MAKE THE SUM WRONG IF FORGOTTEN:
 *   - The transcript writes one line per content block, and every block of the same message repeats
 *     the message's `usage`. Summing lines triples the figure. Usage is summed once per `message.id`,
 *     taking the record with the largest `output_tokens`, since a streamed message's early lines can
 *     carry a partial count.
 *   - Tool uses are counted over lines, not messages — each `tool_use` block is its own line, and
 *     that count matches the harness's own `tool_uses` exactly.
 *
 * THE JOIN. A sibling `agent-<agentId>.meta.json` carries `toolUseId`, so a row that recorded only its
 * `tool_use_id` (every row written before this module existed) can still find its transcript. The
 * `agentId` itself arrives on the async-launch response as `agentId`, which the hook now records.
 *
 * Nothing here estimates. A transcript that is not on this machine yields `null`, and the caller says
 * so — the cost existed, it is simply not observable from here.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

/** Where Claude Code keeps per-project session data. `CLAUDE_CONFIG_DIR` overrides the default. */
export function claudeProjectsDir() {
  const cfg = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  return path.join(cfg, "projects");
}

function safeReaddir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function readMeta(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Find the transcript for one run.
 *
 * By `agentId` when the row has one; by `toolUseId` through the sibling `.meta.json` otherwise. The
 * session id narrows the search to one directory per project slug, so a machine with many projects is
 * not scanned. Returns `{ transcript, agentId, meta }` or `null`.
 */
export function locateTranscript({ sessionId, agentId = null, toolUseId = null, projectsDir = claudeProjectsDir() }) {
  if (!sessionId || !existsSync(projectsDir)) return null;
  for (const slug of safeReaddir(projectsDir)) {
    const dir = path.join(projectsDir, slug, sessionId, "subagents");
    if (!existsSync(dir)) continue;
    if (agentId) {
      const transcript = path.join(dir, `agent-${agentId}.jsonl`);
      if (existsSync(transcript)) {
        return { transcript, agentId, meta: readMeta(path.join(dir, `agent-${agentId}.meta.json`)) };
      }
    }
    if (toolUseId) {
      for (const name of safeReaddir(dir)) {
        if (!name.endsWith(".meta.json")) continue;
        const meta = readMeta(path.join(dir, name));
        if (meta?.toolUseId !== toolUseId) continue;
        const id = name.slice("agent-".length, -".meta.json".length);
        const transcript = path.join(dir, `agent-${id}.jsonl`);
        if (existsSync(transcript)) return { transcript, agentId: id, meta };
      }
    }
  }
  return null;
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Sum one transcript into a `billed` block, or `null` when the file cannot be read or holds no usage.
 *
 * `by_model` keeps the split per model so a run that switched models is priced per call rather than
 * at one rate; `model` is the single model when there was one, `"mixed"` otherwise. `complete` is read
 * off the last assistant message's `stop_reason` — `end_turn` means the agent finished of its own
 * accord, anything else means the transcript ends mid-run.
 */
export function summarizeTranscript(file) {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return null;
  }

  const byMessage = new Map();
  const modelOf = new Map();
  let toolUses = 0;
  let first = null;
  let last = null;
  let lastStop = null;
  // How the transcript ends. An agent that finished writes a final assistant text block; one that was
  // killed leaves a `tool_use` block, or a tool result, as its last line. `stop_reason` alone cannot
  // say — older harness builds wrote `null` on the final block where newer ones write `end_turn`.
  let lastLine = null;
  const speeds = new Set();
  const tiers = new Set();

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      continue; // a torn line is a line, not a reason to lose the run
    }
    const t = Date.parse(r?.timestamp ?? "");
    if (Number.isFinite(t)) {
      if (first === null || t < first) first = t;
      if (last === null || t > last) last = t;
    }
    if (r?.type === "user") lastLine = { type: "user" };
    if (r?.type !== "assistant" || !r.message) continue;
    const m = r.message;
    const blocks = Array.isArray(m.content) ? m.content : [];
    toolUses += blocks.filter((b) => b?.type === "tool_use").length;
    if (m.stop_reason) lastStop = m.stop_reason;
    lastLine = { type: "assistant", block: blocks.at(-1)?.type ?? null, stop: m.stop_reason ?? null };
    if (m.usage && m.id) {
      const prev = byMessage.get(m.id);
      if (!prev || num(m.usage.output_tokens) > num(prev.output_tokens)) byMessage.set(m.id, m.usage);
      if (m.model) modelOf.set(m.id, m.model);
    }
  }

  if (byMessage.size === 0) return null;

  const empty = () => ({
    api_calls: 0,
    input: 0,
    output: 0,
    cache_read: 0,
    cache_write: 0,
    cache_write_5m: 0,
    cache_write_1h: 0,
    cache_write_unknown_ttl: 0,
  });
  const add = (acc, u) => {
    acc.api_calls += 1;
    acc.input += num(u.input_tokens);
    acc.output += num(u.output_tokens);
    acc.cache_read += num(u.cache_read_input_tokens);
    const write = num(u.cache_creation_input_tokens);
    acc.cache_write += write;
    const split = u.cache_creation;
    if (split && typeof split === "object") {
      acc.cache_write_5m += num(split.ephemeral_5m_input_tokens);
      acc.cache_write_1h += num(split.ephemeral_1h_input_tokens);
    } else {
      acc.cache_write_unknown_ttl += write;
    }
    if (u.speed) speeds.add(u.speed);
    if (u.service_tier) tiers.add(u.service_tier);
  };

  const total = empty();
  const byModel = {};
  for (const [id, u] of byMessage) {
    add(total, u);
    const model = modelOf.get(id) ?? "unknown";
    byModel[model] ??= empty();
    add(byModel[model], u);
  }

  const one = (set) => (set.size === 1 ? [...set][0] : set.size === 0 ? null : "mixed");
  const models = Object.keys(byModel);
  return {
    scope: "run",
    source: "subagent_transcript",
    transcript: file,
    ...total,
    total: total.input + total.output + total.cache_read + total.cache_write,
    tool_uses: toolUses,
    by_model: byModel,
    model: models.length === 1 ? models[0] : "mixed",
    speed: one(speeds),
    service_tier: one(tiers),
    started_at: first === null ? null : new Date(first).toISOString(),
    finished_at: last === null ? null : new Date(last).toISOString(),
    duration_ms: first === null || last === null ? null : last - first,
    last_stop_reason: lastStop,
    complete:
      lastLine?.type === "assistant" &&
      lastLine.block === "text" &&
      (lastLine.stop === null || lastLine.stop === "end_turn" || lastLine.stop === "stop_sequence"),
  };
}

/** Locate and summarize in one step. `null` when either half fails. */
export function billedForRun(args) {
  const found = locateTranscript(args);
  if (!found) return null;
  const billed = summarizeTranscript(found.transcript);
  if (!billed) return null;
  return { ...billed, agent_id: found.agentId, request_shape: found.meta?.requestShape ?? null };
}
