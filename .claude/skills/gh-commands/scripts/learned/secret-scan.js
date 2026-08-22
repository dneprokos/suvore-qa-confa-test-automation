'use strict';

/**
 * secret-scan.js — sweep every repository of an owner for credentials that look real.
 *
 * Two things make this useful rather than noisy. It scans **file contents from shallow clones**,
 * because GitHub's code search indexes only the default branch and throttles a sweep long before it
 * finishes; and it separates a *high-confidence* hit — a token with a vendor prefix and a length,
 * which is a secret or nothing — from a *contextual* one, which is a word like `password` next to a
 * literal and is usually test data.
 *
 * It also knows about its own false-positive class: a file whose job is to *detect* secrets carries
 * every pattern in this list. Those are reported separately rather than counted as findings.
 *
 * This scans the working tree at depth 1. A key deleted in a later commit still lives in the history
 * and this will not see it — for that, run a history scanner (gitleaks, trufflehog) over the clones
 * this command already left in the cache directory it prints.
 *
 * Usage:
 *   node .claude/skills/gh-commands/scripts/learned/secret-scan.js [options]
 *
 *   --owner <login>    defaults to config.json defaultOwner
 *   --cache <dir>      clone cache directory (default: a gh-commands-cache folder under the temp dir)
 *   --include-forks    forks are excluded unless this is passed
 *   --contextual       also report the low-confidence keyword hits
 *   --json             machine-readable output
 *
 * Exit codes: 0 no high-confidence finding · 5 at least one high-confidence finding · 1 the sweep failed
 */

const fs = require('fs');
const path = require('path');
const { loadConfig, ensureClones, walkFiles, renderTable, parseArgs } = require(path.join(__dirname, '..', 'lib'));

/** Vendor-prefixed tokens. A hit here is a credential or a detector rule, nothing in between. */
const HIGH_CONFIDENCE = [
  ['github-pat', /\bghp_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}\b/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{12,}\b/],
  ['openai-key', /\bsk-(proj-|ant-)?[A-Za-z0-9_-]{32,}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['gitlab-pat', /\bglpat-[A-Za-z0-9_-]{20,}\b/],
  ['private-key-block', /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b/],
  ['npm-token', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['connection-string-password', /(mongodb(\+srv)?|postgres(ql)?|mysql|amqp):\/\/[^\s:@/]+:[^\s:@/]{6,}@/i],
];

/** Keyword-plus-literal. Mostly test data; reported only with --contextual. */
const CONTEXTUAL = [
  ['assigned-credential', /\b(password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\b\s*[:=]\s*["'][^"'\s]{8,}["']/i],
];

/** Paths whose job is to carry these patterns, so a hit is the file working correctly. */
const DETECTOR_PATHS = /(^|[\\/])(\.claude|\.cursor|\.github)[\\/]skills[\\/]|secrets?-management|skill-validator|gitleaks|trufflehog|secret-scan/i;
// A value that is obviously not a value: a template placeholder, a shell or CI variable reference,
// or the literal words people write where a secret will go. The variable references matter most —
// `mongodb://${USER}:${PASSWORD}@host` is a connection string doing exactly what it should.
const PLACEHOLDER = /(your[_-]?(key|token|secret)|xxxx+|placeholder|example|dummy|changeme|<[^>]+>|\.\.\.|\$\{[^}]*\}|\$\([^)]*\)|%[A-Z_]{3,}%|\{\{[^}]*\}\})/i;

const SCAN_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.cs', '.java', '.go', '.rb', '.php',
  '.json', '.yml', '.yaml', '.xml', '.env', '.ini', '.cfg', '.conf', '.properties', '.runsettings',
  '.sh', '.ps1', '.tf', '.txt', '.md', '.pem', '.key',
]);

