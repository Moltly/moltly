export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get("url") || "";
    if (!rawUrl || !isHttpUrl(rawUrl)) {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }

    const upstream = await fetch(rawUrl, {
      // Avoid re-using client cache semantics; SW will handle runtime cache
      cache: "no-store",
      redirect: "follow",
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: 502 });
    }

    const body = upstream.body;
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
    // Reasonable browser cache plus SW runtime cache; SW will still manage updates
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

