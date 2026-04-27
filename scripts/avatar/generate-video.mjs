#!/usr/bin/env node
// End-to-end INAA avatar video: script text → TTS → Wav2Lip → silhouette → MP4.
//
// Usage:
//   node scripts/avatar/generate-video.mjs --script "..." [--output final.mp4]
//   node scripts/avatar/generate-video.mjs --script "..." --no-silhouette   # skip matte
//   node scripts/avatar/generate-video.mjs --script "..." --face path.png   # override canonical
//   node scripts/avatar/generate-video.mjs --script "..." --force           # bypass UPL audit
//
// Requires local tools: run `node scripts/avatar/install-local-tools.mjs` once per machine.

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { generateTTS, auditScriptForUPL } from "./lib/tts.mjs";
import { runWav2Lip } from "./lib/wav2lip.mjs";
import { applySilhouette } from "./lib/silhouette.mjs";
import { CANONICAL_IMAGE, OUTPUT_DIR, checkLocalTools } from "./lib/paths.mjs";

function parseArgs(argv) {
  const args = { silhouette: true, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--script" || a === "-s") args.script = argv[++i];
    else if (a === "--output" || a === "-o") args.output = argv[++i];
    else if (a === "--face") args.face = argv[++i];
    else if (a === "--voice") args.voice = argv[++i];
    else if (a === "--no-silhouette") args.silhouette = false;
    else if (a === "--force") args.force = true;
  }
  return args;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.script) {
    console.error(`Usage: node generate-video.mjs --script "..." [--output out.mp4] [--face img.png] [--voice name] [--no-silhouette] [--force]`);
    process.exit(2);
  }

  const missing = checkLocalTools();
  if (missing.length) {
    console.error("❌ Local tools missing:");
    missing.forEach(m => console.error(`   - ${m}`));
    console.error("\nRun: node scripts/avatar/install-local-tools.mjs");
    process.exit(1);
  }

  const audit = auditScriptForUPL(args.script);
  if (!audit.clean) {
    console.error("\n⚠️  UPL SCRIPT AUDIT FAILED — advice/directive phrasing detected:\n");
    for (const v of audit.violations) console.error(`  "${v.phrase}" — ${v.reason}`);
    console.error("\nRewrite as information/question, or pass --force to bypass (testing only).");
    if (!args.force) process.exit(1);
    console.error("⚠️  --force set, continuing anyway.\n");
  }

  const face = resolve(args.face || CANONICAL_IMAGE);
  if (!existsSync(face)) { console.error(`Face image not found: ${face}`); process.exit(1); }

  const stamp = Date.now();
  const workDir = join(OUTPUT_DIR, `run-${stamp}`);
  mkdirSync(workDir, { recursive: true });

  const audioPath = join(workDir, "voice.mp3");
  const lipsyncPath = join(workDir, "lipsync.mp4");
  const finalPath = resolve(args.output || join(workDir, "final.mp4"));
  mkdirSync(dirname(finalPath), { recursive: true });

  console.log(`\n[1/3] TTS → ${audioPath}`);
  await generateTTS({ script: args.script, voice: args.voice, outputPath: audioPath });

  console.log(`[2/3] Wav2Lip → ${lipsyncPath}`);
  await runWav2Lip({ faceImage: face, audio: audioPath, outputPath: lipsyncPath });

  if (args.silhouette) {
    console.log(`[3/3] Silhouette matte → ${finalPath}`);
    await applySilhouette({ inputVideo: lipsyncPath, outputVideo: finalPath });
  } else {
    console.log(`[3/3] Silhouette skipped — copying raw lipsync to output`);
    const { copyFileSync } = await import("node:fs");
    copyFileSync(lipsyncPath, finalPath);
  }

  console.log(`\n✓ DONE → ${finalPath}`);
  console.log(`  Work dir: ${workDir} (TTS + raw lipsync preserved for debugging)`);
})().catch(err => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