function scanRepo(repo) {
  const findings = [];
  const detectorHits = [];
  const files = walkFiles(repo.dir);
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file).toLowerCase();
    if (!SCAN_EXTENSIONS.has(ext) && !base.startsWith('.env')) continue;
    if (/package-lock\.json$|yarn\.lock$|pnpm-lock\.yaml$/i.test(base)) continue;
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const rel = path.relative(repo.dir, file).replace(/\\/g, '/');
    const isDetector = DETECTOR_PATHS.test(rel);
    text.split(/\r?\n/).forEach((line, i) => {
      if (line.length > 2000) return;
      for (const [label, re] of HIGH_CONFIDENCE) {
        if (!re.test(line)) continue;
        const record = { repo: repo.name, file: rel, line: i + 1, kind: label, confidence: 'high', excerpt: line.trim().slice(0, 100) };
        if (isDetector) detectorHits.push(record);
        else if (PLACEHOLDER.test(line)) detectorHits.push({ ...record, kind: `${label} (placeholder)` });
        else findings.push(record);
      }
      for (const [label, re] of CONTEXTUAL) {
        if (!re.test(line) || isDetector || PLACEHOLDER.test(line)) continue;
        findings.push({ repo: repo.name, file: rel, line: i + 1, kind: label, confidence: 'contextual', excerpt: line.trim().slice(0, 100) });
      }
    });
  }
  return { findings, detectorHits };
}

function main(argv) {
  const args = parseArgs(argv);
  const cfg = loadConfig();
  const owner = args.owner && args.owner !== true ? args.owner : cfg.defaultOwner;

  let clones;
  try {
    clones = ensureClones(owner, {
      dest: args.cache && args.cache !== true ? path.resolve(args.cache) : undefined,
      includeForks: Boolean(args['include-forks']),
    });
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 1;
  }

  const findings = [];
  const detectorHits = [];
  for (const repo of clones.cloned) {
    const result = scanRepo(repo);
    findings.push(...result.findings);
    detectorHits.push(...result.detectorHits);
  }

  const high = findings.filter((f) => f.confidence === 'high');
  const contextual = findings.filter((f) => f.confidence === 'contextual');

  if (args.json) {
    process.stdout.write(`${JSON.stringify({
      owner,
      cache: clones.dest,
      scanned: clones.cloned.length,
      failed: clones.failed,
      high_confidence: high,
      contextual: args.contextual ? contextual : contextual.length,
      suppressed_detector_or_placeholder: detectorHits.length,
      scope: 'working tree at clone depth 1 — git history not scanned',
    }, null, 2)}\n`);
    return high.length ? 5 : 0;
  }

  process.stdout.write(`Scanned ${clones.cloned.length} repositories of ${owner} (cache: ${clones.dest}).\n\n`);
  if (high.length) {
    process.stdout.write(`HIGH CONFIDENCE — ${high.length} finding(s):\n`);
    process.stdout.write(`${renderTable(['REPO', 'FILE:LINE', 'KIND', 'EXCERPT'], high.map((f) => [f.repo, `${f.file}:${f.line}`, f.kind, f.excerpt]))}\n\n`);
  } else {
    process.stdout.write('HIGH CONFIDENCE — none.\n\n');
  }
  if (args.contextual) {
    process.stdout.write(`CONTEXTUAL — ${contextual.length} keyword hit(s), usually test data:\n`);
    process.stdout.write(`${renderTable(['REPO', 'FILE:LINE', 'EXCERPT'], contextual.slice(0, 100).map((f) => [f.repo, `${f.file}:${f.line}`, f.excerpt]))}\n\n`);
  } else if (contextual.length) {
    process.stdout.write(`CONTEXTUAL — ${contextual.length} keyword hit(s) suppressed; re-run with --contextual to see them.\n\n`);
  }
  process.stdout.write(`${detectorHits.length} hit(s) suppressed as detector rules or placeholders.\n`);
  if (clones.failed.length) process.stdout.write(`${clones.failed.length} repositor(y/ies) could not be cloned: ${clones.failed.map((f) => f.name).join(', ')}\n`);
  process.stdout.write('Scope: working tree at clone depth 1. Git history is NOT scanned — run gitleaks over the cache directory for that.\n');
  return high.length ? 5 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main, scanRepo, HIGH_CONFIDENCE, CONTEXTUAL };
