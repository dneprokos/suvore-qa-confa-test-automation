/**
 * Tests for .claude/hooks/agent-metrics.mjs and .claude/hooks/metrics-report.mjs.
 *
 * The hooks live under .claude/ because that is harness wiring rather than something an agent runs,
 * but their tests belong with every other script test, so this file reaches across. Each case spawns
 * the hook the way the harness does — a JSON payload on stdin — and asserts on the files it wrote.
 *
 * Every case runs against a temporary project directory, never the repository's own `.workflow/`.
 *
 * THE TEST THAT SHOULD HAVE EXISTED FIRST is "a completed Task writes one record". This hook shipped
 * with no coverage at all and, as it turned out, had never written a single record in production —
 * a condition no amount of reading the code revealed, because the code was right and the wiring was
 * not. Every case here asserts on an observable file, not on a return value.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { SUBAGENT_TOOLS } from "../../.claude/hooks/lib/subagent-tools.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const hook = join(repoRoot, ".claude", "hooks", "agent-metrics.mjs");
const report = join(repoRoot, ".claude", "hooks", "metrics-report.mjs");

/** A throwaway project root, marked with a `.git` entry so the repo-root walk stops there. */
function project() {
  const dir = mkdtempSync(join(tmpdir(), "agent-metrics-"));
  writeFileSync(join(dir, ".git"), "gitdir: irrelevant\n", "utf8");
  return dir;
}

/**
 * A PostToolUse payload for a completed Task. The `tool_response` keys are the ones the harness
 * actually writes for the Task tool — the same object the transcript stores as `toolUseResult`.
 */
function completedPayload(dir, overrides = {}) {
  return {
    session_id: "sess-1",
    transcript_path: join(dir, "transcript.jsonl"),
    cwd: dir,
    hook_event_name: "PostToolUse",
    tool_name: "Task",
    tool_use_id: "toolu_01",
    tool_input: {
      subagent_type: "qa-scenario-generator",
      description: "Generate scenarios",
      prompt: "ticket_id: SCRUM-777\nrequirements_path: requirements/SCRUM-777-requirements.md",
    },
    tool_response: {
      status: "completed",
      agentId: "agent_1",
      agentType: "qa-scenario-generator",
      resolvedModel: "claude-opus-5",
      totalDurationMs: 109_000,
      totalTokens: 63_563,
      totalToolUseCount: 26,
      usage: {
        input_tokens: 2,
        output_tokens: 5872,
        cache_read_input_tokens: 50_682,
        cache_creation_input_tokens: 7007,
      },
      toolStats: { Read: 12 },
    },
    duration_ms: 109_500,
    ...overrides,
  };
}

function fire(dir, mode, payload) {
  const result = spawnSync(process.execPath, [hook, mode], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  assert.equal(result.error, undefined, `failed to spawn: ${result.error?.message}`);
  // Never failing a tool call is the headline promise; it belongs in every case, not one of them.
  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);
  return result;
}

