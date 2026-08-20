#!/usr/bin/env node
/**
 * The subagent lifecycle hook — one script, three modes.
 *
 * Claude Code records the cost of every subagent run in the tool result the harness writes to the
 * session transcript — `totalTokens`, `usage`, `totalDurationMs`, `totalToolUseCount`, `toolStats`.
 * That object never reaches the model: an agent cannot measure itself, and the caller only ever sees
 * the agent's text. This hook closes that gap from the outside.
 *
 *   --pre     PreToolUse         records that a run was launched, with a measured start time
 *   --post    PostToolUse        records what it cost, and clears the launch record
 *   --failed  PostToolUseFailure records that it was interrupted or failed, and clears the same
 *
 * WHY THREE. A `PostToolUse` hook cannot fire for a run that never completed, so on its own it
 * cannot distinguish "no agent ran" from "an agent ran and the session was killed underneath it".
 * The pre-record is what survives that: an unreconciled launch is an interrupted run, and the report
 * prints it as one. `--failed` is the common case of the same thing — an interrupt is an event, not
 * an absence, and it arrives with a real duration attached.
 *
 * Records are correlated by `tool_use_id`, which every one of the three payloads carries and which
 * is unique per tool call. Two streams launched in parallel therefore never collide, whether or not
 * they happen to be different agents.
 *
 * WHAT IS STILL NOT CAPTURED, and no hook design can capture:
 *   - the tokens an interrupted agent spent. The harness computes `totalTokens` when the subagent
 *     stops; one that never stops never produces one. The report says `unavailable` rather than a
 *     plausible figure.
 *   - a kill in the window between the launch and this hook writing its pre-record. Milliseconds
 *     wide, and unrecoverable by construction: a hook cannot record an event that precedes it.
 *   - THE RUN'S CUMULATIVE TOKEN SPEND. `result.usage` is one message's usage, not a sum over the
 *     run: `usage.iterations` is a single-element array identical to it, and `result.totalTokens`
 *     equals that one message's four figures added up. A record showing 115 tool calls against 1,214
 *     output tokens is not a cheap agent, it is the last turn of an expensive one. So the block is
 *     named `end_context` — what the agent was carrying when it stopped — and the honest measure of
 *     how much work a run did is `tool_uses`, which is a true count over the whole run. Calling the
 *     old `tokens` block a cost is what made a 208-second reclassify of two scenarios look like a
 *     bargain. See `metrics-report.mjs`, which prints both and labels them apart.
 *
 * NEVER FAILS A TOOL CALL. Every path exits 0. But silence is no longer one of the paths: every
 * early return writes a line to `.workflow/metrics/_diagnostics.jsonl` saying which one it was. The
 * previous version returned silently on four different conditions and wrapped everything in an empty
 * `catch {}`, which is why nobody noticed it had never written a single record.
 *
 * The tool-name guard was the fifth such condition and outlived the other four. It compared against
 * the literal `"Task"` and returned without a diagnostic, on the reasoning that the matcher upstream
 * had already filtered — so when the harness renamed the tool to `Agent`, the matcher stopped matching
 * and the guard stopped accepting, and the log stayed empty with nothing anywhere saying why. Both
 * names are accepted now, from a list the tests check the matcher against, and an unrecognised tool
 * carrying a subagent-shaped payload writes a diagnostic instead of vanishing.
 */

