#!/usr/bin/env node
/**
 * PostToolUse hook for the `Task` tool.
 *
 * Claude Code records the cost of every subagent run in the tool result the harness writes to the
 * session transcript — `totalTokens`, `usage`, `totalDurationMs`, `totalToolUseCount`, `toolStats`.
 * That object never reaches the model: an agent cannot measure itself, and the caller only ever sees
 * the agent's text. This hook closes that gap from the outside.
 *
 * It does two things per subagent run:
 *   1. Appends one JSON line to `.workflow/metrics/<TICKET-ID>.jsonl`, so the whole run can be
 *      aggregated later even across sessions and resumes.
 *   2. Returns the same numbers as `additionalContext`, so the line lands in the transcript directly
 *      after the agent's own output and the orchestrator can read it without opening a file.
 *
 * Never fails a tool call: any error exits 0 with no output.
 */

import { appendFileSync, mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const TICKET_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** The harness may hand the result back as the object, as `{ toolUseResult }`, or as raw content. */
function resolveResult(payload) {
  const candidates = [payload?.tool_response, payload?.toolUseResult, payload?.tool_result];
  for (const c of candidates) {
    if (c && typeof c === 'object' && !Array.isArray(c) && ('totalTokens' in c || 'usage' in c)) return c;
  }
  return null;
}

/** Fallback: the transcript always has it. Take the last Task result written. */
function resultFromTranscript(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  let found = null;
  for (const line of readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.includes('totalTokens')) continue;
    try {
      const entry = JSON.parse(line);
      const r = entry?.toolUseResult;
      if (r && typeof r === 'object' && 'totalTokens' in r) found = r;
    } catch {
      /* partial write, ignore */
    }
  }
  return found;
}

/**
 * The hook is not told which ticket is in flight. The orchestrator names it in every prompt it sends,
 * so the prompt is the primary source; an active state file is the fallback.
 */
function resolveTicket(payload, projectDir) {
  const prompt = payload?.tool_input?.prompt ?? '';
  const fromPrompt = String(prompt).match(TICKET_RE);
  if (fromPrompt) return fromPrompt[1];

  const desc = String(payload?.tool_input?.description ?? '').match(TICKET_RE);
  if (desc) return desc[1];

  try {
    const workflowDir = path.join(projectDir, '.workflow');
    const states = readdirSync(workflowDir)
      .filter((f) => f.endsWith('.yaml'))
      .map((f) => ({ f, m: readFileSync(path.join(workflowDir, f), 'utf8') }))
      .filter((s) => /status:\s*(in_progress|paused)\b/.test(s.m));
    if (states.length === 1) return path.basename(states[0].f, '.yaml');
  } catch {
    /* no state yet */
  }
  return 'unassigned';
}

function countLines(file) {
  if (!existsSync(file)) return 0;
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).length;
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) return;

  const payload = JSON.parse(raw);
  if (payload?.tool_name !== 'Task') return;

  const projectDir = payload?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const result = resolveResult(payload) ?? resultFromTranscript(payload?.transcript_path);
  if (!result) return;

  const usage = result.usage ?? {};
  const durationMs = result.totalDurationMs ?? 0;
  const finishedAt = new Date();
  const ticket = resolveTicket(payload, projectDir);

  const metricsDir = path.join(projectDir, '.workflow', 'metrics');
  mkdirSync(metricsDir, { recursive: true });
  const metricsFile = path.join(metricsDir, `${ticket}.jsonl`);
  const seq = countLines(metricsFile) + 1;

  const record = {
    seq,
    ticket,
    agent: result.agentType ?? payload?.tool_input?.subagent_type ?? 'unknown',
    description: payload?.tool_input?.description ?? '',
    status: result.status ?? 'unknown',
    model: result.resolvedModel ?? null,
    started_at: new Date(finishedAt.getTime() - durationMs).toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: durationMs,
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

  appendFileSync(metricsFile, `${JSON.stringify(record)}\n`, 'utf8');

  const t = record.tokens;
  const line =
    `AGENT_RUN_METRICS: seq=${record.seq} ticket=${record.ticket} agent=${record.agent} ` +
    `status=${record.status} model=${record.model} duration=${(durationMs / 1000).toFixed(1)}s ` +
    `tokens_total=${t.total} in=${t.input} out=${t.output} cache_read=${t.cache_read} ` +
    `cache_write=${t.cache_creation} tool_uses=${record.tool_uses} log=.workflow/metrics/${ticket}.jsonl`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: line },
    })
  );
}

try {
  main();
} catch {
  /* metrics are never worth failing a run over */
}
process.exit(0);
