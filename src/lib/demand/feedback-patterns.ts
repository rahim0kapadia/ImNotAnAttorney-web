/**
 * @file Feedback Patterns — extracts structural features from published blog
 * posts and identifies winning patterns by comparing top vs bottom performers.
 *
 * Pure TypeScript analysis, no LLM calls. Reads MDX files from content/blog/.
 * Called weekly by /api/cron/demand-feedback-patterns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import matter from "gray-matter";

export interface PatternResult {
  postsAnalyzed: number;
  patternsStored: number;
}

interface PostFeatures {
  slug: string;
  category: string;
  wordCount: number;
  paragraphCount: number;
  avgParagraphLength: number;
  questionDensityPer1000: number;
  h2Count: number;
  headingToBodyRatio: number;
  hasBulletList: boolean;
  hasNumberedList: boolean;
  boldPhraseDensity: number;
  firstPersonRatio: number;
  secondPersonRatio: number;
  faqCount: number;
  openingPattern: "question" | "statistic" | "scenario" | "direct-address" | "unknown";
}

function classifyOpening(firstParagraph: string): PostFeatures["openingPattern"] {
  const trimmed = firstParagraph.trim();
  if (trimmed.endsWith("?")) return "question";
  if (/\d+%|\d+ out of|\d+\.\d/.test(trimmed)) return "statistic";
  if (/imagine|picture this|you're sitting|it's 2|it's 3|at 2am|at 3am/i.test(trimmed)) return "scenario";
  if (/^you /i.test(trimmed)) return "direct-address";
  return "unknown";
}

function extractFeatures(slug: string, mdxContent: string): PostFeatures | null {
  let parsed;
  try {
    parsed = matter(mdxContent);
  } catch {
    return null;
  }

  const body = parsed.content;
  const category = (parsed.data.category as string) || "general-defense";

  const words = body.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount < 100) return null;

  const paragraphs = body.split(/\n\n+/).filter((p) => p.trim().length > 20);
  const paragraphCount = paragraphs.length;
  const avgParagraphLength = paragraphCount > 0 ? wordCount / paragraphCount : 0;

  const questionMarks = (body.match(/\?/g) || []).length;
  const questionDensityPer1000 = wordCount > 0 ? (questionMarks / wordCount) * 1000 : 0;

  const h2Matches = body.match(/^## /gm) || [];
  const h2Count = h2Matches.length;
  const headingToBodyRatio = wordCount > 0 ? h2Count / (wordCount / 1000) : 0;

  const hasBulletList = /^[-*] /m.test(body);
  const hasNumberedList = /^\d+\. /m.test(body);

  const boldMatches = body.match(/\*\*[^*]+\*\*/g) || [];
  const boldPhraseDensity = wordCount > 0 ? (boldMatches.length / wordCount) * 1000 : 0;

  const bodyLower = body.toLowerCase();
  const firstPersonCount = (bodyLower.match(/\b(i|we|our|us|my)\b/g) || []).length;
  const secondPersonCount = (bodyLower.match(/\b(you|your|you're|yourself)\b/g) || []).length;
  const totalPronouns = firstPersonCount + secondPersonCount || 1;

  const faqs = parsed.data.faqs;
  const faqCount = Array.isArray(faqs) ? faqs.length : 0;

  const firstParagraph = paragraphs[0] || "";
  const openingPattern = classifyOpening(firstParagraph);

  return {
    slug,
    category,
    wordCount,
    paragraphCount,
    avgParagraphLength: Math.round(avgParagraphLength),
    questionDensityPer1000: Math.round(questionDensityPer1000 * 10) / 10,
    h2Count,
    headingToBodyRatio: Math.round(headingToBodyRatio * 10) / 10,
    hasBulletList,
    hasNumberedList,
    boldPhraseDensity: Math.round(boldPhraseDensity * 10) / 10,
    firstPersonRatio: Math.round((firstPersonCount / totalPronouns) * 100) / 100,
    secondPersonRatio: Math.round((secondPersonCount / totalPronouns) * 100) / 100,
    faqCount,
    openingPattern,
  };
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
}

function summarizeGroup(features: PostFeatures[]) {
  return {
    count: features.length,
    avgWordCount: avg(features.map((f) => f.wordCount)),
    avgQuestionDensity: avg(features.map((f) => f.questionDensityPer1000)),
    avgH2Count: avg(features.map((f) => f.h2Count)),
    avgParagraphLength: avg(features.map((f) => f.avgParagraphLength)),
    avgBoldDensity: avg(features.map((f) => f.boldPhraseDensity)),
    avgFirstPersonRatio: avg(features.map((f) => f.firstPersonRatio)),
    avgSecondPersonRatio: avg(features.map((f) => f.secondPersonRatio)),
    avgFaqCount: avg(features.map((f) => f.faqCount)),
    openingPatterns: Object.fromEntries(
      (["question", "statistic", "scenario", "direct-address", "unknown"] as const).map((p) => [
        p,
        features.filter((f) => f.openingPattern === p).length,
      ])
    ),
    pctWithBulletList: Math.round((features.filter((f) => f.hasBulletList).length / features.length) * 100),
    pctWithNumberedList: Math.round((features.filter((f) => f.hasNumberedList).length / features.length) * 100),
  };
}

export async function extractWinningPatterns(
  supabase: SupabaseClient
): Promise<PatternResult> {
  const blogDir = join(process.cwd(), "content", "blog");
  let files: string[];
  try {
    files = readdirSync(blogDir).filter((f) => f.endsWith(".mdx"));
  } catch {
    console.error("[feedback-patterns] Cannot read content/blog/ directory");
    return { postsAnalyzed: 0, patternsStored: 0 };
  }

  const allFeatures: PostFeatures[] = [];
  for (const file of files) {
    const slug = file.replace(/\.mdx$/, "");
    const content = readFileSync(join(blogDir, file), "utf-8");
    const features = extractFeatures(slug, content);
    if (features) allFeatures.push(features);
  }

  console.log(`[feedback-patterns] Analyzed ${allFeatures.length} posts`);

  if (allFeatures.length < 5) {
    console.log("[feedback-patterns] Too few posts for pattern extraction");
    return { postsAnalyzed: allFeatures.length, patternsStored: 0 };
  }

  const { data: perfRows } = await supabase
    .from("content_performance")
    .select("blog_slug, subscriber_signups, orders_attributed")
    .eq("window_label", "all-time");

  const perfBySlug: Record<string, number> = {};
  let hasRealPerf = false;
  for (const row of perfRows || []) {
    const score = (row.orders_attributed || 0) * 3 + (row.subscriber_signups || 0);
    if (score > 0) hasRealPerf = true;
    perfBySlug[row.blog_slug] = score;
  }

  const ranked = [...allFeatures].sort((a, b) => {
    const aScore = perfBySlug[a.slug] ?? 0;
    const bScore = perfBySlug[b.slug] ?? 0;
    return bScore - aScore;
  });

  const splitAt = Math.max(5, Math.floor(ranked.length / 3));
  const topPosts = ranked.slice(0, splitAt);
  const bottomPosts = ranked.slice(-splitAt);

  const topSummary = summarizeGroup(topPosts);
  const bottomSummary = summarizeGroup(bottomPosts);

  const patterns: Record<string, unknown> = {
    dataSource: hasRealPerf ? "attribution" : "structural-analysis",
    analyzedAt: new Date().toISOString(),
    postCount: allFeatures.length,
    topPerformers: topSummary,
    bottomPerformers: bottomSummary,
    insights: [] as string[],
  };

  const insights = patterns.insights as string[];
  const qDelta = topSummary.avgQuestionDensity - bottomSummary.avgQuestionDensity;
  if (Math.abs(qDelta) > 1) {
    insights.push(
      `Top performers average ${topSummary.avgQuestionDensity} questions/1000 words vs ${bottomSummary.avgQuestionDensity} for bottom. ${qDelta > 0 ? "More questions correlate with better performance." : "Fewer questions correlate with better performance."}`
    );
  }

  const wcDelta = topSummary.avgWordCount - bottomSummary.avgWordCount;
  if (Math.abs(wcDelta) > 200) {
    insights.push(
      `Top performers average ${topSummary.avgWordCount} words vs ${bottomSummary.avgWordCount}. ${wcDelta > 0 ? "Longer posts perform better." : "Shorter posts perform better."}`
    );
  }

  if (topSummary.pctWithNumberedList > bottomSummary.pctWithNumberedList + 20) {
    insights.push(
      `${topSummary.pctWithNumberedList}% of top performers use numbered lists vs ${bottomSummary.pctWithNumberedList}% of bottom. Include numbered steps.`
    );
  }

  const p2Delta = topSummary.avgSecondPersonRatio - bottomSummary.avgSecondPersonRatio;
  if (Math.abs(p2Delta) > 0.05) {
    insights.push(
      `Top performers use ${Math.round(topSummary.avgSecondPersonRatio * 100)}% second-person pronouns vs ${Math.round(bottomSummary.avgSecondPersonRatio * 100)}%. ${p2Delta > 0 ? "More 'you/your' correlates with performance." : "Less direct address correlates with performance."}`
    );
  }

  await supabase.from("demand_feedback").upsert(
    { charge_type_slug: "_global", winning_patterns: patterns },
    { onConflict: "charge_type_slug" }
  );
  let patternsStored = 1;

  const byCategory: Record<string, PostFeatures[]> = {};
  for (const f of allFeatures) {
    if (!byCategory[f.category]) byCategory[f.category] = [];
    byCategory[f.category].push(f);
  }

  for (const [category, features] of Object.entries(byCategory)) {
    if (features.length < 3) continue;
    const catSummary = summarizeGroup(features);
    await supabase.from("demand_feedback").upsert(
      {
        charge_type_slug: category,
        winning_patterns: { ...patterns, categoryOverride: catSummary },
      },
      { onConflict: "charge_type_slug" }
    );
    patternsStored++;
  }

  console.log(`[feedback-patterns] Stored patterns for ${patternsStored} categories`);
  return { postsAnalyzed: allFeatures.length, patternsStored };
}
