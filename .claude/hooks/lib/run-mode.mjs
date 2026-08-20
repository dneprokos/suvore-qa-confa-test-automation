/**
 * The run mode of a delegation, read off the prompt that launched it.
 *
 * WHY THIS IS PARSED AND NOT INFERRED. Every writing agent here resolves a mode before it writes —
 * `first_run`, `EXISTS`, `revision`, `regenerate` — and every reviewer switches to `re_review` when it
 * is handed previous findings. The cost of a run depends on that mode more than on anything else the
 * record carries: a revision touching two scenarios and a first run producing forty are the same agent
 * with the same body and wildly different work.
 *
 * The metrics log could not tell them apart. The report derived a `Run i/N` ordinal positionally at
 * render time, which says only how many times an agent appeared — it read a two-scenario reclassify
 * and a design revision identically, and it would read an unrelated second use of the same agent as an
 * iteration of the first. That is a guess dressed as data.
 *
 * It is not inferred from which parameters the prompt happens to carry either. `previous_findings`
 * present *usually* means a revision, and inferring from it would be right most of the time and
 * silently wrong the rest — which is the failure mode this whole measurement pass exists to remove. A
 * mode is recorded when the caller states it, and `undeclared` when the caller does not.
 *
 * So the caller declares it. The orchestrator writes one `run_mode: <value>` line into every
 * delegation prompt, and this reads it back. Nothing guesses, and a prompt that forgot the line is
 * visible as `undeclared` rather than being quietly counted as a first run.
 */

/**
 * Every mode any agent in this repository resolves to, plus the two the hook itself produces.
 *
 * `undeclared` — the prompt carried no `run_mode:` line. `unrecognised` — it carried one naming
 * something not on this list, which means either a new mode nobody added here or a typo, and both are
 * worth seeing rather than dropping.
 */
export const RUN_MODES = Object.freeze([
  "first_run",
  "EXISTS",
  "revision",
  "regenerate",
  "full_review",
  "re_review",
  "reclassify",
  "surface_revision",
]);

export const UNDECLARED = "undeclared";
export const UNRECOGNISED = "unrecognised";

// Deliberately anchored to a line start (allowing list markers and emphasis, which is how the
// orchestrator writes parameters) so prose mentioning a mode in passing cannot set the field. The
// value stops at whitespace or punctuation, so `run_mode: revision.` and `run_mode: revision` agree.
const RUN_MODE_RE = /^[\s>*_-]*run_mode\s*[:=]\s*["'`]?([A-Za-z_]+)/im;

/**
 * The declared mode of a delegation prompt.
 *
 * Matching is case-insensitive on the key and on every value except `EXISTS`, which is upper-case
 * throughout the contracts and is normalised back to that spelling — the vocabulary the orchestrator
 * already normalizes as `already_done`.
 */
export function parseRunMode(prompt) {
  if (typeof prompt !== "string" || !prompt) return UNDECLARED;
  const m = prompt.match(RUN_MODE_RE);
  if (!m) return UNDECLARED;
  const raw = m[1];
  const hit = RUN_MODES.find((mode) => mode.toLowerCase() === raw.toLowerCase());
  return hit ?? UNRECOGNISED;
}

/**
 * How big the delegation prompt was, in characters.
 *
 * Not a token count and not presented as one — it is the one part of an agent's input this hook can
 * measure directly, and it is the part the orchestrator controls. The agent body and every document
 * the agent reads on its own are invisible from here; what shows up in `end_context` is all of them
 * together, and this separates out the share the caller wrote.
 */
export function promptChars(prompt) {
  return typeof prompt === "string" ? prompt.length : null;
}