function runReport(dir, ...args) {
  const result = spawnSync(process.execPath, [report, ...args], {
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  assert.equal(result.error, undefined, `failed to spawn: ${result.error?.message}`);
  return result;
}

const records = (dir, ticket) => {
  const file = join(dir, ".workflow", "metrics", `${ticket}.jsonl`);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
};

const diagnostics = (dir) => {
  const file = join(dir, ".workflow", "metrics", "_diagnostics.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
};

const pending = (dir) => {
  const dirPath = join(dir, ".workflow", "metrics", "pending");
  return existsSync(dirPath) ? readdirSync(dirPath) : [];
};

test("a completed Task writes exactly one record, filed under the ticket in its prompt", () => {
  const dir = project();
  const { stdout } = fire(dir, "--post", completedPayload(dir));

  const rows = records(dir, "SCRUM-777");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].seq, 1);
  assert.equal(rows[0].agent, "qa-scenario-generator");
  assert.equal(rows[0].tokens.total, 63_563);
  assert.equal(rows[0].tokens.cache_read, 50_682);
  assert.equal(rows[0].duration_ms, 109_000);
  assert.equal(rows[0].ticket_source, "prompt");

  // The line the orchestrator reads straight out of the transcript.
  const emitted = JSON.parse(stdout);
  assert.match(emitted.hookSpecificOutput.additionalContext, /^AGENT_RUN_METRICS: seq=1 ticket=SCRUM-777/);
  assert.match(emitted.hookSpecificOutput.additionalContext, /end_context=63563/);
  assert.deepEqual(diagnostics(dir), []);
});

test("the token block is written under both names, and says which turn it describes", () => {
  const dir = project();
  fire(dir, "--post", completedPayload(dir));
  const row = records(dir, "SCRUM-777")[0];

  // `end_context` is the honest name; `tokens` stays so a log spanning the rename reads either way.
  assert.equal(row.end_context.total, 63_563);
  assert.deepEqual(
    { ...row.tokens },
    {
      total: row.end_context.total,
      input: row.end_context.input,
      output: row.end_context.output,
      cache_read: row.end_context.cache_read,
      cache_creation: row.end_context.cache_creation,
    },
  );
  assert.equal(row.end_context.scope, "final_turn");
});

test("usage.iterations is recorded, so a harness that starts reporting the whole run is visible", () => {
  const dir = project();
  const payload = completedPayload(dir);
  payload.tool_response.usage.iterations = [{ output_tokens: 5872, type: "message" }];
  fire(dir, "--post", payload);

  // One message today. Anything above 1 means `usage` stopped describing a single turn, which changes
  // what every token figure in this log means — so it is a recorded number, not an assumption.
  assert.equal(records(dir, "SCRUM-777")[0].end_context.messages, 1);
});

test("an interrupted run keeps no token block under either name", () => {
  const dir = project();
  fire(dir, "--failed", {
    ...completedPayload(dir),
    hook_event_name: "PostToolUseFailure",
    tool_response: undefined,
    is_interrupt: true,
    duration_ms: 42_000,
  });
  const row = records(dir, "SCRUM-777")[0];
  assert.equal(row.tokens, null);
  assert.equal(row.end_context, null, "zero would read as free; absent is the honest record");
});

test("a payload carrying no result writes no record but says why", () => {
  const dir = project();
  const payload = completedPayload(dir);
  delete payload.tool_response;
  const { stdout } = fire(dir, "--post", payload);

  assert.deepEqual(records(dir, "SCRUM-777"), []);
  assert.equal(stdout.trim(), "");
  const diag = diagnostics(dir);
  assert.equal(diag.length, 1);
  assert.equal(diag[0].reason, "no_result");
  assert.equal(diag[0].tool_use_id, "toolu_01");
});

// ---------------------------------------------------------------------------------------------
// Background launches — the bug that erased three real runs
// ---------------------------------------------------------------------------------------------

/**
 * What the harness actually sends when an agent is launched in the background: PostToolUse fires on
 * the *launch*, and the response carries `isAsync`, an `outputFile` and no cost whatsoever, because
 * the agent has not stopped. These are the exact keys the three lost SCRUM-132 runs recorded.
 */
function asyncLaunchPayload(dir, overrides = {}) {
  const payload = completedPayload(dir, overrides);
  payload.tool_response = {
    isAsync: true,
    status: "pending",
    agentId: "agent_async_1",
    description: "Generate scenarios",
    resolvedModel: "claude-opus-5",
    prompt: payload.tool_input.prompt,
    outputFile: join(dir, "out.jsonl"),
    canReadOutputFile: true,
  };
  return payload;
}

test("a bail never consumes the launch record", () => {
  const dir = project();
  fire(dir, "--pre", completedPayload(dir, { hook_event_name: "PreToolUse" }));
  const payload = completedPayload(dir);
  delete payload.tool_response;
  fire(dir, "--post", payload);

  // The order used to be: take the pending, then discover there is no result, then return. That
  // destroyed the only evidence the run had ever been launched, so the report could not reconcile it
  // and the run left the log entirely. The launch record has to outlive the bail.
  assert.equal(pending(dir).length, 1, "the launch record must survive a bail");
  assert.equal(diagnostics(dir).at(-1).had_pending, true);
});

test("a background launch is named as one, and stays reconcilable", () => {
  const dir = project();
  fire(dir, "--pre", asyncLaunchPayload(dir, { hook_event_name: "PreToolUse" }));
  fire(dir, "--post", asyncLaunchPayload(dir));

  assert.deepEqual(records(dir, "SCRUM-777"), [], "there is no cost to record at launch time");
  const diag = diagnostics(dir).at(-1);
  assert.equal(diag.reason, "async_launch_no_cost", "not the generic no_result it used to report");
  assert.equal(diag.response_status, "pending");
  assert.equal(pending(dir).length, 1);
});

test("the report calls a background launch uncosted, not interrupted", () => {
  const dir = project();
  fire(dir, "--pre", asyncLaunchPayload(dir, { hook_event_name: "PreToolUse" }));
  fire(dir, "--post", asyncLaunchPayload(dir));

  const { status, stdout } = runReport(dir, "SCRUM-777");
  assert.equal(status, 0, stdout);
  assert.match(stdout, /async_uncosted/);
  assert.match(stdout, /launched in the background/);
  assert.ok(!stdout.includes("| interrupted |"), "a background run is not an interrupt");

  const row = records(dir, "SCRUM-777")[0];
  assert.equal(row.status, "async_uncosted");
  assert.equal(row.reason, "async_launch_no_cost");
  assert.equal(row.end_context, null);
});

test("malformed and empty input are recorded, not swallowed", () => {
  const dir = project();
  for (const input of ["", "not json at all"]) {
    const result = spawnSync(process.execPath, [hook, "--post"], {
      input,
      encoding: "utf8",
      cwd: dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });
    assert.equal(result.status, 0);
  }
  assert.deepEqual(
    diagnostics(dir).map((d) => d.reason),
    ["no_stdin", "bad_json"],
  );
});

test("a payload for some other tool is ignored without a diagnostic", () => {
  const dir = project();
  // Shaped like what an over-broad matcher would actually deliver: no subagent_type, no prompt.
  fire(dir, "--post", {
    ...completedPayload(dir),
    tool_name: "Bash",
    tool_input: { command: "npm run typecheck", description: "type check" },
  });
  assert.deepEqual(records(dir, "SCRUM-777"), []);
  assert.deepEqual(diagnostics(dir), []);
});

test("the subagent tool under either of its names is recorded the same way", () => {
  for (const toolName of SUBAGENT_TOOLS) {
    const dir = project();
    fire(dir, "--pre", completedPayload(dir, { tool_name: toolName, hook_event_name: "PreToolUse" }));
    fire(dir, "--post", completedPayload(dir, { tool_name: toolName }));

    const rows = records(dir, "SCRUM-777");
    assert.equal(rows.length, 1, `${toolName} wrote ${rows.length} record(s)`);
    assert.equal(rows[0].tokens.total, 63_563);
    assert.equal(rows[0].started_at_measured, true);
    assert.deepEqual(diagnostics(dir), [], `${toolName} should be recognised, not diagnosed`);
  }
});

test("a subagent launch under an unknown tool name is reported, not swallowed", () => {
  const dir = project();
  // The next rename. Nothing can be recorded under a name the hook does not know — but the whole
  // point of this case is that the log says which name it saw, instead of staying empty in silence.
  const { stdout } = fire(dir, "--post", { ...completedPayload(dir), tool_name: "SubagentV3" });

  assert.deepEqual(records(dir, "SCRUM-777"), []);
  assert.equal(stdout.trim(), "");
  const diag = diagnostics(dir);
  assert.equal(diag.length, 1);
  assert.equal(diag[0].reason, "unrecognised_subagent_tool");
  assert.equal(diag[0].tool_name, "SubagentV3");
  assert.equal(diag[0].mode, "post");
});

/**
 * The wiring check. Every failure this hook has had was the script being right and its registration
 * being wrong, and no test of the script alone can see that. This one reads the real settings file.
 */
test("settings.json fires all three modes for every tool name the hook accepts", () => {
  const settings = JSON.parse(readFileSync(join(repoRoot, ".claude", "settings.json"), "utf8"));

  for (const event of ["PreToolUse", "PostToolUse", "PostToolUseFailure"]) {
    const entries = settings.hooks?.[event] ?? [];
    const matchers = entries
      .filter((e) => (e.hooks ?? []).some((h) => String(h.command ?? "").includes("agent-metrics.mjs")))
      .map((e) => e.matcher);
    assert.ok(matchers.length > 0, `${event} does not run agent-metrics.mjs at all`);

    for (const toolName of SUBAGENT_TOOLS) {
      assert.ok(
        matchers.some((m) => new RegExp(`^(?:${m})$`).test(toolName)),
        `${event} matcher ${JSON.stringify(matchers)} does not match tool name ${toolName}`,
      );
    }
  }
});

test("--pre then --post yields one record with the measured start time and no pending file", () => {
  const dir = project();
  fire(dir, "--pre", completedPayload(dir, { hook_event_name: "PreToolUse" }));
  assert.equal(pending(dir).length, 1);

  fire(dir, "--post", completedPayload(dir));
  const rows = records(dir, "SCRUM-777");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].started_at_measured, true);
  assert.deepEqual(pending(dir), []);

  // Measured, so it is the launch time — not `finished_at` minus the agent's own duration.
  const derived = Date.parse(rows[0].finished_at) - rows[0].duration_ms;
  assert.ok(Date.parse(rows[0].started_at) > derived, "a measured start must precede nothing it excludes");
});

