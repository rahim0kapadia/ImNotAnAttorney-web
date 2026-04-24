/**
 * Unit tests for /api/cron/statutes-refresh-fl/[chapter].
 *
 * Locks FL refresh semantics: FL_CHAPTERS drift-lock, parser correctness
 * against FL-specific markup, hash computation, refreshChapter branch
 * coverage, parallel-fetch concurrency.
 */
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  FL_CHAPTERS,
  FL_CHAPTERS_COVERAGE_LOCK,
  stripHtml,
  extractSectionNumbers,
  parseSectionPage,
  computeSectionHash,
  refreshChapter,
} from "../route";

// FL real-page shape (compressed): nested <div id="statutes"> wrapper with
// CatchlineText + SectionBody spans.
const FIXTURE_893_13 = `<html><head><title>Statutes & Constitution — Online Sunshine</title></head>
<body>
<div id="main-chrome">... page chrome ...</div>
<div id="statutes">
  <div class="Section">
    <span class="SectionNumber">893.13 </span>
    <span class="Catchline">
      <span class="CatchlineText">Prohibited acts; penalties.</span>
      <span class="EmDash">—</span>
    </span>
    <span class="SectionBody">
      <div class="Subsection">
        <div class="Paragraph"><span class="Number">(1)(a)</span>
          <span class="Text">Except as authorized by this chapter and chapter 499, a person may not sell, manufacture, or deliver a controlled substance.</span>
        </div>
      </div>
    </span>
  </div>
</body>
</div>
</body></html>`;

const FIXTURE_INDEX_893 = `<html><body>
<a href="/statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0893/Sections/0893.01.html">893.01</a>
<a href="/statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0893/Sections/0893.02.html">893.02</a>
<a href="/statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0893/Sections/0893.13.html">893.13</a>
<!-- overmatch-noise that old regex would incorrectly capture: -->
<p>See also 893.999 for cross-reference (NOT a real section).</p>
</body></html>`;

const FIXTURE_NOT_FOUND = `<html><body><p>The Statute you requested does not exist.</p></body></html>`;

// ── FL_CHAPTERS drift-lock ──────────────────────────────────────────────

describe("FL_CHAPTERS drift-lock", () => {
  it("coverage lock string matches v1:6-chapters", () => {
    expect(FL_CHAPTERS_COVERAGE_LOCK).toBe("v1:6-chapters");
  });
  it("covers exactly the 6 seeded chapters", () => {
    expect(Object.keys(FL_CHAPTERS).sort()).toEqual(["316", "775", "784", "810", "812", "893"]);
  });
  it("each chapter has a range in \\d{4}-\\d{4} format", () => {
    for (const [ch, meta] of Object.entries(FL_CHAPTERS)) {
      expect(meta.range).toMatch(/^\d{4}-\d{4}$/);
      expect(meta.description.length).toBeGreaterThan(0);
      void ch;
    }
  });
});

// ── stripHtml ────────────────────────────────────────────────────────────

describe("stripHtml (FL port)", () => {
  it("defuses XSS via decoded entities", () => {
    const s = stripHtml("clean &#60;script&#62;alert(1)&#60;/script&#62; end");
    expect(s.includes("<script")).toBe(false);
  });
  it("drops C0 controls + DEL", () => {
    const s = stripHtml("a&#0;b&#8;c&#127;d");
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      const bad = (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0x7f;
      expect(bad).toBe(false);
    }
  });
});

// ── extractSectionNumbers ───────────────────────────────────────────────

describe("extractSectionNumbers", () => {
  it("discovers padded-URL sections, rejects cross-reference overmatch", () => {
    const s = extractSectionNumbers(FIXTURE_INDEX_893, "893");
    expect(s).toContain("893.01");
    expect(s).toContain("893.02");
    expect(s).toContain("893.13");
    expect(s.includes("893.999")).toBe(false);
  });
  it("returns [] for page with no section URLs", () => {
    expect(extractSectionNumbers("<html><body>nothing</body></html>", "316")).toEqual([]);
  });
  it("sorts ascending by numeric suffix", () => {
    const s = extractSectionNumbers(FIXTURE_INDEX_893, "893");
    const suffixes = s.map((x) => Number.parseInt(x.split(".")[1], 10));
    for (let i = 1; i < suffixes.length; i++) expect(suffixes[i]).toBeGreaterThan(suffixes[i - 1]);
  });
});

// ── parseSectionPage ────────────────────────────────────────────────────

describe("parseSectionPage (FL)", () => {
  it("extracts CatchlineText as title", () => {
    const p = parseSectionPage(FIXTURE_893_13, "893", "893.13");
    expect(p?.titleText).toBe("Prohibited acts; penalties.");
  });
  it("scopes body to SectionBody span bounded by inner </body>", () => {
    const p = parseSectionPage(FIXTURE_893_13, "893", "893.13");
    expect(p?.bodyText).toContain("controlled substance");
    expect(p?.bodyText.includes("page chrome")).toBe(false);
  });
  it("returns null on 404-as-200 page", () => {
    expect(parseSectionPage(FIXTURE_NOT_FOUND, "893", "893.13")).toBeNull();
  });
  it("returns null when body < 20 chars", () => {
    const html = `<html><body><div id="statutes"><span class="SectionBody">x</span></div></body></html>`;
    expect(parseSectionPage(html, "893", "893.13")).toBeNull();
  });
});

