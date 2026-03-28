/**
 * TEMPORARY diagnostic endpoint — remove after CRON_SECRET alignment.
 * Returns a SHA-256 hash prefix of CRON_SECRET so we can verify the value
 * Vercel has without exposing the actual secret.
 */
import { NextResponse } from "next/server";
import { createHash } from "crypto";

export async function GET() {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ exists: false });
  }
  const hash = createHash("sha256").update(secret).digest("hex");
  return NextResponse.json({
    exists: true,
    length: secret.length,
    hashPrefix: hash.substring(0, 16),
  });
}
