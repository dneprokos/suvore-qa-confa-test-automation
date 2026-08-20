/**
 * What the subagent-launching tool is called, and how to tell one of its payloads by shape.
 *
 * The harness has shipped this tool under more than one name — `Task` in older builds, `Agent` in
 * current ones — and both the hook's guard and the `matcher` in `.claude/settings.json` are written
 * against that name. When the name changed, the matcher stopped matching and the guard stopped
 * accepting, and because the guard's early return was the one bail that wrote no diagnostic, the
 * metrics log simply stayed empty. That is the second time this hook has silently recorded nothing.
 *
 * So the list lives here rather than inline in the hook: the test suite imports it and asserts that
 * the matcher in `settings.json` still matches every name in it. Adding a name is one edit, and the
 * wiring is checked against it instead of being trusted.
 */

/** Every tool name under which the harness has launched a subagent. */
export const SUBAGENT_TOOLS = Object.freeze(["Task", "Agent"]);

export const isSubagentTool = (toolName) => SUBAGENT_TOOLS.includes(toolName);

/**
 * Whether a payload looks like a subagent launch regardless of what the tool is called — the shape is
 * the evidence, the label is only a claim. This is what makes the next rename visible: an unknown tool
 * carrying `subagent_type` or a `prompt` gets a diagnostic, while a `Bash` payload delivered by an
 * over-broad matcher stays silent, because that is not news.
 */
export function looksLikeSubagentLaunch(payload) {
  const input = payload?.tool_input;
  if (!input || typeof input !== "object") return false;
  return typeof input.subagent_type === "string" || typeof input.prompt === "string";
}
