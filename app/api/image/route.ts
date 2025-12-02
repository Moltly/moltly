export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

const ALLOWED_IMAGE_HOSTS: string[] = (() => {
  const hosts = new Set<string>();

  const rawEnvHosts = (process.env.IMAGE_PROXY_ALLOWED_HOSTS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const value of rawEnvHosts) {
    try {
      const parsed = new URL(value);
      if (parsed.hostname) hosts.add(parsed.hostname.toLowerCase());
    } catch {
      hosts.add(value.toLowerCase());
    }
  }

  const s3Base = process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT || "";
  if (s3Base) {
    try {
      const parsed = new URL(s3Base);
      if (parsed.hostname) hosts.add(parsed.hostname.toLowerCase());
    } catch {
      hosts.add(s3Base.toLowerCase());
    }
  }

  return Array.from(hosts);
})();

function isLocalHostname(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return (
    value === "localhost" ||
    value === "127.0.0.1" ||
    value === "::1" ||
    value.endsWith(".localhost")
  );
}

function isIpHostname(hostname: string): boolean {
  return /^[0-9.]+$/.test(hostname) || hostname.includes(":");
}

function resolveAllowedImageUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const hostname = url.hostname.toLowerCase();
    if (!hostname || isLocalHostname(hostname) || isIpHostname(hostname)) {
      return null;
    }

    const isAllowedHost = ALLOWED_IMAGE_HOSTS.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
    );
    return isAllowedHost ? url : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get("url") || "";
    const target = rawUrl ? resolveAllowedImageUrl(rawUrl) : null;
    if (!target) {
      return NextResponse.json({ error: "Invalid or disallowed url" }, { status: 400 });
    }

    const upstream = await fetch(target.toString(), {
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
