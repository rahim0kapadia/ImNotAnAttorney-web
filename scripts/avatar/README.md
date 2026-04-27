# INAA Avatar Video Pipeline

End-to-end script-to-video pipeline for the INAA brand avatar. Generates Harvey-coded anonymous-strategist talking-head videos from a single line of text, locally, at zero per-video cost.

See `docs/brand/persona/` for the brand specs this pipeline implements (character, voice, UPL guardrails, backstory).

## First-time setup (per machine)

```bash
node scripts/avatar/install-local-tools.mjs
```

Installs:
- `ffmpeg` (Windows: auto-downloaded from gyan.dev; macOS/Linux: install manually via brew/apt first)
- Wav2Lip repo (justinjohn0306 Python 3.10+ fork) + CPU-compatible PyTorch
- Model checkpoints (~900MB total: `wav2lip_gan.pth`, `wav2lip.pth`, `s3fd.pth`, `mobilenet.pth`)

Default install root: `~/ai-tools/` (or `C:\Users\<you>\ai-tools\` on Windows). Override with `INAA_AVATAR_TOOLS_ROOT=<path>`.

Idempotent — re-run to heal a partial install.

## Generate a video

```bash
node scripts/avatar/generate-video.mjs \
  --script "I spent a decade inside the system. I watched cases get decided before anyone walked into court." \
  --output ./my-video.mp4
```

What happens:
1. **UPL audit** — script is checked for directive/advice phrasing; fails loudly if it says "you should…" or "file a motion…" etc.
2. **TTS** — AndrewMultilingual voice via Edge TTS (free, no signup)
3. **Wav2Lip** — drives the canonical face (v16, `assets/v16-canonical.png`) with the TTS audio
4. **Silhouette matte** — ffmpeg applies the Frontline-style shadow matte to the upper face

Flags:
- `--face path.png` — override the canonical face (rare, e.g. for an alternate pose)
- `--voice "en-US-Brian..."` — override voice
- `--no-silhouette` — skip the anonymity matte (debugging)
- `--force` — bypass the UPL audit (testing only — will ship advice, don't do this for production)

## Generate just the audio (no video)

```bash
node scripts/avatar/generate-tts.mjs --script "..." --output voice.mp3
```

Useful for iterating on script/voice before running the full pipeline.

## Anatomy

```
scripts/avatar/
├── install-local-tools.mjs       # one-command machine setup
├── generate-video.mjs             # end-to-end script → mp4
├── generate-tts.mjs               # standalone TTS helper
├── assets/
│   ├── v16-canonical.png          # SACRED — the canonical avatar face
│   ├── silhouette-matte-768.png   # anonymity matte (upper face dark, mouth lit)
│   └── voice-reference-andrewmulti.mp3  # reference sample of the locked voice
└── lib/
    ├── paths.mjs                  # shared config / env overrides
    ├── tts.mjs                    # Edge TTS wrapper + UPL audit
    ├── wav2lip.mjs                # lip-sync subprocess runner
    └── silhouette.mjs             # ffmpeg matte application
```

## Brand specs this enforces

- **UPL compliance** — every script is audited for advice/directive phrasing before TTS (see `.claude/rules/brand-voice.md` UPL guardrail). Information and questions only. No "you should", no "file a motion", no "fire your attorney".
- **Character consistency** — all videos use the same canonical face (v16). For alternate poses/expressions, character-reference workflow (PuLID-FLUX or LoRA) should anchor to v16.
- **Anonymity** — post-production silhouette matte (not gaussian blur) on the upper face. Whistleblower / 60 Minutes vocabulary, not reality-TV pixelation.
- **Voice lock** — AndrewMultilingual via Edge TTS (free tier). Graduation to ElevenLabs Professional Voice Clone planned when revenue supports it.

Full rationale: `docs/brand/persona/persona-master.md`.

## Troubleshooting

- **"Local tools missing" on generate-video** — run `install-local-tools.mjs` first.
- **UPL audit fails** — rewrite the script: "You should X" → observation ("Here's what typically happens"), question ("What did Y say about X?"), or INAA service description ("We help you see what's in Y").
- **Wav2Lip face-detection fails** — the face image needs a clear frontal or 3/4 face with a visible mouth. v16 and PuLID-generated variants all work. Pure silhouette source images will fail.
- **Silhouette looks wrong on non-768px video** — the matte is calibrated for 768x768 framing. Adjust the matte PNG or input resolution.

## Regenerating the sacred assets

If the canonical character or silhouette matte needs to be updated:
- Canonical face: regenerate via PuLID-FLUX anchored to the current v16, or via a trained LoRA (future). Approved replacement replaces `assets/v16-canonical.png`.
- Silhouette matte: Python/PIL one-liner — see git history of this directory for the generation code. Output stays 768x768.
- Voice reference: re-run `generate-tts.mjs` with a canonical sample line. Replaces `assets/voice-reference-andrewmulti.mp3`.

Don't replace these assets casually — they're the brand. Changes should go through a proper brand review.
