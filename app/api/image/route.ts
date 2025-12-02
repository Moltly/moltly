export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { keyFromS3Url, publicUrlForKey } from "../../../lib/s3";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get("url") || "";
    if (!rawUrl) {
      return NextResponse.json({ error: "Invalid or disallowed url" }, { status: 400 });
    }

    const key = keyFromS3Url(rawUrl);
    if (!key) {
      return NextResponse.json({ error: "Invalid or disallowed url" }, { status: 400 });
    }

    const targetUrl = publicUrlForKey(key);
    if (!targetUrl) {
      return NextResponse.json({ error: "Image proxy not configured" }, { status: 503 });
    }

    const upstream = await fetch(targetUrl, {
      cache: "no-store",
      redirect: "follow",
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: 502 });
    }

    const body = upstream.body;
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
    headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=86400");
    const etag = upstream.headers.get("etag");
    const lastMod = upstream.headers.get("last-modified");
    if (etag) headers.set("ETag", etag);
    if (lastMod) headers.set("Last-Modified", lastMod);

    return new NextResponse(body, { status: 200, headers });
  } catch (err) {
    return NextResponse.json({ error: "Image proxy error" }, { status: 500 });
  }
}
