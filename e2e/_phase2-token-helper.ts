/**
 * Phase 2 E2E helper: SHA-256 report-token hash.
 *
 * Mirrors src/lib/site.ts `hashToken` but lives outside the test file so the
 * Playwright spec can `await import()` it lazily (avoids bundling crypto into
 * the test runner graph during collection).
 */
import { createHash } from "crypto";

export function hashTokenForE2E(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
