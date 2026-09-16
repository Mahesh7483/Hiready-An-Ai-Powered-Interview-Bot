/**
 * Every endpoint the app exposes, and whether it demands a token.
 *
 * Derived by walking the live Express router stack rather than by reading the
 * source, so it reflects what is actually mounted — including anything added
 * by a middleware chain, and excluding anything a file defines but never
 * registers.
 *
 *   node scripts/audit-routes.js
 *
 * An UNAUTHENTICATED row is not automatically a finding: a health check and a
 * login endpoint must both answer without a token. It is a list to be read,
 * which is why this prints rather than asserts.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'audit-placeholder-secret-at-least-32-chars';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hiready-audit';
process.env.NODE_ENV = 'test';

const app = require('../server');

/**
 * The mount path of a sub-router, read off its layer regexp.
 *
 * Express 4 compiles `app.use('/api/auth', r)` to the source
 *   ^\/api\/auth\/?(?=\/|$)
 * and a root mount (`app.use(r)`) to `^\/?(?=\/|$)`, flagged fast_slash.
 * Returns null rather than guessing when neither shape matches.
 */
function mountPathOf(layer) {
  if (layer.regexp && layer.regexp.fast_slash) return '';
  const src = layer.regexp && layer.regexp.source;
  if (!src) return null;
  const m = src.match(/^\^((?:\\\/[^\\]+)+)\\\/\?\(\?=/);
  if (!m) return null;
  return m[1].replace(/\\\//g, '/');
}

const GUARD = /^(requireAuth|requireAdmin|requireCompany|requireCompanyRole)/;

/** Guards attached to a specific mount path, applied by prefix after the walk. */
const scopedGuards = [];

/**
 * Recursively collect { method, path, guards } from a router stack.
 *
 * `inherited` is COPIED, never mutated. The first version pushed onto the
 * array it was handed, so a router-level guard picked up while iterating
 * leaked sideways into every sibling already visited — which made
 * /api/code/languages report `requireAuth` when it has none, and made
 * /api/code/execute report it twice. The script then declared 6 open
 * endpoints when the real answer was 7. A route audit that under-counts is
 * worse than no route audit; it is exactly the false assurance it exists to
 * prevent.
 *
 * Verified against live probes: every row this now calls open returns 200
 * without a token, and every row it calls guarded returns 401 or 403.
 */
function collect(stack, prefix = '', inherited = []) {
  const out = [];
  // Router-level middleware applies to routes registered AFTER it, so this
  // grows as we walk — but only within this stack.
  let routerGuards = [...inherited];

  for (const layer of stack) {
    if (layer.route) {
      const own = layer.route.stack
        .map((h) => h.name)
        .filter((n) => n && GUARD.test(n));
      const guards = [...new Set([...routerGuards, ...own])];
      const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
      methods.forEach((m) => {
        out.push({ method: m.toUpperCase(), path: prefix + layer.route.path, guards });
      });
      continue;
    }

    if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      const mount = mountPathOf(layer);
      if (mount === null) {
        // Refuse to guess. An unresolved mount collapses every route beneath
        // it onto a wrong path; the first version did that for 130 of 133.
        throw new Error(
          `Could not resolve a mount path from: ${layer.regexp && layer.regexp.source}`
        );
      }
      out.push(...collect(layer.handle.stack, prefix + mount, routerGuards));
      continue;
    }

    /**
     * A bare middleware layer. Whether it guards everything after it depends
     * on whether it is PATH-SCOPED:
     *
     *   router.use(requireAuth)                    -> applies to this stack
     *   app.use('/api/ai', requireAuth, aiRoutes)  -> applies to /api/ai ONLY
     *
     * Treating the second as global is what made this script claim
     * /api/code/languages required a token: /api/code is mounted after
     * /api/ai, so it inherited a guard scoped to a different subtree. Every
     * router registered after that line was reported as protected, and the
     * one genuinely open endpoint disappeared from the report.
     */
    if (layer.name && GUARD.test(layer.name)) {
      const scoped = mountPathOf(layer);
      if (scoped === '' || scoped === null) {
        // Unscoped: applies to the rest of this stack.
        routerGuards = [...routerGuards, layer.name];
      } else {
        // Scoped: remember it, and apply it only to paths beneath it.
        scopedGuards.push({ prefix: prefix + scoped, name: layer.name });
      }
    }
  }

  return out;
}

const routes = collect(app._router.stack);

/**
 * Apply the path-scoped guards collected during the walk.
 *
 * `app.use('/api/ai', apiLimiter, requireAuth, aiLimiter, aiRoutes)` attaches
 * requireAuth beside the router, as a layer scoped to /api/ai. It protects
 * everything under that prefix and nothing else.
 */
const rows = routes.map((r) => {
  const applicable = scopedGuards
    .filter((g) => r.path === g.prefix || r.path.startsWith(`${g.prefix}/`))
    .map((g) => `${g.name}(mount)`);
  return { ...r, guards: [...new Set([...r.guards, ...applicable])] };
});

const open = rows.filter((r) => !r.guards.some((g) => /requireAuth|requireAdmin|requireCompany/.test(g)));

if (process.argv.includes('--all')) {
  console.log(`\nall ${rows.length} endpoints\n`);
  rows
    .sort((a, b) => a.path.localeCompare(b.path))
    .forEach((r) => {
      const guards = r.guards.filter((g) => /require/i.test(g));
      console.log(`  ${r.method.padEnd(6)} ${r.path.padEnd(52)} ${guards.join(',') || '(none)'}`);
    });
}

console.log(`\n${rows.length} endpoints mounted\n`);
console.log(`${open.length} answer WITHOUT a token:\n`);
open
  .sort((a, b) => a.path.localeCompare(b.path))
  .forEach((r) => console.log(`  ${r.method.padEnd(6)} ${r.path}`));

console.log(`\n${rows.length - open.length} require authentication.\n`);
process.exit(0);