test("--post without a --pre still records, marked as an unmeasured start", () => {
  const dir = project();
  fire(dir, "--post", completedPayload(dir));
  assert.equal(records(dir, "SCRUM-777")[0].started_at_measured, false);
});

test("an interrupted Task is recorded as an event, with no invented cost", () => {
  const dir = project();
  fire(dir, "--pre", completedPayload(dir, { hook_event_name: "PreToolUse" }));
  fire(dir, "--failed", {
    ...completedPayload(dir),
    hook_event_name: "PostToolUseFailure",
    tool_response: undefined,
    error: "Request interrupted by user",
    error_type: "interrupt",
    is_interrupt: true,
    is_timeout: false,
    duration_ms: 42_000,
  });

  const rows = records(dir, "SCRUM-777");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "interrupted");
  assert.equal(rows[0].tokens, null, "an agent that never stopped produced no token count");
  assert.equal(rows[0].duration_ms, 42_000);
  assert.equal(rows[0].started_at_measured, true);
  assert.deepEqual(pending(dir), []);
});

test("two parallel launches of the same agent are correlated by tool_use_id, not by name", () => {
  const dir = project();
  const a = completedPayload(dir, { tool_use_id: "toolu_A" });
  const b = completedPayload(dir, { tool_use_id: "toolu_B" });

  fire(dir, "--pre", { ...a, hook_event_name: "PreToolUse" });
  fire(dir, "--pre", { ...b, hook_event_name: "PreToolUse" });
  assert.equal(pending(dir).length, 2);

  // Completing out of order must still clear the right launch record.
  fire(dir, "--post", b);
  assert.equal(pending(dir).length, 1);
  fire(dir, "--post", a);
  assert.deepEqual(pending(dir), []);

  const rows = records(dir, "SCRUM-777");
  assert.deepEqual(
    rows.map((r) => r.tool_use_id),
    ["toolu_B", "toolu_A"],
  );
  assert.deepEqual(
    rows.map((r) => r.seq),
    [1, 2],
  );
});

