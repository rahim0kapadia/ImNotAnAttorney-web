#!/usr/bin/env node
// Standalone TTS generator using the INAA-locked AndrewMulti voice.
// Audits the script for UPL violations before generating.
//
// Usage:
//   node scripts/avatar/generate-tts.mjs --script "..." [--output voice.mp3] [--force]
//
// With --force, skips the UPL audit (use only for testing).

import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { generateTTS, auditScriptForUPL } from "./lib/tts.mjs";
import { OUTPUT_DIR } from "./lib/paths.mjs";

function parseArgs(argv) {
  const args = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--script" || a === "-s") args.script = argv[++i];
    else if (a === "--output" || a === "-o") args.output = argv[++i];
    else if (a === "--voice") args.voice = argv[++i];
    else if (a === "--force") args.force = true;
  }
  return args;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.script) {
    console.error("Usage: node generate-tts.mjs --script \"...\" [--output voice.mp3] [--force]");
    process.exit(2);
  }

  const audit = auditScriptForUPL(args.script);
  if (!audit.clean) {
    console.error("\n⚠️  UPL SCRIPT AUDIT FAILED — advice/directive phrasing detected:\n");
    for (const v of audit.violations) console.error(`  "${v.phrase}" — ${v.reason}`);
    console.error("\nRewrite as information/question, or pass --force to bypass (testing only).");
    if (!args.force) process.exit(1);
    console.error("⚠️  --force set, continuing anyway.\n");
  }

  const outputPath = resolve(args.output || join(OUTPUT_DIR, `tts-${Date.now()}.mp3`));
  mkdirSync(dirname(outputPath), { recursive: true });

  console.log(`Generating TTS → ${outputPath}`);
  const result = await generateTTS({ script: args.script, voice: args.voice, outputPath });
  console.log(`✓ ${result.bytes} bytes written`);
})().catch(err => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
