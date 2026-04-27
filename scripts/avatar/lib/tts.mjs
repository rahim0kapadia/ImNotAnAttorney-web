// Text-to-speech via Microsoft Edge TTS (free, no signup, via HF Space).
// Default voice: en-US-AndrewMultilingualNeural — the INAA-locked voice.
// See docs/brand/persona/voice-direction.md for voice rationale.

import { writeFile } from "node:fs/promises";

const HF_SPACE = "innoai-edge-tts-text-to-speech.hf.space";
const DEFAULT_VOICE = "en-US-AndrewMultilingualNeural - en-US (Male)";

export async function generateTTS({ script, voice = DEFAULT_VOICE, outputPath, rate = 0, pitch = 0 }) {
  if (!script) throw new Error("script is required");
  if (!outputPath) throw new Error("outputPath is required");

  const initResp = await fetch(`https://${HF_SPACE}/gradio_api/call/tts_interface`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [script, voice, rate, pitch] }),
  });
  const init = await initResp.json();
  const eventId = init.event_id;
  if (!eventId) throw new Error(`TTS init failed: ${JSON.stringify(init)}`);

  const streamResp = await fetch(`https://${HF_SPACE}/gradio_api/call/tts_interface/${eventId}`);
  const streamText = await streamResp.text();
  const urlMatch = streamText.match(/https?:\/\/[^"]+\.mp3/);
  if (!urlMatch) throw new Error(`TTS result parse failed: ${streamText.slice(0, 300)}`);

  const audioResp = await fetch(urlMatch[0]);
  if (!audioResp.ok) throw new Error(`TTS download failed: ${audioResp.status}`);
  const buf = Buffer.from(await audioResp.arrayBuffer());
  await writeFile(outputPath, buf);
  return { outputPath, bytes: buf.length, voice, script };
}

// Script audit: flags PROHIBITED directive phrasing (UPL guardrail).
// See .claude/rules/brand-voice.md + docs/brand/persona/voice-direction.md.
// Returns { clean: boolean, violations: [{phrase, reason}] }.
export function auditScriptForUPL(script) {
  const violations = [];
  const patterns = [
    { re: /\byou (should|need to|must|have to|don'?t need)\b/gi, reason: "directive phrasing — rewrite as observation or question" },
    { re: /\bfile a (motion|petition|appeal)\b/gi, reason: "telling defendant to take legal action — advice, not information" },
    { re: /\bfire your (attorney|lawyer)\b/gi, reason: "directive about legal representation" },
    { re: /\btake the plea\b/gi, reason: "telling defendant how to decide — advice" },
    { re: /\bchallenge the\b/gi, reason: "telling defendant to challenge something — advice, rewrite as 'here's what can be challenged'" },
  ];
  for (const { re, reason } of patterns) {
    const matches = script.match(re);
    if (matches) matches.forEach(m => violations.push({ phrase: m, reason }));
  }
  return { clean: violations.length === 0, violations };
}