test("a state file on a non-running status still identifies the ticket", () => {
  const dir = project();
  mkdirSync(join(dir, ".workflow"), { recursive: true });
  // `escalated` is a live state: a run standing on one has not gone anywhere.
  writeFileSync(join(dir, ".workflow", "SCRUM-888.yaml"), "ticket_id: SCRUM-888\nstatus: escalated\n", "utf8");

  const payload = completedPayload(dir);
  payload.tool_input = { subagent_type: "qa-scenario-reviewer", description: "review", prompt: "no id here" };
  fire(dir, "--post", payload);

  const rows = records(dir, "SCRUM-888");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ticket_source, "state_file");
});

test("prose inside a findings block does not masquerade as a status line", () => {
  const dir = project();
  mkdirSync(join(dir, ".workflow"), { recursive: true });
  writeFileSync(
    join(dir, ".workflow", "SCRUM-889.yaml"),
    'ticket_id: SCRUM-889\nstatus: completed\ntest_design:\n  review_status: in_progress\n  last_findings: "the run was left in a state: in_progress by the previous session"\n',
    "utf8",
  );

  const payload = completedPayload(dir);
  payload.tool_input = { subagent_type: "qa-scenario-reviewer", description: "review", prompt: "no id here" };
  fire(dir, "--post", payload);

  // No live state file, so the run is unassigned — and the hook says so rather than guessing.
  assert.deepEqual(records(dir, "SCRUM-889"), []);
  assert.equal(records(dir, "unassigned").length, 1);
  assert.equal(diagnostics(dir).at(-1).reason, "ticket_unresolved");
});

