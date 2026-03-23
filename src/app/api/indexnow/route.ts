/**
 * IndexNow API route — instantly notifies Bing (and partners) when content changes.
 *
 * POST /api/indexnow with body: { urls: string[] }
 * Protected by CRON_SECRET to prevent abuse.
 *
 * IndexNow key file lives at /public/e4052ae08a6601d2550172f078562c00.txt
 * Docs: https://www.indexnow.org/documentation
 */
import { NextRequest, NextResponse } from "next/server";
import { SITE_URL } from "@/lib/site";
import crypto from "crypto";

const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "e4052ae08a6601d2550172f078562c00";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  const secretBuf = Buffer.from(secret);
  const expectedBuf = Buffer.from(expected);
  if (!secret || !expected || secretBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(secretBuf, expectedBuf)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const urls: unknown = body.urls;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json(
      { error: "urls array is required" },
      { status: 400 }
    );
  }

  // Validate all URLs belong to our domain — prevent SSRF via IndexNow
  const siteHost = new URL(SITE_URL).host;
  const validUrls = (urls as string[])
    .map((u) => (u.startsWith("http") ? u : `${SITE_URL}${u}`))
    .filter((u) => {
      try {
        return new URL(u).host === siteHost;
      } catch {
        return false;
      }
    });

  if (validUrls.length === 0) {
    return NextResponse.json(
      { error: "No valid URLs for this domain" },
      { status: 400 }
    );
  }

  // IndexNow accepts up to 10,000 URLs per request
  const payload = {
    host: siteHost,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: validUrls,
  };

  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      submitted: payload.urlList.length,
    });
  } catch (err) {
    console.error("[IndexNow] Fetch failed:", err);
    return NextResponse.json(
      { error: "IndexNow API unreachable", submitted: 0 },
      { status: 502 }
    );
  }
}
