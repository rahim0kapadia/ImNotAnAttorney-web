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

const INDEXNOW_KEY = "e4052ae08a6601d2550172f078562c00";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const urls: string[] = body.urls;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json(
      { error: "urls array is required" },
      { status: 400 }
    );
  }

  // IndexNow accepts up to 10,000 URLs per request
  const payload = {
    host: new URL(SITE_URL).host,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: urls.map((u) => (u.startsWith("http") ? u : `${SITE_URL}${u}`)),
  };

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
}
