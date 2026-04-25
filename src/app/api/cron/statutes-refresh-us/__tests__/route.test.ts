/**
 * Unit tests for /api/cron/statutes-refresh-us.
 *
 * Doesn't exercise the HTTP GET handler (which requires requireCron + real
 * Supabase admin client). Locks the refresh SEMANTICS: parser correctness,
 * hash computation, refreshOne branch coverage, and USC_TARGETS drift-lock.
 */
import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import {
  USC_TARGETS,
  USC_TARGETS_COVERAGE_LOCK,
  stripHtml,
  parseSectionPage,
  computeSectionHash,
  refreshOne,
} from "../route";

const FIXTURE_922 = `<html><head><title>18 U.S. Code § 922</title></head>
<body>
<h1>18 U.S. Code § 922 - Unlawful acts</h1>
<div class="tab-content">
<div class="tab-pane active" id="tab_default_1">
<text><div class="text">
<div class="section">
<div class="subsection indent0"><span class="num">(a)</span>
<span class="chapeau"> It shall be unlawful for any person to engage in the business of importing firearms without a license.</span>
</div>
</div>
</div></text>
</div>
<div class="tab-pane" id="tab_default_2">
<notes>Editorial notes here — should NOT be in body.</notes>
</div>
</div>
</body></html>`;

describe("USC_TARGETS drift-lock", () => {
  it("coverage lock string matches expected version", () => {
    // If this fails, the seed script + refresh route + this lock constant
    // need to be updated together in the same PR.
    expect(USC_TARGETS_COVERAGE_LOCK).toBe("v3:36-sections");
  });
  it("USC_TARGETS has exactly 36 entries", () => {
    expect(USC_TARGETS.length).toBe(36);
  });
  it("USC_TARGETS contains all high-signal federal criminal sections", () => {
    const byPair = new Set(USC_TARGETS.map((t) => `${t.title}:${t.section}`));
    // v1 core
    for (const must of ["18:922", "18:924", "21:841", "21:846", "18:371"]) {
      expect(byPair.has(must)).toBe(true);
    }
    // v2 expansion — prompt-audit gaps
    for (const must of [
      "18:2", "18:201", "18:1201", "18:1341", "18:1347", "18:1503",
      "18:1519", "18:1546", "18:1621", "18:1962", "18:2252",
      "26:7201", "8:1101", "8:1227",
    ]) {
      expect(byPair.has(must)).toBe(true);
    }
    // v3 expansion — wider audit gaps
    for (const must of [
      "18:1028A", "18:1111", "18:2244", "18:3161", "18:3282", "18:3293",
      "21:862",
    ]) {
      expect(byPair.has(must)).toBe(true);
    }
  });
});

describe("stripHtml", () => {
  it("strips tags and decodes entities", () => {
    expect(stripHtml("<p>Hello&nbsp;<b>world</b></p>")).toBe("Hello world");
  });
  it("defuses tags materialized from decoded entities (XSS defense)", () => {
    const s = stripHtml("clean &#60;script&#62;alert(1)&#60;/script&#62; end");
    expect(s.includes("<script")).toBe(false);
    expect(s.includes("</script")).toBe(false);
  });
  it("drops C0 controls, DEL, surrogates", () => {
    const s = stripHtml("before&#0;after&#8;more&#127;end");
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      const isControl =
        (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0x7f;
      expect(isControl).toBe(false);
    }
  });
});

describe("parseSectionPage", () => {
  it("extracts title from <h1> after separator (ASCII hyphen)", () => {
    const p = parseSectionPage(FIXTURE_922, "18", "922");
    expect(p?.titleText).toBe("Unlawful acts");
  });
  it("extracts title with en-dash separator", () => {
    const html = FIXTURE_922.replace(
      "18 U.S. Code § 922 - Unlawful acts",
      "18 U.S. Code § 922 – Unlawful acts",
    );
    const p = parseSectionPage(html, "18", "922");
    expect(p?.titleText).toBe("Unlawful acts");
  });
  it("extracts title with em-dash separator", () => {
    const html = FIXTURE_922.replace(
      "18 U.S. Code § 922 - Unlawful acts",
      "18 U.S. Code § 922 — Unlawful acts",
    );
    const p = parseSectionPage(html, "18", "922");
    expect(p?.titleText).toBe("Unlawful acts");
  });
  it("scopes body to active tab — excludes editorial notes", () => {
    const p = parseSectionPage(FIXTURE_922, "18", "922");
    expect(p?.bodyText.includes("engage in the business of importing")).toBe(true);
    expect(p?.bodyText.includes("Editorial notes")).toBe(false);
  });
  it("returns null on 404-as-200 page", () => {
    const html = `<html><body><p>The section you requested does not exist.</p></body></html>`;
    expect(parseSectionPage(html, "18", "922")).toBeNull();
  });
  it("returns null on thin page", () => {
    expect(parseSectionPage("<html><body>short</body></html>", "18", "922")).toBeNull();
  });
});

