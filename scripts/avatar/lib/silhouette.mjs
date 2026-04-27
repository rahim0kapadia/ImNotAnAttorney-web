// Silhouette matte post-processing via ffmpeg. See docs/brand/persona/avatar-direction.md
// for the brand rationale — Frontline / 60 Minutes anonymity vocabulary.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { FFMPEG_BIN, SILHOUETTE_MATTE } from "./paths.mjs";

// Applies the static silhouette matte over a Wav2Lip output.
// Input MUST be 768x768 to match the canonical matte. If it isn't, the matte
// filter auto-scales but the feather placement may be off.
export async function applySilhouette({ inputVideo, outputVideo, matte = SILHOUETTE_MATTE, darkness = 0.08 }) {
  if (!existsSync(inputVideo)) throw new Error(`inputVideo not found: ${inputVideo}`);
  if (!existsSync(matte)) throw new Error(`matte not found: ${matte}`);
  if (!existsSync(FFMPEG_BIN)) throw new Error(`ffmpeg not found at ${FFMPEG_BIN}. Run install-local-tools.mjs.`);

  const filter = `
    [0:v]split=2[base][dark_src];
    [dark_src]lutyuv=y=val*${darkness}[dark];
    [1:v]format=gray,scale=768:768[mask];
    [dark][base][mask]maskedmerge[out]
  `.replace(/\s+/g, " ").trim();

  const args = [
    "-y",
    "-i", inputVideo,
    "-loop", "1", "-i", matte,
    "-filter_complex", filter,
    "-map", "[out]", "-map", "0:a",
    "-c:v", "libx264", "-crf", "20", "-preset", "fast",
    "-c:a", "copy",
    "-shortest",
    outputVideo,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args);
    let stderr = "";
    proc.stderr.on("data", d => { stderr += d.toString(); });
    proc.on("close", code => {
      if (code === 0) resolve({ outputVideo });
      else reject(new Error(`ffmpeg exited ${code}\n${stderr.slice(-800)}`));
    });
    proc.on("error", reject);
  });
}
