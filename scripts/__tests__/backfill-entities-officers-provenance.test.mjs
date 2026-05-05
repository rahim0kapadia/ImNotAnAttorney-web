// scripts/__tests__/backfill-entities-officers-provenance.test.mjs
//
// Smoke tests for backfill-entities-officers-provenance.mjs.
// No pure-function helpers to unit-test (SQL-only script), so this
// verifies arg-parsing rejects invalid flag combinations before touching the DB.

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, "..", "backfill-entities-officers-provenance.mjs");

function runScript(args) {
  try {
    execFileSync(process.execPath, [SCRIPT, ...args], {
      windowsHide: true,
      stdio: "pipe",
      env: { ...process.env },
    });
    return { status: 0 };
  } catch (err) {
    return { status: err.status ?? 1 };
  }
}

describe("backfill-entities-officers-provenance arg parsing", () => {
  it("exits 1 with no flags", () => {
    expect(runScript([]).status).toBe(1);
  });

  it("exits 1 when both --dry-run and --apply are passed", () => {
    expect(runScript(["--dry-run", "--apply"]).status).toBe(1);
  });

  it("exits 1 for unknown --source value", () => {
    expect(runScript(["--apply", "--source", "bogus"]).status).toBe(1);
  });
});