describe("computeSectionHash", () => {
  it("produces deterministic SHA-256 over titleText + blank line + bodyText", () => {
    const { sectionText, textHash } = computeSectionHash("Unlawful acts", "It shall be unlawful.");
    expect(sectionText).toBe("Unlawful acts\n\nIt shall be unlawful.");
    const expected = crypto.createHash("sha256").update(sectionText).digest("hex");
    expect(textHash).toBe(expected);
  });
  it("text_hash is 64-char lowercase hex", () => {
    const { textHash } = computeSectionHash("x", "long enough body text");
    expect(/^[a-f0-9]{64}$/.test(textHash)).toBe(true);
  });
});

// ── refreshOne branch coverage ──────────────────────────────────────────

function makeStubSupabase(opts: {
  existingHash?: string | null;
  existingCanonicalId?: string;
  selectError?: string | null;
  updateError?: string | null;
} = {}): {
  client: any;
  updateCalls: Array<{ patch: any; canonical_id: string }>;
} {
  const updateCalls: Array<{ patch: any; canonical_id: string }> = [];
  const client = {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  if (opts.selectError) return { data: null, error: { message: opts.selectError } };
                  if (opts.existingHash === null || opts.existingHash === undefined) {
                    return { data: null, error: null };
                  }
                  return {
                    data: {
                      canonical_id: opts.existingCanonicalId ?? "uuid-1",
                      text_hash: opts.existingHash,
                    },
                    error: null,
                  };
                },
              }),
            }),
          }),
        }),
      }),
      update: (patch: any) => ({
        eq: (_col: string, canonical_id: string) => {
          updateCalls.push({ patch, canonical_id });
          return Promise.resolve(opts.updateError
            ? { error: { message: opts.updateError } }
            : { error: null });
        },
      }),
    }),
  };
  return { client, updateCalls };
}

function makeStubFetch(
  opts: { ok?: boolean; status?: number; body?: string; throwErr?: string } = {},
): typeof fetch {
  return (async () => {
    if (opts.throwErr) throw new Error(opts.throwErr);
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      async text() { return opts.body ?? FIXTURE_922; },
    };
  }) as any;
}

describe("refreshOne", () => {
  const target = { title: "18", section: "922", label: "Unlawful acts" };

  it("returns 'unchanged' when stored hash matches computed hash", async () => {
    const { textHash } = computeSectionHash("Unlawful acts", stripHtml(
      `<div class="subsection indent0"><span class="num">(a)</span><span class="chapeau"> It shall be unlawful for any person to engage in the business of importing firearms without a license.</span></div>`,
    ));
    const { client, updateCalls } = makeStubSupabase({ existingHash: textHash });
    const r = await refreshOne(target, client as any, makeStubFetch());
    expect(r.status).toBe("unchanged");
    expect(updateCalls.length).toBe(0);
  });

  it("returns 'updated' + calls UPDATE when hash differs", async () => {
    const { client, updateCalls } = makeStubSupabase({
      existingHash: "0000000000000000000000000000000000000000000000000000000000000000",
      existingCanonicalId: "uuid-target",
    });
    const r = await refreshOne(target, client as any, makeStubFetch());
    expect(r.status).toBe("updated");
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].canonical_id).toBe("uuid-target");
    expect(updateCalls[0].patch.text_hash).not.toBe("0000000000000000000000000000000000000000000000000000000000000000");
    expect(typeof updateCalls[0].patch.section_text).toBe("string");
    expect(Array.isArray(updateCalls[0].patch.source_urls)).toBe(true);
    expect(updateCalls[0].patch.source_urls[0]).toBe("https://www.law.cornell.edu/uscode/text/18/922");
  });

  it("returns 'missing_row' when no existing row", async () => {
    const { client } = makeStubSupabase({ existingHash: null });
    const r = await refreshOne(target, client as any, makeStubFetch());
    expect(r.status).toBe("missing_row");
  });

  it("returns 'fetch_failed' on network error", async () => {
    const { client } = makeStubSupabase({ existingHash: "x" });
    const r = await refreshOne(target, client as any, makeStubFetch({ throwErr: "ECONN" }));
    expect(r.status).toBe("fetch_failed");
    expect(r.note).toContain("ECONN");
  });

  it("returns 'fetch_failed' on non-2xx HTTP", async () => {
    const { client } = makeStubSupabase({ existingHash: "x" });
    const r = await refreshOne(target, client as any, makeStubFetch({ ok: false, status: 500 }));
    expect(r.status).toBe("fetch_failed");
    expect(r.note).toBe("HTTP 500");
  });

  it("returns 'parse_failed' on 404-as-200 page", async () => {
    const { client } = makeStubSupabase({ existingHash: "x" });
    const r = await refreshOne(target, client as any, makeStubFetch({
      body: `<html><body><p>The section you requested does not exist.</p></body></html>`,
    }));
    expect(r.status).toBe("parse_failed");
  });

  it("returns 'fetch_failed' with 'update: ...' note on UPDATE error", async () => {
    const { client } = makeStubSupabase({
      existingHash: "0000000000000000000000000000000000000000000000000000000000000000",
      updateError: "timeout",
    });
    const r = await refreshOne(target, client as any, makeStubFetch());
    expect(r.status).toBe("fetch_failed");
    expect(r.note).toContain("update:");
  });
});
