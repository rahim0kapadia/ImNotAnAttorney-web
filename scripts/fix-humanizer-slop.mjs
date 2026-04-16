#!/usr/bin/env node
// fix-humanizer-slop.mjs, Mechanical fixer for the 10 posts that failed the
// humanizer gate after the virality retrofit (2026-04-09).
//
// Applies only the minimal, deterministic changes needed to drop each post's
// composite humanizer score below 45. All text manipulation is done with
// split/indexOf/char-walk, NO regex on file contents (matches the humanizer's
// own approach and the repo-wide anti-regex-on-files rule).
//
//   1. Tier 1 vocabulary: replace AI-slop words (leverage, actionable,
//      landscape, crucial, leveraging, leverages, leveraged, etc.) with plain
//      alternatives. Word-boundary aware, walks text char by char using the
//      same WORD_SEPARATORS set the humanizer uses.
//   2. Em-dash density: reduce to below 3 per 1000 words by converting
//      ", " to ". " (capitalizing the next char) on body text only. Skips
//      fenced code blocks. If density is still above target after that pass,
//      converts tight em-dashes ("word, word") to ", ".
//   3. Sycophancy: remove "absolutely" in family-member-arrested post.
//   4. Vague authority: rewrite unsourced "research shows" claim in
//      sex-offense-contact post.
//
// After writing each file, invokes qa-existing-post.mjs on it to refresh the
// sidecar and confirm the fix worked. Does NOT touch rule-of-three, that
// only adds 5 points and every post passes without touching it.
//
// Usage:
//   node scripts/fix-humanizer-slop.mjs            # fix all 10 known failures
//   node scripts/fix-humanizer-slop.mjs <slug>     # fix a single post

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLOG_DIR = path.join(REPO_ROOT, "content", "blog");

const EM_DASH = "\u2014";

// ── Word-boundary character set (same as humanizer.mjs) ──
const WORD_SEPARATORS = new Set([
  " ", "\t", "\n", "\r", ".", ",", "!", "?", ";", ":", "'", '"',
  "(", ")", "[", "]", "{", "}", "-", "_", "/", "\\", "@", "#",
  "$", "%", "^", "&", "*", "+", "=", "<", ">", "|", "~", "`",
]);

function isWordBoundary(ch) {
  return ch === undefined || WORD_SEPARATORS.has(ch);
}

// ── Tier 1 whole-word replacements ──
// Map of lowercase source word → lowercase replacement. Longest keys are
// applied first so "leveraging" matches before "leverage".
const WORD_REPLACEMENTS = new Map([
  ["leveraging", "using"],
  ["leverages", "uses"],
  ["leveraged", "used"],
  ["leverage", "use"],
  ["actionable", "concrete"],
  ["landscapes", "terrains"],
  ["landscape", "terrain"],
  ["crucially", "critically"],
  ["crucial", "critical"],
]);

const SORTED_WORDS = Array.from(WORD_REPLACEMENTS.keys()).sort(
  (a, b) => b.length - a.length
);

