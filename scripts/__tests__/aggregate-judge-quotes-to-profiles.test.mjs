// test-isolation-na: no Supabase writes — unit tests against in-memory fixtures only
import { describe, it, expect } from "vitest";
import {
  computeScore,
  dedupKey,
  sourceUrlFromCluster,
  selectTopQuotes,
} from "../aggregate-judge-quotes-to-profiles.mjs";

// ── sourceUrlFromCluster ─────────────────────────────────────────────────

describe("sourceUrlFromCluster (anti-hallucination)", () => {
  it("generates canonical CL URL for numeric cluster_id", () => {
    expect(sourceUrlFromCluster("1234567")).toBe(
      "https://www.courtlistener.com/opinion/1234567/"
    );
  });

  it("accepts numeric input", () => {
    expect(sourceUrlFromCluster(42)).toBe(
      "https://www.courtlistener.com/opinion/42/"
    );
  });

  it("returns null for null/undefined/empty", () => {
    expect(sourceUrlFromCluster(null)).toBeNull();
    expect(sourceUrlFromCluster(undefined)).toBeNull();
    expect(sourceUrlFromCluster("")).toBeNull();
  });

  it("returns null for non-numeric (never invents URL)", () => {
    expect(sourceUrlFromCluster("not-a-number")).toBeNull();
    expect(sourceUrlFromCluster("123abc")).toBeNull();
    expect(sourceUrlFromCluster("../etc/passwd")).toBeNull();
  });
});

// ── dedupKey ─────────────────────────────────────────────────────────────

describe("dedupKey", () => {
  it("treats two rows with same case+topic+head-text as duplicates", () => {
    // Same first 80 chars after whitespace normalization — extra trailing
    // content beyond char 80 should not affect the dedup key.
    const head = "We hold that the district court erred when it admitted the unreliable identification.";
    const a = {
      quote: head + " More words follow that exceed the 80-char head.",
      topic: "evidence",
      case_cited: "State v. Bentley",
    };
    const b = {
      quote: "  " + head + " Different trailing words altogether after the head.",
      topic: "evidence",
      case_cited: "State v. Bentley",
    };
    expect(dedupKey(a)).toBe(dedupKey(b));
  });

  it("differentiates by topic", () => {
    const a = { quote: "Same text", topic: "sentencing", case_cited: "X" };
    const b = { quote: "Same text", topic: "evidence", case_cited: "X" };
    expect(dedupKey(a)).not.toBe(dedupKey(b));
  });

  it("differentiates by case_cited", () => {
    const a = { quote: "Same text", topic: "sentencing", case_cited: "X v. Y" };
    const b = { quote: "Same text", topic: "sentencing", case_cited: "A v. B" };
    expect(dedupKey(a)).not.toBe(dedupKey(b));
  });
});

// ── computeScore ─────────────────────────────────────────────────────────

