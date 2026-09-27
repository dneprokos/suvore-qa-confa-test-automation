#!/usr/bin/env node
// PreToolUse hook: blocks any tool call that reads or writes a secret file (.env, .env.*, *.pem, *.key).
// Exit 2 cancels the call and stderr goes to Claude as the reason. Every other path exits 0.
// .env.example is allowed: it is committed on purpose and holds no values.

const SECRET = /(^|[\\/\s"'=])(\.env(\.[\w-]+)?|[\w.-]+\.(pem|key))(?=$|[\s"'`;|&)])/i;
const ALLOWED = /\.env\.example\b/i;

function targets(input) {
  const ti = input.tool_input ?? {};
  return [ti.file_path, ti.path, ti.notebook_path, ti.pattern, ti.command].filter(
    (v) => typeof v === "string",
  );
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0); // not our payload: never block on a parse error
  }

  const hit = targets(input).find((t) => SECRET.test(t) && !ALLOWED.test(t));
  if (!hit) process.exit(0);

  process.stderr.write(
    `Blocked by block-secret-files.mjs: ${input.tool_name} touches a secret file (${hit.slice(0, 120)}). ` +
      "Secrets are read only by framework/configuration/config.ts at runtime. " +
      "Ask the user to check the value themselves instead.\n",
  );
  process.exit(2);
});