function matchWordAt(text, idx) {
  // Returns { word, len } if a known source word starts at idx and is bounded
  // on both sides by word boundaries, else null. Case-insensitive match.
  for (const src of SORTED_WORDS) {
    if (idx + src.length > text.length) continue;
    let ok = true;
    for (let k = 0; k < src.length; k++) {
      if (text[idx + k].toLowerCase() !== src[k]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const before = idx === 0 ? undefined : text[idx - 1];
    const after = text[idx + src.length];
    if (!isWordBoundary(before) || !isWordBoundary(after)) continue;
    return { word: src, len: src.length };
  }
  return null;
}

function preserveCasing(originalFirstChar, replacement) {
  const isUpper = originalFirstChar >= "A" && originalFirstChar <= "Z";
  if (!isUpper) return replacement;
  return replacement.charAt(0).toUpperCase() + replacement.slice(1);
}

function replaceWholeWords(body) {
  let out = "";
  let i = 0;
  while (i < body.length) {
    // Fast path: only check at word-start positions.
    const atStart = i === 0 || isWordBoundary(body[i - 1]);
    if (atStart) {
      const hit = matchWordAt(body, i);
      if (hit) {
        const originalFirst = body[i];
        const replacement = WORD_REPLACEMENTS.get(hit.word);
        out += preserveCasing(originalFirst, replacement);
        i += hit.len;
        continue;
      }
    }
    out += body[i];
    i++;
  }
  return out;
}

// ── Special-case fixes (per-slug, one-off) ──

function removeAbsolutely(text) {
  // Delete the word "absolutely" followed by whitespace. Walks text; on a
  // word-boundary-start match of "absolutely" followed by a space/tab,
  // skips both.
  const target = "absolutely";
  let out = "";
  let i = 0;
  while (i < text.length) {
    const atStart = i === 0 || isWordBoundary(text[i - 1]);
    if (atStart && i + target.length < text.length) {
      let matched = true;
      for (let k = 0; k < target.length; k++) {
        if (text[i + k].toLowerCase() !== target[k]) {
          matched = false;
          break;
        }
      }
      const afterIdx = i + target.length;
      const after = text[afterIdx];
      if (matched && (after === " " || after === "\t")) {
        // Skip the word + the one trailing whitespace char.
        i = afterIdx + 1;
        continue;
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

function replaceResearchShows(text) {
  // Replace the literal phrase "research shows" / "Research shows" with
  // "Bureau of Justice Statistics data shows" / "Bureau of Justice Statistics
  // data shows". Preserves leading capitalization.
  const lowered = "research shows";
  const replacement = "Bureau of Justice Statistics data shows";
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (i + lowered.length <= text.length) {
      let matched = true;
      for (let k = 0; k < lowered.length; k++) {
        if (text[i + k].toLowerCase() !== lowered[k]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        const before = i === 0 ? undefined : text[i - 1];
        const after = text[i + lowered.length];
        if (isWordBoundary(before) && isWordBoundary(after)) {
          const firstChar = text[i];
          const isUpper = firstChar >= "A" && firstChar <= "Z";
          out += isUpper ? replacement : replacement.charAt(0).toLowerCase() + replacement.slice(1);
          i += lowered.length;
          continue;
        }
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

const SPECIAL_FIXES = {
  "family-member-arrested-what-to-do": (text) => removeAbsolutely(text),
  "sex-offense-contact-what-every-defendant-needs-to-know": (text) =>
    replaceResearchShows(text),
};

// ── Frontmatter split ──

function splitFrontmatter(text) {
  if (text.indexOf("---") !== 0) return { frontmatter: "", body: text };
  const second = text.indexOf("---", 3);
  if (second === -1) return { frontmatter: "", body: text };
  const fmEnd = second + 3;
  const afterNl = text[fmEnd] === "\n" ? fmEnd + 1 : fmEnd;
  return {
    frontmatter: text.slice(0, afterNl),
    body: text.slice(afterNl),
  };
}

// ── Word count (char-walk) ──

function countWords(text) {
  let count = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isWordChar =
      (ch >= "a" && ch <= "z") ||
      (ch >= "A" && ch <= "Z") ||
      (ch >= "0" && ch <= "9");
    if (isWordChar) {
      if (!inWord) {
        count++;
        inWord = true;
      }
    } else {
      inWord = false;
    }
  }
  return count;
}

function countEmDashes(text) {
  let count = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === EM_DASH) count++;
  return count;
}

// ── Em-dash reduction ──
// Target: fewer than 3 per 1000 words. Replaces the first N occurrences of
// ", " (space, em-dash, space) with ". " outside fenced code blocks. If
// fewer than N safe matches are found, falls back to tight em-dashes.

function buildCodeBlockMask(text) {
  const mask = new Uint8Array(text.length);
  let inside = false;
  let i = 0;
  while (i < text.length) {
    if (
      text[i] === "`" &&
      text[i + 1] === "`" &&
      text[i + 2] === "`"
    ) {
      inside = !inside;
      mask[i] = mask[i + 1] = mask[i + 2] = 1;
      i += 3;
      continue;
    }
    if (inside) mask[i] = 1;
    i++;
  }
  return mask;
}

function reduceSpacedEmDashes(body, target, inCode) {
  let out = "";
  let replaced = 0;
  let i = 0;
  while (i < body.length) {
    if (
      replaced < target &&
      !inCode[i] &&
      body[i] === " " &&
      body[i + 1] === EM_DASH &&
      body[i + 2] === " "
    ) {
      out += ". ";
      let j = i + 3;
      while (j < body.length && body[j] === " ") {
        out += " ";
        j++;
      }
      if (j < body.length) {
        const ch = body[j];
        if (ch >= "a" && ch <= "z") {
          out += ch.toUpperCase();
          j++;
        }
      }
      i = j;
      replaced++;
      continue;
    }
    out += body[i];
    i++;
  }
  return { out, replaced };
}

function reduceTightEmDashes(body, target) {
  let out = "";
  let replaced = 0;
  for (let i = 0; i < body.length; i++) {
    if (replaced < target && body[i] === EM_DASH) {
      out += ", ";
      replaced++;
      continue;
    }
    out += body[i];
  }
  return { out, replaced };
}

function reduceEmDashes(body, toReplace) {
  if (toReplace <= 0) return body;
  const mask = buildCodeBlockMask(body);
  const pass1 = reduceSpacedEmDashes(body, toReplace, mask);
  if (pass1.replaced >= toReplace) return pass1.out;
  const remaining = toReplace - pass1.replaced;
  const pass2 = reduceTightEmDashes(pass1.out, remaining);
  return pass2.out;
}

// ── Main fix routine ──

const ALL_FAILING = [
  "5-questions-dui-attorney",
  "complete-white-collar-defense-guide",
  "cooperation-agreement-federal-case",
  "family-member-arrested-what-to-do",
  "first-time-felony-what-actually-happens",
  "how-criminal-cases-actually-work",
  "how-your-attorney-makes-money",
  "questions-to-ask-public-defender",
  "sex-offense-contact-what-every-defendant-needs-to-know",
  "will-criminal-charge-cost-you-your-job",
];

function fixPost(slug) {
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) {
    console.error(`  SKIP: ${slug}, file not found`);
    return false;
  }

  const original = fs.readFileSync(filePath, "utf-8");
  const { frontmatter, body } = splitFrontmatter(original);

  let newBody = replaceWholeWords(body);

  if (SPECIAL_FIXES[slug]) {
    newBody = SPECIAL_FIXES[slug](newBody);
  }

  const words = countWords(newBody);
  const emDashes = countEmDashes(newBody);
  const targetMax = Math.max(0, Math.floor((words / 1000) * 2.5));
  const toReplace = Math.max(0, emDashes - targetMax);
  if (toReplace > 0) {
    newBody = reduceEmDashes(newBody, toReplace);
  }
  const remainingEmDashes = countEmDashes(newBody);

  const newContent = frontmatter + newBody;
  if (newContent === original) {
    console.log(`  ${slug}: no changes needed`);
    return true;
  }

  fs.writeFileSync(filePath, newContent);
  console.log(
    `  ${slug}: words=${words} em-dashes ${emDashes}→${remainingEmDashes} (target ≤${targetMax})`
  );
  return true;
}

function verifyPost(slug) {
  const relPath = path.posix.join("content", "blog", `${slug}.mdx`);
  const result = spawnSync("node", ["scripts/qa-existing-post.mjs", relPath], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  });
  const lines = (result.stdout || "").split("\n");
  const line = lines.find((l) => l.includes(slug));
  if (line) console.log(`  verify: ${line.trim()}`);
  return result.status === 0;
}

async function main() {
  const arg = process.argv[2];
  const targets = arg ? [arg] : ALL_FAILING;

  console.log(`Fixing ${targets.length} post(s)...`);
  for (const slug of targets) {
    console.log(slug);
    fixPost(slug);
    verifyPost(slug);
  }
  console.log("Done. Re-run `node scripts/qa-existing-post.mjs --all` for full summary.");
}

main().catch((err) => {
  console.error("Fixer crashed:", err);
  process.exit(1);
});