import { appendFileSync, mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import {
  resolveProjectDir,
  metricsDir,
  metricsFile,
  pendingDir,
  pendingFile,
  diagnosticsFile,
} from "./lib/paths.mjs";
import { isSubagentTool, looksLikeSubagentLaunch } from "./lib/subagent-tools.mjs";
import { parseRunMode, promptChars } from "./lib/run-mode.mjs";
import { LIVE_STATUSES } from "../../scripts/workflow-state.mjs";

const TICKET_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;
const UNASSIGNED = "unassigned";
const DIAGNOSTICS_CAP = 200;
const DIAGNOSTICS_KEEP = 100;

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/**
 * Say why nothing was recorded. Its own try/catch, and capped — a hook must not grow a log without
 * limit, and a diagnostics write that failed must not become the reason a tool call fails.
 */
function writeDiag(projectDir, entry) {
  try {
    const file = diagnosticsFile(projectDir);
    mkdirSync(path.dirname(file), { recursive: true });
    let lines = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter((l) => l.trim()) : [];
    lines.push(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
    if (lines.length > DIAGNOSTICS_CAP) lines = lines.slice(-DIAGNOSTICS_KEEP);
    writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
  } catch {
    /* a diagnostic that cannot be written is not worth failing a run over */
  }
}

function bail(projectDir, reason, payload, extra = {}) {
  writeDiag(projectDir, {
    reason,
    mode: extra.mode ?? null,
    tool_name: payload?.tool_name ?? null,
    tool_use_id: payload?.tool_use_id ?? null,
    payload_keys: payload && typeof payload === "object" ? Object.keys(payload) : [],
    result_keys:
      payload?.tool_response && typeof payload.tool_response === "object"
        ? Object.keys(payload.tool_response)
        : [],
    ...extra,
  });
}

/** The harness may hand the result back as the object, as `{ toolUseResult }`, or as raw content. */
function resolveResult(payload) {
  const candidates = [payload?.tool_response, payload?.toolUseResult, payload?.tool_result];
  for (const c of candidates) {
    if (c && typeof c === "object" && !Array.isArray(c) && ("totalTokens" in c || "usage" in c)) return c;
  }
  return null;
}

/**
 * A response object under any of the same keys, cost or no cost. `resolveResult` deliberately accepts
 * only a *costed* result; this is how the post hook can still tell "the harness sent nothing" from
 * "the harness sent something that has no cost in it yet", which are different events.
 */
function anyResponse(payload) {
  for (const c of [payload?.tool_response, payload?.toolUseResult, payload?.tool_result]) {
    if (c && typeof c === "object" && !Array.isArray(c)) return c;
  }
  return null;
}

/**
 * A background launch, not a finished run.
 *
 * An agent started with `run_in_background` returns from the tool call immediately, so `PostToolUse`
 * fires on the *launch* and the response carries `isAsync`, an `outputFile` and no cost at all — the
 * agent is still running. The real completion arrives later as a task notification, which is not a
 * tool call and fires no hook.
 *
 * This cost three whole runs on SCRUM-132 and left `no_result` as the only trace. Two things were
 * wrong and both are fixed: the bail did not distinguish this from a missing payload, and — the part
 * that actually destroyed the record — the launch record had already been consumed by the time the
 * bail ran, so nothing was left for the report to reconcile. An async launch now keeps its pending
 * record, and the report surfaces it as an uncosted run rather than as nothing at all.
 */
function isAsyncLaunch(response) {
  return Boolean(response && response.isAsync === true);
}

/**
 * Fallback: the transcript has it. Only the entry for *this* tool call, though — taking the last
 * `totalTokens` in the file would file the previous agent's cost under this agent's name, because at
 * PostToolUse time the current result has not necessarily been flushed yet.
 */
function resultFromTranscript(transcriptPath, toolUseId) {
  if (!transcriptPath || !toolUseId || !existsSync(transcriptPath)) return null;
  for (const line of readFileSync(transcriptPath, "utf8").split("\n")) {
    if (!line.includes("totalTokens") || !line.includes(toolUseId)) continue;
    try {
      const entry = JSON.parse(line);
      const r = entry?.toolUseResult;
      const id =
        entry?.tool_use_id ??
        entry?.toolUseID ??
        entry?.message?.content?.find?.((c) => c?.tool_use_id)?.tool_use_id;
      if (r && typeof r === "object" && "totalTokens" in r && (!id || id === toolUseId)) return r;
    } catch {
      /* partial write, ignore */
    }
  }
  return null;
}

/**
 * The hook is not told which ticket is in flight. The orchestrator names it in every prompt it
 * sends, so the prompt is the primary source; an active state file is the fallback.
 *
 * The state-file regex is anchored, because an unanchored one also matches `review_status:` and any
 * prose inside a `last_findings` block — and those blocks run to thousands of characters. The status
 * list comes from the schema rather than being retyped here, so a state sitting on `escalated` or
 * `blocked` is still recognised as a live run.
 */
function resolveTicket(payload, projectDir) {
  const fromPrompt = String(payload?.tool_input?.prompt ?? "").match(TICKET_RE);
  if (fromPrompt) return { ticket: fromPrompt[1], source: "prompt" };

  const fromDesc = String(payload?.tool_input?.description ?? "").match(TICKET_RE);
  if (fromDesc) return { ticket: fromDesc[1], source: "description" };

  try {
    const workflowDir = path.join(projectDir, ".workflow");
    const live = new RegExp(`^status:\\s*(${LIVE_STATUSES.join("|")})\\b`, "m");
    const states = readdirSync(workflowDir)
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => ({ f, m: readFileSync(path.join(workflowDir, f), "utf8") }))
      .filter((s) => live.test(s.m));
    if (states.length === 1) return { ticket: path.basename(states[0].f, ".yaml"), source: "state_file" };
  } catch {
    /* no state yet */
  }
  return { ticket: UNASSIGNED, source: "unresolved" };
}

function countLines(file) {
  if (!existsSync(file)) return 0;
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim()).length;
}

