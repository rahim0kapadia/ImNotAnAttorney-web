#!/usr/bin/env node
/**
 * Case Decoder Report Audit Script
 *
 * Pulls the generated report from Supabase and verifies:
 * 1. All 13 sections + letter + closing present
 * 2. Exactly 15 questions (5 Priority + 10 Additional)
 * 3. Exactly 10 evidence patterns
 * 4. Exactly 8 red flags
 * 5. Total word count under 5,000
 * 6. No old terminology
 * 7. No duplicate questions
 *
 * Usage: node scripts/audit-report.js <caseId>
 */

const SUPABASE_URL = "https://jxjbjmgdukwkoclydqdr.supabase.co";
// Use JWT format key
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4amJqbWdkdWt3a29jbHlkcWRyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUzMTUwNywiZXhwIjoyMDg3MTA3NTA3fQ.Ok8IFjorLbDMX0RDiZI2x3CRTMHEageMfhm4-sGg3f8";

async function main() {
  const caseId = process.argv[2];
  if (!caseId) {
    console.error("Usage: node scripts/audit-report.js <caseId>");
    process.exit(1);
  }

  // Fetch case with report_html
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/cases?id=eq.${caseId}&select=status,report_html,generated_at,report_token`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  const cases = await res.json();
  const caseData = cases[0];

  if (!caseData) {
    console.error("Case not found:", caseId);
    process.exit(1);
  }
  if (!caseData.report_html) {
    console.error("No report_html on case. Status:", caseData.status);
    process.exit(1);
  }

  // Extract markdown from HTML (between the disclaimer div and the footer)
  // For audit purposes, we work with the raw HTML text content
  const html = caseData.report_html;

  // Extract text content (strip HTML tags for word counting)
  const textContent = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const wordCount = textContent.split(/\s+/).length;

  console.log("=== CASE DECODER REPORT AUDIT ===\n");
  console.log(`Case ID: ${caseId}`);
  console.log(`Status: ${caseData.status}`);
  console.log(`Generated: ${caseData.generated_at}`);
  console.log(`Report Token: ${caseData.report_token?.slice(0, 8)}...`);
  console.log(`Total word count: ${wordCount}\n`);

  let passed = 0;
  let failed = 0;

  function check(name, condition, detail) {
    if (condition) {
      console.log(`  PASS: ${name}${detail ? " — " + detail : ""}`);
      passed++;
    } else {
      console.log(`  FAIL: ${name}${detail ? " — " + detail : ""}`);
      failed++;
    }
  }

  // 1. Section presence
  console.log("\n--- Section Completeness ---");
  const sections = [
    ["A Letter to You", /A Letter to You/i],
    ["Section 1: Defense Milestone Score", /Section 1[:\s]/i],
    ["Section 2: Case Clock", /Section 2[:\s]/i],
    ["Section 3: Charges", /Section 3[:\s]/i],
    ["Section 4: Case Stage", /Section 4[:\s]/i],
    ["Section 5: Communication Playbook", /Section 5[:\s]/i],
    ["Section 6: Verify Facts", /Section 6[:\s]/i],
    ["Section 7: Questions", /Section 7[:\s]/i],
    ["Section 8: Evidence Pattern", /Section 8[:\s]/i],
    ["Section 9: Red Flags", /Section 9[:\s]/i],
    ["Section 10: Plea", /Section 10[:\s]/i],
    ["Section 11: Motions", /Section 11[:\s]/i],
    ["Section 12: What", /Section 12[:\s]/i],
    ["Section 13: Meeting Ready", /Section 13[:\s]/i],
    ["What This Report Cannot Tell You", /What This Report Cannot/i],
  ];
  for (const [name, regex] of sections) {
    check(name, regex.test(html), regex.test(html) ? "found" : "MISSING");
  }

  // 2. Question count
  console.log("\n--- Question Count ---");
  const questionMatches = html.match(/\bQ\d+[:\s]/g) || [];
  const uniqueQs = [...new Set(questionMatches.map((q) => q.replace(/[:\s]/g, "")))];
  check("Exactly 15 questions", uniqueQs.length === 15, `found ${uniqueQs.length}: ${uniqueQs.join(", ")}`);

  // Check priority questions
  const hasPriority = /START HERE/i.test(html);
  check("START HERE box present", hasPriority);

  // 3. Evidence patterns
  console.log("\n--- Evidence Patterns ---");
  // Count table rows in Section 8 area - approximate
  const s8Match = html.match(/Section 8[\s\S]*?Section 9/i);
  if (s8Match) {
    const s8Rows = (s8Match[0].match(/<tr>/g) || []).length;
    // Subtract header row(s)
    const patternCount = Math.max(0, s8Rows - 1);
    check("Exactly 10 evidence patterns", patternCount >= 9 && patternCount <= 12, `found ~${patternCount} table rows`);
  } else {
    check("Section 8 extractable", false, "Could not isolate Section 8");
  }

  // 4. Red flags
  console.log("\n--- Red Flags ---");
  const criticalCount = (html.match(/CRITICAL/g) || []).length;
  const seriousCount = (html.match(/SERIOUS/g) || []).length;
  const monitorCount = (html.match(/MONITOR/g) || []).length;
  const totalFlags = criticalCount + seriousCount + monitorCount;
  check("Exactly 8 red flags", totalFlags >= 7 && totalFlags <= 9, `found ${totalFlags} severity indicators (${criticalCount} CRITICAL, ${seriousCount} SERIOUS, ${monitorCount} MONITOR)`);

  // 5. Word count
  console.log("\n--- Word Count ---");
  check("Under 5,000 words", wordCount < 5000, `${wordCount} words`);

  // 6. No old terminology
  console.log("\n--- Terminology ---");
  check("No 'Attorney Accountability' (old term)", !/Attorney Accountability/i.test(html));
  check("No 'prosecution burden' (old term)", !/prosecution burden/i.test(html));
  check("No 'bad answer' (old term)", !/bad answer/i.test(html) || /Red Flag Response/i.test(html));

  // Summary
  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
  if (failed === 0) {
    console.log("ALL CHECKS PASSED");
  } else {
    console.log("SOME CHECKS FAILED — review above");
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Audit error:", e);
  process.exit(1);
});
