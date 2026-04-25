/**
 * @fileoverview Unit tests for score-attribution.ts.
 *
 * Pure function coverage: classifyReferrerHost, classifyUtmSource,
 * classifyAttributionSource, parseReferrerHost. No DB. No network.
 */

import { describe, it, expect } from "vitest";
import {
  classifyAttributionSource,
  classifyReferrerHost,
  classifyUtmSource,
  parseReferrerHost,
  ALLOWED_ATTRIBUTION_SOURCES,
} from "@/lib/score-attribution";

describe("classifyReferrerHost", () => {
  it.each([
    ["www.youtube.com", "youtube"],
    ["youtube.com", "youtube"],
    ["m.youtube.com", "youtube"],
    ["youtu.be", "youtube"],
    ["twitter.com", "x"],
    ["x.com", "x"],
    ["t.co", "x"],
    ["www.tiktok.com", "tiktok"],
    ["tiktok.com", "tiktok"],
    ["instagram.com", "instagram"],
    ["www.facebook.com", "facebook"],
    ["fb.me", "facebook"],
    ["www.reddit.com", "reddit"],
    ["redd.it", "reddit"],
    ["www.quora.com", "quora"],
    ["www.google.com", "google"],
    ["google.co.uk", "google"],
    ["bing.com", "bing"],
  ])("classifies %s as %s", (host, expected) => {
    expect(classifyReferrerHost(host)).toBe(expected);
  });

  it("returns 'other' for unrecognized hosts", () => {
    expect(classifyReferrerHost("example.com")).toBe("other");
    expect(classifyReferrerHost("randomsite.io")).toBe("other");
  });

  it("returns null for null/empty", () => {
    expect(classifyReferrerHost(null)).toBeNull();
    expect(classifyReferrerHost("")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(classifyReferrerHost("WWW.YouTube.COM")).toBe("youtube");
    expect(classifyReferrerHost("X.COM")).toBe("x");
  });

  it("does not classify lookalike hosts as legitimate platforms", () => {
    // Defense against domain-takeover spoofing: youtubefake.example.com
    // must NOT classify as youtube.
    expect(classifyReferrerHost("youtubefake.example.com")).toBe("other");
    expect(classifyReferrerHost("notyoutube.com")).toBe("other");
    expect(classifyReferrerHost("evilreddit.com")).toBe("other");
  });
});

describe("classifyUtmSource", () => {
  it.each([
    ["youtube", "youtube"],
    ["yt", "youtube"],
    ["youtube_shorts", "youtube"],
    ["shorts", "youtube"],
    ["x", "x"],
    ["twitter", "x"],
    ["twit", "x"],
    ["tt", "tiktok"],
    ["tiktok", "tiktok"],
    ["ig", "instagram"],
    ["instagram", "instagram"],
    ["fb", "facebook"],
    ["meta", "facebook"],
    ["reddit", "reddit"],
    ["quora", "quora"],
    ["google", "google"],
    ["bing", "bing"],
    ["organic", "organic"],
    ["direct", "direct"],
  ])("normalizes %s to %s", (utm, expected) => {
    expect(classifyUtmSource(utm)).toBe(expected);
  });

  it("normalizes hyphens to underscores before matching", () => {
    expect(classifyUtmSource("twitter-x")).toBe("x");
  });

  it("returns 'other' for unrecognized values", () => {
    expect(classifyUtmSource("snapchat")).toBe("other");
    expect(classifyUtmSource("randomstring")).toBe("other");
  });

  it("returns null for null/empty/whitespace-only", () => {
    expect(classifyUtmSource(null)).toBeNull();
    expect(classifyUtmSource("")).toBeNull();
  });

  it("trims whitespace", () => {
    expect(classifyUtmSource("  youtube  ")).toBe("youtube");
  });
});

describe("classifyAttributionSource", () => {
  it("prefers explicit body.attributionSource over utm + referrer", () => {
    expect(
      classifyAttributionSource({
        bodyAttributionSource: "youtube",
        bodyUtmSource: "x",
        referrerHost: "instagram.com",
      }),
    ).toBe("youtube");
  });

  it("falls back to utm when explicit attribution missing", () => {
    expect(
      classifyAttributionSource({
        bodyAttributionSource: null,
        bodyUtmSource: "tiktok",
        referrerHost: "google.com",
      }),
    ).toBe("tiktok");
  });

  it("falls back to referrer when utm + explicit missing", () => {
    expect(
      classifyAttributionSource({
        bodyAttributionSource: null,
        bodyUtmSource: null,
        referrerHost: "youtube.com",
      }),
    ).toBe("youtube");
  });

  it("returns null when all signals missing", () => {
    expect(
      classifyAttributionSource({
        bodyAttributionSource: null,
        bodyUtmSource: null,
        referrerHost: null,
      }),
    ).toBeNull();
  });

  it("does NOT preempt fallback when explicit body string is unknown ('other')", () => {
    // "other" is a real classification — caller treats it as known. utm
    // fallback must not override.
    expect(
      classifyAttributionSource({
        bodyAttributionSource: "snapchat",
        bodyUtmSource: "youtube",
        referrerHost: null,
      }),
    ).toBe("other");
  });
});

describe("parseReferrerHost", () => {
  it("extracts hostname from full URL", () => {
    expect(parseReferrerHost("https://www.youtube.com/watch?v=abc")).toBe("www.youtube.com");
  });

  it("strips ports + userinfo + path", () => {
    expect(parseReferrerHost("https://user@host.example.com:8443/foo/bar?baz=1")).toBe("host.example.com");
  });

  it("returns null for malformed input", () => {
    expect(parseReferrerHost("not a url")).toBeNull();
    expect(parseReferrerHost(null)).toBeNull();
    expect(parseReferrerHost("")).toBeNull();
  });

  it("rejects oversized hostnames", () => {
    const huge = "a".repeat(254) + ".com";
    expect(parseReferrerHost(`https://${huge}/`)).toBeNull();
  });

  it("lowercases hostname", () => {
    expect(parseReferrerHost("https://WWW.X.COM/profile")).toBe("www.x.com");
  });
});

describe("ALLOWED_ATTRIBUTION_SOURCES", () => {
  it("matches the DB CHECK constraint shape", () => {
    // Migration 20260426a_tt_checkpoint_tracking.sql defines this exact set.
    // If migration changes, this test must be updated in the same PR.
    expect(ALLOWED_ATTRIBUTION_SOURCES).toEqual([
      "youtube",
      "x",
      "twitter_x",
      "tiktok",
      "instagram",
      "facebook",
      "reddit",
      "quora",
      "google",
      "bing",
      "organic",
      "direct",
      "other",
    ]);
  });
});
