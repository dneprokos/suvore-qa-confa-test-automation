#!/usr/bin/env node
// PostToolUse / PostToolUseFailure hook: appends one line per tool call to .workflow/audit/tool-calls.jsonl
// — who (git user), which session and agent, which tool, which arguments, and how it ended.
// Audit only: never blocks, always exits 0, and logs its own failures to stderr instead of throwing.
import { appendFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const MAX_ARG = 400; // keep a line readable; the transcript holds the full call

function gitUser() {
  try {
    return execSync("git config user.name", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return process.env.USERNAME || process.env.USER || "unknown";
  }
}

function clip(value) {
  const s = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return s.length > MAX_ARG ? `${s.slice(0, MAX_ARG)}…(+${s.length - MAX_ARG})` : s;
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  try {
    const e = JSON.parse(raw);
    const failed = e.hook_event_name === "PostToolUseFailure";
    const row = {
      ts: new Date().toISOString(),
      user: gitUser(),
      session: e.session_id,
      agent: e.agent_type ?? "main", // subagent type when the payload carries one; "main" otherwise
      tool: e.tool_name,
      args: clip(e.tool_input),
      result: failed ? "failed" : "ok",
      detail: failed ? clip(e.error) : undefined,
      permission_mode: e.permission_mode,
    };
    const dir = join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), ".workflow", "audit");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "tool-calls.jsonl"), `${JSON.stringify(row)}\n`);
  } catch (err) {
    process.stderr.write(`audit-log.mjs: not recorded (${err.message})\n`);
  }
  process.exit(0);
});
