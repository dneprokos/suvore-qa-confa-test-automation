/**
 * Where the metrics live, resolved the same way by everything that touches them.
 *
 * The writer and the reader used to disagree: the hook resolved `payload.cwd || CLAUDE_PROJECT_DIR ||
 * process.cwd()`, while the report used `process.cwd()` alone. A hook fired with a subdirectory cwd
 * therefore wrote to `<subdir>/.workflow/metrics/`, and a report invoked from anywhere but the
 * repository root said "no metrics recorded" for a ticket with plenty. One function, both callers.
 */

import { existsSync } from "node:fs";
import path from "node:path";

/** Walk up from `start` looking for the repository root, so cwd inside a subdirectory still works. */
export function findRepoRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The project root. `payload` is a hook payload when there is one, `null` for a CLI caller. */
export function resolveProjectDir(payload = null) {
  return (
    payload?.cwd ||
    process.env.CLAUDE_PROJECT_DIR ||
    findRepoRoot(process.cwd()) ||
    process.cwd()
  );
}

export const metricsDir = (projectDir) => path.join(projectDir, ".workflow", "metrics");
export const metricsFile = (projectDir, ticket) => path.join(metricsDir(projectDir), `${ticket}.jsonl`);
export const pendingDir = (projectDir) => path.join(metricsDir(projectDir), "pending");
export const pendingFile = (projectDir, toolUseId) =>
  path.join(pendingDir(projectDir), `${String(toolUseId).replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
export const diagnosticsFile = (projectDir) => path.join(metricsDir(projectDir), "_diagnostics.jsonl");
