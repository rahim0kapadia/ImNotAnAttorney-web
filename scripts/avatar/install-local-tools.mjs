#!/usr/bin/env node
// One-command setup of the INAA avatar video pipeline local tools.
// Installs ffmpeg + Wav2Lip (justinjohn0306 fork) + CPU torch + all model checkpoints.
// Idempotent — skips anything already in place.
//
// Usage:
//   node scripts/avatar/install-local-tools.mjs
//
// Override install location with INAA_AVATAR_TOOLS_ROOT env var.
// Default: ~/ai-tools  (Windows: C:\Users\<user>\ai-tools)

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, renameSync, readdirSync, createWriteStream, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { TOOLS_ROOT, WAV2LIP_DIR, WAV2LIP_PYTHON, FFMPEG_DIR, FFMPEG_BIN, WAV2LIP_MODEL_GAN, WAV2LIP_MODEL, FACE_DETECTOR_MODEL } from "./lib/paths.mjs";

const log = (msg) => console.log(`[install] ${msg}`);

function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${res.status}`);
}

async function download(url, dest) {
  log(`↓ ${url} → ${dest}`);
  mkdirSync(dirname(dest), { recursive: true });
  const resp = await fetch(url, { redirect: "follow" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const fileStream = createWriteStream(dest);
  const reader = resp.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(value);
  }
  fileStream.end();
  await new Promise(r => fileStream.on("close", r));
}

async function installFfmpeg() {
  if (existsSync(FFMPEG_BIN)) { log("✓ ffmpeg already present"); return; }
  if (process.platform !== "win32") {
    throw new Error("Auto-install supports Windows only. On macOS: `brew install ffmpeg`. On Linux: `apt install ffmpeg`. Then set INAA_FFMPEG_DIR.");
  }
  mkdirSync(TOOLS_ROOT, { recursive: true });
  const zipPath = join(TOOLS_ROOT, "ffmpeg.zip");
  await download("https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", zipPath);
  log("Extracting ffmpeg...");
  run("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -Path '${zipPath}' -DestinationPath '${TOOLS_ROOT}' -Force`]);
  const extracted = readdirSync(TOOLS_ROOT).find(f => f.startsWith("ffmpeg-") && !f.endsWith(".zip"));
  if (!extracted) throw new Error("ffmpeg extraction failed");
  if (existsSync(FFMPEG_DIR)) rmSync(FFMPEG_DIR, { recursive: true });
  renameSync(join(TOOLS_ROOT, extracted), FFMPEG_DIR);
  rmSync(zipPath);
  if (!existsSync(FFMPEG_BIN)) throw new Error(`ffmpeg install completed but ${FFMPEG_BIN} missing`);
  log("✓ ffmpeg installed");
}

function findPython() {
  // Prefer python3, fall back to python. Must be 3.10+.
  for (const cmd of ["python3", "python"]) {
    const res = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    if (res.status === 0 && res.stdout.match(/Python 3\.(1[0-9]|[2-9][0-9])/)) return cmd;
  }
  throw new Error("Python 3.10+ not found. Install from python.org or your package manager.");
}

async function installWav2Lip() {
  if (existsSync(WAV2LIP_PYTHON)) { log("✓ Wav2Lip venv already present"); return; }

  if (!existsSync(WAV2LIP_DIR)) {
    mkdirSync(dirname(WAV2LIP_DIR), { recursive: true });
    run("git", ["clone", "https://github.com/justinjohn0306/Wav2Lip.git", WAV2LIP_DIR]);
  }

  const python = findPython();
  run(python, ["-m", "venv", "venv"], { cwd: WAV2LIP_DIR });

  // Install CPU torch (cu118 pins in requirements.txt are replaced).
  const pip = process.platform === "win32"
    ? join(WAV2LIP_DIR, "venv/Scripts/pip.exe")
    : join(WAV2LIP_DIR, "venv/bin/pip");

  log("Installing CPU torch...");
  run(pip, ["install", "torch==2.3.0", "torchvision==0.18.0", "--index-url", "https://download.pytorch.org/whl/cpu"]);

  // Patch requirements.txt: drop torch/torchvision/ghc pins, relax batch-face, drop pip self-pin.
  const reqPath = join(WAV2LIP_DIR, "requirements.txt");
  const original = readFileSync(reqPath, "utf8");
  const patched = original
    .split("\n")
    .filter(l => !/^(torch==|torchvision==|ghc==|pip==)/.test(l))
    .map(l => l.replace(/^batch-face==1\.5\.0\.dev0$/, "batch-face"))
    .join("\n");
  const patchedPath = join(WAV2LIP_DIR, "requirements.patched.txt");
  writeFileSync(patchedPath, patched);

  log("Installing Wav2Lip dependencies...");
  run(pip, ["install", "-r", patchedPath]);
  log("✓ Wav2Lip venv ready");
}

async function downloadModels() {
  const jobs = [
    { url: "https://www.adrianbulat.com/downloads/python-fan/s3fd-619a316812.pth", dest: FACE_DETECTOR_MODEL, label: "s3fd face detector (86MB)" },
    { url: "https://github.com/justinjohn0306/Wav2Lip/releases/download/models/mobilenet.pth", dest: join(WAV2LIP_DIR, "checkpoints/mobilenet.pth"), label: "mobilenet (1.8MB)" },
    { url: "https://github.com/justinjohn0306/Wav2Lip/releases/download/models/wav2lip_gan.pth", dest: WAV2LIP_MODEL_GAN, label: "wav2lip_gan.pth (416MB)" },
    { url: "https://github.com/justinjohn0306/Wav2Lip/releases/download/models/wav2lip.pth", dest: WAV2LIP_MODEL, label: "wav2lip.pth (416MB)" },
  ];
  for (const { url, dest, label } of jobs) {
    if (existsSync(dest)) { log(`✓ ${label} already downloaded`); continue; }
    log(`Downloading ${label}...`);
    await download(url, dest);
  }
  log("✓ All model checkpoints ready");
}

(async () => {
  log(`Install root: ${TOOLS_ROOT}`);
  log(`Platform: ${process.platform}`);
  await installFfmpeg();
  await installWav2Lip();
  await downloadModels();
  log("");
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("✓ INAA avatar pipeline tools installed.");
  log("  Wav2Lip:  " + WAV2LIP_DIR);
  log("  ffmpeg:   " + FFMPEG_DIR);
  log("");
  log("Next: node scripts/avatar/generate-video.mjs --script \"...\" --output out.mp4");
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
})().catch(err => {
  console.error("[install] FAILED:", err.message);
  process.exit(1);
});
