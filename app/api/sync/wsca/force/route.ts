export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

type ForceBody = {
  direction?: "both" | "toBot" | "fromBot";
  discord_user_id?: string | number;
};

function readHeader(headers: Headers, name: string): string | undefined {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
}

function toStringId(v: string | number | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === "number" ? String(v) : v;
}

export async function POST(req: Request) {
  try {
    const secret = process.env.WSCA_SYNC_SECRET;
    if (!secret) return NextResponse.json({ error: "Sync not configured." }, { status: 501 });
    const provided = readHeader(req.headers, "X-Sync-Secret");
    const override = process.env.BACKFILL_SECRET;
    if (!override && (!provided || provided !== secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as ForceBody | {};
    const direction = (body as ForceBody).direction ?? "both";
    const discordUserId = toStringId((body as ForceBody).discord_user_id);

    const syncUrl = process.env.WSCA_SYNC_URL;
    const syncSecret = process.env.WSCA_SYNC_SECRET;
    if (!syncUrl || !syncSecret) return NextResponse.json({ error: "Missing WSCA sync env" }, { status: 500 });

    // Derive bot backfill endpoint from configured POST URL
    let botBackfillUrl: string;
    try {
      const u = new URL(syncUrl);
      // Normalize to /sync/molt/backfill on same origin
      u.pathname = "/sync/molt/backfill";
      u.search = "";
      botBackfillUrl = u.toString();
    } catch {
      return NextResponse.json({ error: "Invalid WSCA_SYNC_URL" }, { status: 500 });
    }

    // Resolve own backfill endpoint
    const base = process.env.NEXTAUTH_URL || "http://localhost:5777";
    const moltlyBackfillUrl = new URL("/api/sync/wsca/backfill", base).toString();

    const results: Record<string, any> = {};

    if (direction === "both" || direction === "fromBot") {
      const payload = discordUserId ? { discord_user_id: discordUserId } : undefined;
      const res = await fetch(botBackfillUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "X-Sync-Secret": syncSecret },
        body: payload ? JSON.stringify(payload) : undefined,
      }).catch(() => undefined as any);
      if (res) {
        try { results.fromBot = { status: res.status, body: await res.json().catch(async () => await res.text()) }; } catch { results.fromBot = { status: res.status }; }
      } else {
        results.fromBot = { error: "request_failed" };
      }
    }

    if (direction === "both" || direction === "toBot") {
      const payload = discordUserId ? { discord_user_id: discordUserId } : undefined;
      const res = await fetch(moltlyBackfillUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "X-Sync-Secret": syncSecret },
        body: payload ? JSON.stringify(payload) : undefined,
      }).catch(() => undefined as any);
      if (res) {
        try { results.toBot = { status: res.status, body: await res.json().catch(async () => await res.text()) }; } catch { results.toBot = { status: res.status }; }
      } else {
        results.toBot = { error: "request_failed" };
      }
    }

    return NextResponse.json({ ok: true, direction, ...results });
  } catch (error) {
    console.error("/api/sync/wsca/force error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

