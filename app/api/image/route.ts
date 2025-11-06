import { NextRequest, NextResponse } from "next/server";

function getAllowedHosts(): Set<string> {
  const hosts = new Set<string>();
  const addFromEnv = (value?: string | null) => {
    if (!value) return;
    try {
      const u = new URL(value);
      if (u.hostname) hosts.add(u.hostname);
    } catch {
      // ignore invalid
    }
  };
  addFromEnv(process.env.S3_PUBLIC_URL || null);
  addFromEnv(process.env.S3_ENDPOINT || null);
  // Local dev convenience: allow localhost variations
  hosts.add("localhost");
  hosts.add("127.0.0.1");
  return hosts;
}

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get("url");
  if (!urlParam) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  const allowedHosts = getAllowedHosts();
  if (!allowedHosts.has(target.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString(), { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${upstream.status}` },
        { status: upstream.status }
      );
    }

    // Stream the body through and copy basic headers
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const etag = upstream.headers.get("etag");
    const lastModified = upstream.headers.get("last-modified");

    const res = new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Strong client caching; adjust if you plan to mutate at the same URL
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
    if (etag) res.headers.set("ETag", etag);
    if (lastModified) res.headers.set("Last-Modified", lastModified);
    return res;
  } catch (err) {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
}

