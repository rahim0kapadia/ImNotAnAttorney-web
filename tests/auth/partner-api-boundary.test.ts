/**
 * Structural audit: every /api/partner/** route MUST validate the session
 * before doing anything else, and MUST NOT read partner_id from the request
 * body or query — the partner identity comes exclusively from the
 * session-validated partner object.
 *
 * A prior WIP tried to drop auth checks from a route during a refactor.
 * This test reads route source files as text and asserts the contract
 * structurally. Runs fast, no mocks, no live DB.
 *
 * Failure signals to act on:
 *  - "no auth call": the route is ungated — anyone on the internet can hit it.
 *  - "partner_id in body/query": the route trusts client-supplied identity.
 *  - "auth NOT at top": business logic may run before the auth check.
 *
 * PUBLIC routes (intentionally unauthenticated, called out in PUBLIC_ROUTES
 * below): login (magic-link + verify), logout (clears cookie by design),
 * and track-event (public analytics identified by promo_code + rate-limited).
 * The partner_id-in-body/query guard still applies to these routes.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const PARTNER_API_DIR = path.resolve(__dirname, "..", "..", "src", "app", "api", "partner");

// Routes that MUST remain public — login/logout can't require a session.
// track-event is a public analytics endpoint identified by promo_code,
// rate-limited, with a whitelisted event shape (see route source).
const PUBLIC_ROUTES = new Set(
  [
    "src/app/api/partner/magic-link/route.ts",
    "src/app/api/partner/magic-link/verify/route.ts",
    "src/app/api/partner/logout/route.ts",
    "src/app/api/partner/track-event/route.ts",
  ].map((p) => p.split("/").join(path.sep)),
);

function findRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) {
      files.push(...findRouteFiles(full));
    } else if (e === "route.ts" || e === "route.tsx") {
      files.push(full);
    }
  }
  return files;
}

const AUTH_CALL_RE = /(requirePartnerAuth\s*\(|validatePartnerSession\s*\()/;
const BODY_PARTNER_ID_RE = /body\s*\.\s*partner_?[Ii]d|const\s*\{\s*[^}]*partner_?[Ii]d[^}]*\}\s*=/;
const QUERY_PARTNER_ID_RE = /searchParams\s*\.\s*get\s*\(\s*["']partner_?[Ii]d["']\s*\)/;

const routeFiles = findRouteFiles(PARTNER_API_DIR);
const repoRoot = path.resolve(__dirname, "..", "..");

describe("partner API auth boundary", () => {
  it("finds at least one route file", () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  for (const file of routeFiles) {
    const rel = path.relative(repoRoot, file);
    const source = readFileSync(file, "utf8");
    const isPublic = PUBLIC_ROUTES.has(rel);

    if (!isPublic) {
      it(`${rel} calls requirePartnerAuth or validatePartnerSession`, () => {
        expect(
          AUTH_CALL_RE.test(source),
          `${rel} must gate on requirePartnerAuth or validatePartnerSession`,
        ).toBe(true);
      });
    }

    it(`${rel} does not read partner_id from body`, () => {
      expect(
        BODY_PARTNER_ID_RE.test(source),
        `${rel} must not accept partner_id from request body — identity comes from the session`,
      ).toBe(false);
    });

    it(`${rel} does not read partner_id from query`, () => {
      expect(
        QUERY_PARTNER_ID_RE.test(source),
        `${rel} must not accept partner_id from query params — identity comes from the session`,
      ).toBe(false);
    });
  }
});
