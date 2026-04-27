// Wav2Lip lip-sync wrapper. Drives the locally-installed Wav2Lip via its venv python.

import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { existsSync } from "node:fs";
import { WAV2LIP_DIR, WAV2LIP_PYTHON, WAV2LIP_MODEL_GAN, FFMPEG_BIN } from "./paths.mjs";

export async function runWav2Lip({ faceImage, audio, outputPath, model = "gan", padBottom = 20, nosmooth = true }) {
  if (!existsSync(faceImage)) throw new Error(`faceImage not found: ${faceImage}`);
  if (!existsSync(audio)) throw new Error(`audio not found: ${audio}`);
  if (!existsSync(WAV2LIP_PYTHON)) {
    throw new Error(`Wav2Lip venv missing at ${WAV2LIP_PYTHON}. Run: node scripts/avatar/install-local-tools.mjs`);
  }

  const checkpoint = model === "gan" ? WAV2LIP_MODEL_GAN : WAV2LIP_MODEL_GAN.replace("_gan.pth", ".pth");
  const args = [
    "inference.py",
    "--checkpoint_path", checkpoint,
    "--face", faceImage,
    "--audio", audio,
    "--outfile", outputPath,
    "--pads", "0", String(padBottom), "0", "0",
  ];
  if (nosmooth) args.push("--nosmooth");

  // ffmpeg needs to be on PATH because Wav2Lip shells out to it.
  const env = { ...process.env, PATH: `${dirname(FFMPEG_BIN)};${process.env.PATH}` };

  return new Promise((resolve, reject) => {
    const proc = spawn(WAV2LIP_PYTHON, args, { cwd: WAV2LIP_DIR, env });
    let stderr = "";
    proc.stdout.on("data", d => process.stdout.write(`[wav2lip] ${d}`));
    proc.stderr.on("data", d => { stderr += d.toString(); process.stderr.write(`[wav2lip] ${d}`); });
    proc.on("close", code => {
      if (code === 0) resolve({ outputPath });
      else reject(new Error(`Wav2Lip exited ${code}\n${stderr.slice(-800)}`));
    });
    proc.on("error", reject);
  });
}