describe("computeScore", () => {
  const ctx = { newestTs: 2_000_000, oldestTs: 1_000_000 };

  it("ranks suppression > sentencing > general (topic priority)", () => {
    const longText = "x".repeat(300);
    const ts = new Date(1_500_000).toISOString();
    const supp = computeScore({ topic: "suppression", quote: longText, createdAt: ts }, ctx);
    const sent = computeScore({ topic: "sentencing", quote: longText, createdAt: ts }, ctx);
    const gen = computeScore({ topic: "general", quote: longText, createdAt: ts }, ctx);
    expect(supp).toBeGreaterThan(sent);
    expect(sent).toBeGreaterThan(gen);
  });

  it("rewards longer quotes within same topic", () => {
    const ts = new Date(1_500_000).toISOString();
    const long = computeScore({ topic: "evidence", quote: "x".repeat(700), createdAt: ts }, ctx);
    const short = computeScore({ topic: "evidence", quote: "x".repeat(100), createdAt: ts }, ctx);
    expect(long).toBeGreaterThan(short);
  });

  it("returns integer 0-100", () => {
    const score = computeScore(
      { topic: "general", quote: "tiny", createdAt: new Date(1_000_000).toISOString() },
      ctx
    );
    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("handles missing topic / null quote", () => {
    const score = computeScore({ topic: null, quote: null, createdAt: null }, ctx);
    expect(Number.isFinite(score)).toBe(true);
  });
});

// ── selectTopQuotes ──────────────────────────────────────────────────────

const sampleRows = [
  // 5 dups of low-priority "general" quote
  ...Array.from({ length: 5 }, (_, i) => ({
    judge_id: "j1",
    quote: "Finding no error, we affirm the ruling below.",
    topic: "general",
    case_cited: "State v. Frye",
    cluster_id: String(1331508 + i), // different cluster_ids
    source_url: "https://www.courtlistener.com/opinion/1331508/",
    created_at: new Date(Date.parse("2024-01-01")).toISOString(),
  })),
  // 1 high-priority suppression quote
  {
    judge_id: "j1",
    quote:
      "We hold that the warrantless search of the defendant's vehicle violated " +
      "the Fourth Amendment because no probable cause supported the intrusion " +
      "and no exigency justified the bypass of the warrant requirement, and we " +
      "therefore reverse the conviction. " + "x".repeat(200),
    topic: "suppression",
    case_cited: "State v. Bentley",
    cluster_id: "1199578",
    source_url: "https://www.courtlistener.com/opinion/1199578/",
    created_at: new Date(Date.parse("2025-06-01")).toISOString(),
  },
  // 1 sentencing quote
  {
    judge_id: "j1",
    quote: "x".repeat(500),
    topic: "sentencing",
    case_cited: "State v. McClain",
    cluster_id: "1326341",
    source_url: "https://www.courtlistener.com/opinion/1326341/",
    created_at: new Date(Date.parse("2025-01-01")).toISOString(),
  },
];

describe("selectTopQuotes", () => {
  it("dedupes near-identical quotes by case+topic+head-text", () => {
    const top = selectTopQuotes(sampleRows, 10);
    // 5 dups of the same Frye quote should collapse to 1
    const fryeQuotes = top.filter((q) => q.cite === "State v. Frye");
    expect(fryeQuotes.length).toBe(1);
  });

  it("ranks high-priority topic first", () => {
    const top = selectTopQuotes(sampleRows, 3);
    expect(top[0].topic).toBe("suppression");
  });

  it("respects topN cap", () => {
    const top = selectTopQuotes(sampleRows, 2);
    expect(top.length).toBe(2);
  });

  it("emits source_url derived from cluster_id (anti-hallucination)", () => {
    const top = selectTopQuotes(sampleRows, 10);
    for (const q of top) {
      if (q.cluster_id) {
        expect(q.source_url).toBe(
          `https://www.courtlistener.com/opinion/${q.cluster_id}/`
        );
      }
      // Every quote with cluster_id must have source_url
      expect(q.source_url).toBeTruthy();
    }
  });

  it("emits superset shape (cluster_id + cite + topic + score + source_url + quote + case_cited)", () => {
    const top = selectTopQuotes(sampleRows, 1);
    const q = top[0];
    expect(q).toHaveProperty("cluster_id");
    expect(q).toHaveProperty("cite");
    expect(q).toHaveProperty("topic");
    expect(q).toHaveProperty("score");
    expect(q).toHaveProperty("source_url");
    expect(q).toHaveProperty("quote");
    expect(q).toHaveProperty("case_cited");
  });

  it("score is integer 0-100", () => {
    const top = selectTopQuotes(sampleRows, 10);
    for (const q of top) {
      expect(Number.isInteger(q.score)).toBe(true);
      expect(q.score).toBeGreaterThanOrEqual(0);
      expect(q.score).toBeLessThanOrEqual(100);
    }
  });

  it("returns empty array for empty input", () => {
    expect(selectTopQuotes([], 10)).toEqual([]);
    expect(selectTopQuotes(null, 10)).toEqual([]);
  });

  it("falls back to row source_url when cluster_id missing", () => {
    const rows = [
      {
        judge_id: "j2",
        quote: "x".repeat(300),
        topic: "evidence",
        case_cited: "X v. Y",
        cluster_id: null,
        source_url: "https://example.com/legacy/123",
        created_at: new Date().toISOString(),
      },
    ];
    const top = selectTopQuotes(rows, 1);
    expect(top[0].cluster_id).toBeNull();
    expect(top[0].source_url).toBe("https://example.com/legacy/123");
  });

  it("handles invalid created_at (per-row missing) without crashing", () => {
    const rows = sampleRows.map((r) => ({ ...r, created_at: null }));
    const top = selectTopQuotes(rows, 5);
    expect(Array.isArray(top)).toBe(true);
    expect(top.length).toBeGreaterThan(0);
    for (const q of top) expect(Number.isFinite(q.score)).toBe(true);
  });
});

// ── DRY-RUN no-write contract (documentation, not exec) ──────────────────

describe("DRY-RUN contract", () => {
  it("module export surface matches spec (cluster_id/cite/topic/score/source_url)", () => {
    // This is a contract test: if anyone changes the emit shape, it breaks.
    const rows = [sampleRows[5]]; // suppression row
    const [q] = selectTopQuotes(rows, 1);
    expect(typeof q.cluster_id === "string" || q.cluster_id === null).toBe(true);
    expect(typeof q.cite === "string" || q.cite === null).toBe(true);
    expect(typeof q.topic === "string" || q.topic === null).toBe(true);
    expect(typeof q.score).toBe("number");
    expect(typeof q.source_url === "string" || q.source_url === null).toBe(true);
  });
});