test("the report renders an interrupted launch, and reconciles it exactly once", () => {
  const dir = project();
  fire(dir, "--pre", completedPayload(dir, { hook_event_name: "PreToolUse" }));
  fire(dir, "--post", completedPayload(dir, { tool_use_id: "toolu_done" }));
  // toolu_01 never completes.

  const first = runReport(dir, "SCRUM-777");
  assert.equal(first.status, 0, first.stderr);
  // Status, then duration, tool count and end context — all three dashes, none of them invented.
  assert.match(first.stdout, /\| interrupted \| — \| — \| — \|/);
  assert.match(first.stdout, /1 run\(s\) contributed nothing to the total/);
  assert.deepEqual(pending(dir), []);

  const second = runReport(dir, "SCRUM-777");
  assert.equal(records(dir, "SCRUM-777").filter((r) => r.status === "interrupted").length, 1);
  assert.equal(second.stdout, first.stdout);
});

test("the report survives a torn line instead of destroying the cost section", () => {
  const dir = project();
  fire(dir, "--post", completedPayload(dir));
  const file = join(dir, ".workflow", "metrics", "SCRUM-777.jsonl");
  writeFileSync(file, `${readFileSync(file, "utf8")}{"seq":2,"agent":"qa-\n`, "utf8");

  const { status, stdout } = runReport(dir, "SCRUM-777");
  assert.equal(status, 0, stdout);
  assert.match(stdout, /1 unreadable line\(s\) skipped/);
  assert.match(stdout, /\*\*63,563\*\*/);
});

