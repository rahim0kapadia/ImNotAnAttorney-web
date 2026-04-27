// Shared paths for the INAA avatar video pipeline.
// Override any path via an env var if the local install lives elsewhere.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Repo root (two levels up from this file: scripts/avatar/lib/ -> repo root)
export const REPO_ROOT = resolve(__dirname, "../../..");

// Canonical assets that live in the repo.
export const ASSETS_DIR = join(REPO_ROOT, "scripts/avatar/assets");
export const CANONICAL_IMAGE = join(ASSETS_DIR, "v16-canonical.png");
export const SILHOUETTE_MATTE = join(ASSETS_DIR, "silhouette-matte-768.png");
export const VOICE_REFERENCE = join(ASSETS_DIR, "voice-reference-andrewmulti.mp3");

// Local tool install locations (override via env var per machine).
// Default: C:/Users/<me>/ai-tools/... on Windows, ~/ai-tools/... on *nix.
const HOME = process.env.USERPROFILE || process.env.HOME || "";
const DEFAULT_TOOLS_ROOT = join(HOME, "ai-tools");
export const TOOLS_ROOT = process.env.INAA_AVATAR_TOOLS_ROOT || DEFAULT_TOOLS_ROOT;

export const WAV2LIP_DIR = process.env.INAA_WAV2LIP_DIR || join(TOOLS_ROOT, "Wav2Lip");
export const FFMPEG_DIR = process.env.INAA_FFMPEG_DIR || join(TOOLS_ROOT, "ffmpeg");

// Resolve the platform-specific venv python + ffmpeg exe.
export const WAV2LIP_PYTHON = process.platform === "win32"
  ? join(WAV2LIP_DIR, "venv/Scripts/python.exe")
  : join(WAV2LIP_DIR, "venv/bin/python");

export const FFMPEG_BIN = process.platform === "win32"
  ? join(FFMPEG_DIR, "bin/ffmpeg.exe")
  : join(FFMPEG_DIR, "bin/ffmpeg");

// Wav2Lip model checkpoints (downloaded during install).
export const WAV2LIP_MODEL_GAN = join(WAV2LIP_DIR, "checkpoints/wav2lip_gan.pth");
export const WAV2LIP_MODEL = join(WAV2LIP_DIR, "checkpoints/wav2lip.pth");
export const FACE_DETECTOR_MODEL = join(WAV2LIP_DIR, "face_detection/detection/sfd/s3fd.pth");

// Default output dir for generated pipeline artifacts (not committed).
export const OUTPUT_DIR = process.env.INAA_AVATAR_OUTPUT_DIR || join(TOOLS_ROOT, "inaa-avatar-output");

// Verify required local tools are installed. Returns array of missing items.
export function checkLocalTools() {
  const missing = [];
  if (!existsSync(WAV2LIP_PYTHON)) missing.push(`Wav2Lip venv (${WAV2LIP_PYTHON})`);
  if (!existsSync(FFMPEG_BIN)) missing.push(`ffmpeg (${FFMPEG_BIN})`);
  if (!existsSync(WAV2LIP_MODEL_GAN)) missing.push(`wav2lip_gan.pth (${WAV2LIP_MODEL_GAN})`);
  if (!existsSync(FACE_DETECTOR_MODEL)) missing.push(`s3fd.pth (${FACE_DETECTOR_MODEL})`);
  return missing;
}
