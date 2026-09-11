import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Thin wrapper around `scripts/db.mjs` — direct Postgres over the linked
// project's pooler, with CA-verified TLS.
//
// This used to shell out to `supabase db query --linked`. That path is dead in
// this environment: the configured management token returns HTTP 401, so every
// call failed before reaching a single assertion (see docs/release-readiness.md
// "Remaining before public distribution" #3, and CLAUDE.md's Supabase section,
// which already directs database work through these scripts for this reason).
//
// Runs synchronously via execFileSync rather than returning a Promise:
// Playwright test hooks (beforeEach etc.) await fine either way, and
// keeping this synchronous avoids interleaving surprises when multiple
// worker processes shell out concurrently.
export function dbQuery(sql: string): unknown {
  const dir = mkdtempSync(join(tmpdir(), 'flatmeal-e2e-'));
  const file = join(dir, 'query.sql');
  writeFileSync(file, sql, 'utf-8');
  const repoRoot = join(__dirname, '..', '..', '..');
  try {
    let out: string;
    try {
      // --env-file supplies SUPABASE_DB_PASSWORD, which db.mjs reads from the
      // environment; the pooler URL and CA come from supabase/.temp (both
      // gitignored). Paths are repo-root-relative because that is db.mjs's
      // own assumption about where supabase/.temp lives.
      out = execFileSync(
        'node',
        ['--env-file=app/.env', 'scripts/db.mjs', '--file', file],
        {
          encoding: 'utf-8',
          cwd: repoRoot,
          maxBuffer: 10 * 1024 * 1024,
          shell: true,
        },
      );
    } catch (err) {
      // db.mjs prints the Postgres error to stderr and exits non-zero, so
      // execFileSync throws. Surface that message rather than letting Node's
      // bare "Command failed" propagate with no detail.
      const e = err as { stdout?: string; stderr?: string; message?: string };
      throw new Error(`db query failed (sql: ${sql.slice(0, 200)}): ${e.stdout || e.stderr || e.message}`);
    }
    // Output shape differs from the old CLI: db.mjs prints one bare JSON array
    // per result set that returned rows, and prints NOTHING when a statement
    // affects no rows (an UPDATE, or a SELECT with no matches). Empty stdout is
    // therefore a valid empty result, not a parse failure.
    const trimmed = out.trim();
    if (!trimmed) return [];
    return JSON.parse(trimmed.split('\n')[0]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