test("the report finds the log from a subdirectory", () => {
  const dir = project();
  fire(dir, "--post", completedPayload(dir));
  const nested = join(dir, "tests", "api");
  mkdirSync(nested, { recursive: true });

  const result = spawnSync(process.execPath, [report, "SCRUM-777"], {
    encoding: "utf8",
    cwd: nested,
    env: { ...process.env, CLAUDE_PROJECT_DIR: "" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Agent run cost — SCRUM-777/);
  assert.ok(!result.stdout.includes("No metrics recorded"), result.stdout);
});

test("the report says so plainly when there is nothing to report", () => {
  const dir = project();
  const { status, stdout } = runReport(dir, "SCRUM-000");
  assert.equal(status, 0);
  assert.match(stdout, /No metrics recorded for SCRUM-000/);
});

test("--json carries the interrupted count and never a fabricated total", () => {
  const dir = project();
  fire(dir, "--pre", completedPayload(dir, { hook_event_name: "PreToolUse" }));
  const { stdout } = runReport(dir, "SCRUM-777", "--json");
  const summary = JSON.parse(stdout);
  assert.equal(summary.runs, 1);
  assert.equal(summary.interrupted, 1);
  assert.equal(summary.total.total, 0);
  assert.equal(summary.wall_clock_ms, null, "one row with no finish time cannot span a wall clock");
});

// ---------------------------------------------------------------------------------------------
// Run mode — declared by the caller, never inferred
// ---------------------------------------------------------------------------------------------

const withPrompt = (dir, prompt, overrides = {}) => {
  const payload = completedPayload(dir, overrides);
  payload.tool_input.prompt = prompt;
  return payload;
};

test("a declared run_mode is recorded, and the prompt size with it", () => {
  const dir = project();
  const prompt = "ticket_id: SCRUM-777\nrun_mode: revision\nreview_findings: [DESIGN-C1] fix the oracle";
  fire(dir, "--post", withPrompt(dir, prompt));

  const row = records(dir, "SCRUM-777")[0];
  assert.equal(row.run_mode, "revision");
  assert.equal(row.prompt_chars, prompt.length);
});

test("a prompt with no run_mode records undeclared, never first_run", () => {
  const dir = project();
  // The whole point: an unrecorded mode has to look unrecorded. Defaulting to `first_run` here would
  // put a guess in the log wearing the clothes of a measurement.
  fire(dir, "--post", completedPayload(dir));
  assert.equal(records(dir, "SCRUM-777")[0].run_mode, "undeclared");
});

test("a run_mode naming something unknown is flagged rather than dropped", () => {
  const dir = project();
  fire(dir, "--post", withPrompt(dir, "ticket_id: SCRUM-777\nrun_mode: turbo_rewrite"));
  assert.equal(records(dir, "SCRUM-777")[0].run_mode, "unrecognised");
});

test("run_mode is read at launch, so an interrupted run still carries the mode it started in", () => {
  const dir = project();
  const prompt = "ticket_id: SCRUM-777\nrun_mode: re_review\nprevious_findings: |\n  [UI-M2] still open";
  fire(dir, "--pre", withPrompt(dir, prompt, { hook_event_name: "PreToolUse" }));
  fire(dir, "--failed", {
    ...withPrompt(dir, prompt),
    hook_event_name: "PostToolUseFailure",
    tool_response: undefined,
    is_interrupt: true,
    duration_ms: 8_000,
  });

  const row = records(dir, "SCRUM-777")[0];
  assert.equal(row.status, "interrupted");
  assert.equal(row.run_mode, "re_review");
  assert.equal(row.prompt_chars, prompt.length);
});

test("prose mentioning a mode does not set the field", () => {
  const dir = project();
  // A findings block quoting the contract is not a declaration. Only a line of its own counts.
  fire(
    dir,
    "--post",
    withPrompt(dir, "ticket_id: SCRUM-777\nreview_findings: the agent resolved run_mode: revision last time"),
  );
  assert.equal(records(dir, "SCRUM-777")[0].run_mode, "undeclared");
});

test("an indented run_mode still counts — it is a parameter, not a heading", () => {
  const dir = project();
  fire(dir, "--post", withPrompt(dir, "ticket_id: SCRUM-777\nparameters:\n  run_mode: regenerate\n"));
  assert.equal(records(dir, "SCRUM-777")[0].run_mode, "regenerate");
});

test("the report prints the mode and per-run detail without summing end context into a cost", () => {
  const dir = project();
  fire(dir, "--post", withPrompt(dir, "ticket_id: SCRUM-777\nrun_mode: first_run"));

  const table = runReport(dir, "SCRUM-777");
  assert.equal(table.status, 0, table.stderr);
  assert.match(table.stdout, /\| Mode \|/);
  assert.match(table.stdout, /\| first_run \|/);
  assert.match(table.stdout, /End context is the final message, not the run/);

  const summary = JSON.parse(runReport(dir, "SCRUM-777", "--json").stdout);
  assert.equal(summary.totals_scope, "sum_of_final_turn_context");
  assert.equal(summary.records.length, 1);
  assert.equal(summary.records[0].run_mode, "first_run");
  assert.equal(summary.records[0].end_context.total, 63_563);
  assert.equal(summary.records[0].tool_uses, 26);
});

test("the report reads a log written before the rename", () => {
  const dir = project();
  // Exactly the shape the 13 real SCRUM-132 records carry: `tokens`, no `end_context`, no `run_mode`.
  mkdirSync(join(dir, ".workflow", "metrics"), { recursive: true });
  writeFileSync(
    join(dir, ".workflow", "metrics", "SCRUM-132.jsonl"),
    `${JSON.stringify({
      seq: 1,
      ticket: "SCRUM-132",
      agent: "qa-scenario-classifier",
      status: "completed",
      started_at: "2026-08-09T12:16:49.481Z",
      finished_at: "2026-08-09T12:20:16.981Z",
      duration_ms: 207_500,
      tokens: { total: 76_217, input: 2, output: 957, cache_read: 75_089, cache_creation: 169 },
      tool_uses: 13,
    })}\n`,
    "utf8",
  );

  const { status, stdout } = runReport(dir, "SCRUM-132");
  assert.equal(status, 0, stdout);
  assert.match(stdout, /\| 76,217 \|/, "the old block still renders");
  assert.match(stdout, /\| — \| completed \|/, "an absent mode reads as a dash, not as first_run");
  assert.ok(!stdout.includes("contributed nothing to the total"), stdout);
});