function agentName(payload, result) {
  return result?.agentType ?? payload?.tool_input?.subagent_type ?? "unknown";
}

/**
 * The prompt the delegation was launched with.
 *
 * `tool_input.prompt` is what the caller sent and is present on all three payloads; the result object
 * echoes it back as `result.prompt`, which is the fallback for a post that arrives without its input.
 * Either one is the same text, so whichever is present answers both the mode and the size question.
 */
function launchPrompt(payload, result = null) {
  const fromInput = payload?.tool_input?.prompt;
  if (typeof fromInput === "string" && fromInput) return fromInput;
  const fromResult = result?.prompt;
  return typeof fromResult === "string" ? fromResult : "";
}

/** The launch record for one tool call, or null when there is none (an unhooked or lost pre). */
function takePending(projectDir, toolUseId) {
  if (!toolUseId) return null;
  const file = pendingFile(projectDir, toolUseId);
  if (!existsSync(file)) return null;
  try {
    const pending = JSON.parse(readFileSync(file, "utf8"));
    unlinkSync(file);
    return pending;
  } catch {
    try {
      unlinkSync(file);
    } catch {
      /* it will be reconciled by the report instead */
    }
    return null;
  }
}

/**
 * Flag a launch record as a background run whose cost the post hook could not see.
 *
 * The record stays where it is — the point is that it survives — and gains a marker so the report can
 * call it what it is instead of filing it under `interrupted`, which would be a different and false
 * claim about a run that may well have finished perfectly.
 */
function markPendingAsync(projectDir, toolUseId) {
  if (!toolUseId) return;
  const file = pendingFile(projectDir, toolUseId);
  if (!existsSync(file)) return;
  try {
    const pending = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(file, JSON.stringify({ ...pending, async: true }), "utf8");
  } catch {
    /* an unreadable pending record is reconciled as an interrupt, which is the safer of the two */
  }
}