// ── computeSectionHash ──────────────────────────────────────────────────

describe("computeSectionHash", () => {
  it("concatenates title + blank + body and SHA-256s", () => {
    const { sectionText, textHash } = computeSectionHash("Prohibited acts; penalties.", "(1)(a) …");
    expect(sectionText).toBe("Prohibited acts; penalties.\n\n(1)(a) …");
    const expected = crypto.createHash("sha256").update(sectionText).digest("hex");
    expect(textHash).toBe(expected);
  });
});

// ── refreshChapter integration ──────────────────────────────────────────

function makeStubSupabase(opts: {
  existingHash?: string | null;
  canonical_id?: string;
} = {}): { client: any; updateCalls: any[] } {
  const updateCalls: any[] = [];
  const client = {
    from: (_t: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  if (opts.existingHash === undefined) return { data: null, error: null };
                  return {
                    data: { canonical_id: opts.canonical_id ?? "uuid-1", text_hash: opts.existingHash },
                    error: null,
                  };
                },
              }),
            }),
          }),
        }),
      }),
      update: (patch: any) => ({
        eq: (_col: string, id: string) => {
          updateCalls.push({ patch, id });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
  return { client, updateCalls };
}

function makeStubFetch(routes: Record<string, { ok?: boolean; status?: number; body?: string; throwErr?: string }>): typeof fetch {
  return (async (urlArg: string | URL) => {
    const url = typeof urlArg === "string" ? urlArg : urlArg.toString();
    // Find longest matching key for specificity.
    let match: string | undefined;
    for (const k of Object.keys(routes)) {
      if (url.includes(k) && (!match || k.length > match.length)) match = k;
    }
    const cfg = match ? routes[match] : { ok: false, status: 404 };
    if (cfg.throwErr) throw new Error(cfg.throwErr);
    return {
      ok: cfg.ok ?? true,
      status: cfg.status ?? 200,
      headers: new Headers(),
      async text() { return cfg.body ?? ""; },
    };
  }) as any;
}

describe("refreshChapter", () => {
  it("returns 'unchanged' when stored hash matches", async () => {
    const { textHash } = computeSectionHash(
      "Prohibited acts; penalties.",
      stripHtml(
        `<div class="Subsection"><div class="Paragraph"><span class="Number">(1)(a)</span><span class="Text">Except as authorized by this chapter and chapter 499, a person may not sell, manufacture, or deliver a controlled substance.</span></div></div>`
      ),
    );
    const { client, updateCalls } = makeStubSupabase({ existingHash: textHash });
    const fetchImpl = makeStubFetch({
      "0893ContentsIndex.html": { body: FIXTURE_INDEX_893 },
      "0893.13.html": { body: FIXTURE_893_13 },
      "0893.01.html": { body: FIXTURE_893_13 },
      "0893.02.html": { body: FIXTURE_893_13 },
    });
    const out = await refreshChapter("893", client as any, fetchImpl);
    expect(out.sections_discovered).toBe(3);
    expect(out.results.every((r) => r.status === "unchanged")).toBe(true);
    expect(updateCalls.length).toBe(0);
  });

  it("returns 'updated' + calls UPDATE when hash differs", async () => {
    const { client, updateCalls } = makeStubSupabase({
      existingHash: "0000000000000000000000000000000000000000000000000000000000000000",
      canonical_id: "uuid-target",
    });
    const fetchImpl = makeStubFetch({
      "0893ContentsIndex.html": { body: FIXTURE_INDEX_893 },
      "0893.01.html": { body: FIXTURE_893_13 },
      "0893.02.html": { body: FIXTURE_893_13 },
      "0893.13.html": { body: FIXTURE_893_13 },
    });
    const out = await refreshChapter("893", client as any, fetchImpl);
    expect(out.results.filter((r) => r.status === "updated").length).toBe(3);
    expect(updateCalls.length).toBe(3);
    expect(updateCalls[0].patch.source_urls[0]).toContain("https://www.leg.state.fl.us/");
  });

  it("returns 'missing_row' when no existing row", async () => {
    const { client } = makeStubSupabase({ existingHash: undefined });
    const fetchImpl = makeStubFetch({
      "0893ContentsIndex.html": { body: FIXTURE_INDEX_893 },
      "0893": { body: FIXTURE_893_13 },
    });
    const out = await refreshChapter("893", client as any, fetchImpl);
    expect(out.results.every((r) => r.status === "missing_row")).toBe(true);
  });

  it("returns 'fetch_failed' at INDEX level when index fetch errors", async () => {
    const { client } = makeStubSupabase({ existingHash: "x" });
    const fetchImpl = makeStubFetch({
      "0893ContentsIndex.html": { throwErr: "ECONN" },
    });
    const out = await refreshChapter("893", client as any, fetchImpl);
    expect(out.sections_discovered).toBe(0);
    expect(out.results[0].status).toBe("fetch_failed");
  });
});

// ── extractSectionNumbers free-form fallback (W4) ────────────────────────

describe("extractSectionNumbers free-form fallback", () => {
  it("falls back to \\b<chapter>\\.(\\d+)\\b when no /Sections/ URLs present", () => {
    // No FL canonical URL markup, but plain text mentions sections.
    const html = `<html><body><p>See 893.01, 893.02, and 893.13 for details.</p></body></html>`;
    const out = extractSectionNumbers(html, "893");
    expect(out).toEqual(["893.01", "893.02", "893.13"]);
  });
  it("prefers anchored matches over free-form when both present", () => {
    // Anchored URL for 893.01 only; free-form for .02 and .999. Expect
    // the URL-scoped branch to win (so 893.999 is excluded).
    const html = `
      <a href="/statutes/index.cfm?URL=0800-0899/0893/Sections/0893.01.html">01</a>
      also see 893.02, 893.999 below`;
    const out = extractSectionNumbers(html, "893");
    expect(out).toContain("893.01");
    expect(out).not.toContain("893.999");
  });
});

// ── SSRF redirect re-validation (W7) ─────────────────────────────────────

describe("refreshChapter redirect defense", () => {
  it("rejects 302 Location off-allowlist as fetch_failed", async () => {
    const { client } = makeStubSupabase({ existingHash: "x" });
    const fetchImpl = (async (urlArg: string | URL) => {
      const url = typeof urlArg === "string" ? urlArg : urlArg.toString();
      if (url.includes("0893ContentsIndex.html")) {
        return {
          ok: false, status: 302,
          headers: new Headers({ location: "https://evil.example.com/hijack.html" }),
          async text() { return ""; },
        } as any;
      }
      return { ok: true, status: 200, headers: new Headers(), async text() { return ""; } } as any;
    }) as any;
    const out = await refreshChapter("893", client as any, fetchImpl);
    expect(out.sections_discovered).toBe(0);
    expect(out.results[0].status).toBe("fetch_failed");
    expect(out.results[0].note).toContain("redirect off-allowlist");
  });

  it("follows 302 Location IF target is also on allowlist", async () => {
    const { client } = makeStubSupabase({ existingHash: "irrelevant" });
    let hop = 0;
    const fetchImpl = (async (urlArg: string | URL) => {
      const url = typeof urlArg === "string" ? urlArg : urlArg.toString();
      if (url.includes("0893ContentsIndex.html") && hop === 0) {
        hop = 1;
        return {
          ok: false, status: 302,
          headers: new Headers({
            location: "https://www.leg.state.fl.us/statutes/index.cfm?URL=0800-0899/0893/Sections/0893.01.html",
          }),
          async text() { return ""; },
        } as any;
      }
      return { ok: true, status: 200, headers: new Headers(), async text() { return FIXTURE_INDEX_893; } } as any;
    }) as any;
    const out = await refreshChapter("893", client as any, fetchImpl);
    // After hop the content is the INDEX fixture with 3 sections — but each
    // section URL will also hit the (OK) stub returning the INDEX fixture
    // which has no <div id="statutes"> wrapper → parse_failed. That's fine;
    // what we're locking here is that the redirect was FOLLOWED, not rejected.
    expect(out.sections_discovered).toBeGreaterThan(0);
  });
});

// ── parseSectionPage effective_date (W3) ─────────────────────────────────

describe("parseSectionPage effective_date", () => {
  it("extracts effective_date from SectionBody-scoped 'Effective MM/DD/YYYY'", () => {
    const html = `<html><body><div id="statutes"><div class="Section">
      <span class="Catchline"><span class="CatchlineText">DUI penalties.</span></span>
      <span class="SectionBody">Effective 7/1/2024. A person who drives under the influence commits a misdemeanor.</span>
    </div></body></div></body></html>`;
    const p = parseSectionPage(html, "316", "316.193");
    expect(p?.effectiveDate).toBe("2024-07-01");
  });
  it("rejects invalid calendar date (Feb 30)", () => {
    const html = `<html><body><div id="statutes"><div class="Section">
      <span class="Catchline"><span class="CatchlineText">Bad date test.</span></span>
      <span class="SectionBody">Effective 2/30/2024. Some body text long enough to pass the 20-char minimum.</span>
    </div></body></div></body></html>`;
    const p = parseSectionPage(html, "316", "316.001");
    expect(p?.effectiveDate).toBeNull();
  });
  it("returns null effective_date when absent", () => {
    const p = parseSectionPage(FIXTURE_893_13, "893", "893.13");
    expect(p?.effectiveDate).toBeNull();
  });
});