function appendRecord(projectDir, ticket, record) {
  const file = metricsFile(projectDir, ticket);
  mkdirSync(metricsDir(projectDir), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ seq: countLines(file) + 1, ...record })}\n`, "utf8");
  return file;
}

function emit(line) {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: line } }),
  );
}

// ---------------------------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------------------------

function runPre(payload, projectDir) {
  const { ticket, source } = resolveTicket(payload, projectDir);
  const toolUseId = payload?.tool_use_id;
  if (!toolUseId) {
    bail(projectDir, "no_tool_use_id", payload, { mode: "pre" });
    return;
  }
  const prompt = launchPrompt(payload);
  mkdirSync(pendingDir(projectDir), { recursive: true });
  writeFileSync(
    pendingFile(projectDir, toolUseId),
    JSON.stringify({
      tool_use_id: toolUseId,
      ticket,
      ticket_source: source,
      agent: agentName(payload, null),
      description: payload?.tool_input?.description ?? "",
      // Read at launch, so an interrupted run is still recorded with the mode it was launched in —
      // which is the run you most want to know the mode of.
      run_mode: parseRunMode(prompt),
      prompt_chars: promptChars(prompt),
      started_at: new Date().toISOString(),
      session_id: payload?.session_id ?? null,
    }),
    "utf8",
  );
  // No stdout: a launch is not news, and PreToolUse output would land ahead of the agent's own.
}

function runPost(payload, projectDir) {
  const toolUseId = payload?.tool_use_id;
  const result = resolveResult(payload) ?? resultFromTranscript(payload?.transcript_path, toolUseId);

  // The launch record is consumed only once there is something to write in its place. It used to be
  // taken first, which meant every bail below destroyed the one artefact that would have let the
  // report say a run had happened — the launch vanished along with the cost.
  if (!result) {
    const response = anyResponse(payload);
    const async = isAsyncLaunch(response);
    if (async) markPendingAsync(projectDir, toolUseId);
    bail(projectDir, async ? "async_launch_no_cost" : "no_result", payload, {
      mode: "post",
      had_pending: existsSync(pendingFile(projectDir, toolUseId ?? "")),
      response_status: response?.status ?? null,
    });
    return;
  }

  const pending = takePending(projectDir, toolUseId);

  const usage = result.usage ?? {};
  const durationMs = result.totalDurationMs ?? payload?.duration_ms ?? 0;
  const finishedAt = new Date();
  const { ticket, source } = pending
    ? { ticket: pending.ticket, source: pending.ticket_source }
    : resolveTicket(payload, projectDir);

  // The launch record already read both; re-read only when there is none, so a post that arrives
  // without its pre still carries them.
  const prompt = pending ? null : launchPrompt(payload, result);
  const runMode = pending?.run_mode ?? parseRunMode(prompt);
  const chars = pending?.prompt_chars ?? promptChars(prompt);

  // `usage.iterations` has been a single-element array in every payload observed, which is the
  // evidence that `usage` describes one message rather than the run. Recording its length means a
  // harness that starts returning the whole run shows up as a number greater than 1 instead of
  // silently changing what every figure below means.
  const usageMessages = Array.isArray(usage.iterations) ? usage.iterations.length : null;

  // Measured at launch when the pre-hook ran; derived from the duration only as a fallback. The
  // derived form silently excludes queueing and the caller's own turn, so it understates elapsed time.
  const startedAt = pending?.started_at ?? new Date(finishedAt.getTime() - durationMs).toISOString();

  const record = {
    ticket,
    ticket_source: source,
    tool_use_id: toolUseId ?? null,
    agent: agentName(payload, result),
    description: payload?.tool_input?.description ?? "",
    run_mode: runMode,
    prompt_chars: chars,
    status: result.status ?? "unknown",
    model: result.resolvedModel ?? null,
    started_at: startedAt,
    started_at_measured: Boolean(pending?.started_at),
    finished_at: finishedAt.toISOString(),
    duration_ms: durationMs,
    // NOT the run's cost. These are the final message's figures — see the header. `end_context.total`
    // is how much context this agent was carrying when it stopped, which is the right number for
    // "how heavy is this agent's prompt" and the wrong one for "what did this run spend".
    end_context: {
      total: result.totalTokens ?? 0,
      input: usage.input_tokens ?? 0,
      output: usage.output_tokens ?? 0,
      cache_read: usage.cache_read_input_tokens ?? 0,
      cache_creation: usage.cache_creation_input_tokens ?? 0,
      scope: "final_turn",
      messages: usageMessages,
    },
    // Retained under its old name so records written before this change and records written after it
    // read the same way to every existing consumer. Same object; the honest name is above.
    tokens: {
      total: result.totalTokens ?? 0,
      input: usage.input_tokens ?? 0,
      output: usage.output_tokens ?? 0,
      cache_read: usage.cache_read_input_tokens ?? 0,
      cache_creation: usage.cache_creation_input_tokens ?? 0,
    },
    tool_uses: result.totalToolUseCount ?? 0,
    tool_stats: result.toolStats ?? {},
    agent_id: result.agentId ?? null,
    session_id: payload?.session_id ?? null,
  };

  appendRecord(projectDir, ticket, record);
  if (ticket === UNASSIGNED) {
    bail(projectDir, "ticket_unresolved", payload, { mode: "post", agent: record.agent });
  }

  const t = record.tokens;
  const seq = countLines(metricsFile(projectDir, ticket));
  // `end_context=` rather than `tokens_total=`: the orchestrator folds this line into `history`
  // verbatim, so the label it reads is the label that ends up in the state file.
  emit(
    `AGENT_RUN_METRICS: seq=${seq} ticket=${ticket} agent=${record.agent} ` +
      `mode=${record.run_mode} status=${record.status} model=${record.model} ` +
      `duration=${(durationMs / 1000).toFixed(1)}s ` +
      `end_context=${t.total} in=${t.input} out=${t.output} cache_read=${t.cache_read} ` +
      `cache_write=${t.cache_creation} tool_uses=${record.tool_uses} ` +
      `prompt_chars=${record.prompt_chars ?? "unavailable"} log=.workflow/metrics/${ticket}.jsonl`,
  );
}

function runFailed(payload, projectDir) {
  const toolUseId = payload?.tool_use_id;
  const pending = takePending(projectDir, toolUseId);
  const { ticket, source } = pending
    ? { ticket: pending.ticket, source: pending.ticket_source }
    : resolveTicket(payload, projectDir);

  const durationMs = payload?.duration_ms ?? null;
  const finishedAt = new Date();
  const status = payload?.is_interrupt ? "interrupted" : payload?.is_timeout ? "timed_out" : "failed";

  const record = {
    ticket,
    ticket_source: source,
    tool_use_id: toolUseId ?? null,
    agent: pending?.agent ?? agentName(payload, null),
    description: payload?.tool_input?.description ?? pending?.description ?? "",
    run_mode: pending?.run_mode ?? parseRunMode(launchPrompt(payload)),
    prompt_chars: pending?.prompt_chars ?? promptChars(launchPrompt(payload)),
    status,
    model: null,
    started_at:
      pending?.started_at ??
      (durationMs === null ? null : new Date(finishedAt.getTime() - durationMs).toISOString()),
    started_at_measured: Boolean(pending?.started_at),
    finished_at: finishedAt.toISOString(),
    duration_ms: durationMs,
    // An agent that never stopped never produced a token count. Recording zero would read as free.
    end_context: null,
    tokens: null,
    tool_uses: null,
    error: payload?.error ?? null,
    error_type: payload?.error_type ?? null,
    session_id: payload?.session_id ?? null,
  };

  appendRecord(projectDir, ticket, record);
  const seq = countLines(metricsFile(projectDir, ticket));
  emit(
    `AGENT_RUN_METRICS: seq=${seq} ticket=${ticket} agent=${record.agent} ` +
      `mode=${record.run_mode} status=${status} ` +
      `duration=${durationMs === null ? "unavailable" : `${(durationMs / 1000).toFixed(1)}s`} ` +
      `end_context=unavailable log=.workflow/metrics/${ticket}.jsonl`,
  );
}

function main() {
  const mode = process.argv.includes("--pre")
    ? "pre"
    : process.argv.includes("--failed")
      ? "failed"
      : "post";

  const raw = readStdin();
  if (!raw.trim()) {
    bail(resolveProjectDir(null), "no_stdin", null, { mode });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    bail(resolveProjectDir(null), "bad_json", null, { mode, bytes: raw.length });
    return;
  }

  const projectDir = resolveProjectDir(payload);
  if (!isSubagentTool(payload?.tool_name)) {
    // A broad matcher legitimately delivers other tools, and those are not news. A payload shaped
    // like a subagent launch under a name this hook does not know is news: it means the wiring has
    // rotted underneath us, which is the failure this guard used to cause rather than report.
    if (looksLikeSubagentLaunch(payload)) {
      bail(projectDir, "unrecognised_subagent_tool", payload, { mode });
    }
    return;
  }

  if (mode === "pre") runPre(payload, projectDir);
  else if (mode === "failed") runFailed(payload, projectDir);
  else runPost(payload, projectDir);
}

try {
  main();
} catch (err) {
  // Metrics are never worth failing a run over — but a throw that leaves no trace is how this
  // script spent its entire life believing it worked.
  bail(resolveProjectDir(null), "threw", null, {
    message: String(err?.message ?? err),
    stack: String(err?.stack ?? "").split("\n").slice(0, 3).join(" | "),
  });
}
process.exit(0);
