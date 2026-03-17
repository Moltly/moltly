export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../lib/auth-options";
import getMongoClientPromise from "../../../../../lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const syncUrl = process.env.WSCA_SYNC_URL;
    const syncSecret = process.env.WSCA_SYNC_SECRET;
    if (!syncUrl || !syncSecret) {
      return NextResponse.json({ error: "WSCA sync not configured" }, { status: 501 });
    }

    // Find linked Discord account
    const client = await getMongoClientPromise();
    const db = client.db();
    const accounts = db.collection("accounts");
    const account =
      (await accounts.findOne({ provider: "discord", userId: new ObjectId(session.user.id) })) ||
      (await accounts.findOne({ provider: "discord", userId: session.user.id })) ||
      null;
    const discordId = account?.providerAccountId as string | undefined;
    if (!discordId) {
      return NextResponse.json({ error: "No Discord account linked" }, { status: 400 });
    }

    // Build bot backfill URL from configured WSCA_SYNC_URL
    let botBackfillUrl: string;
    try {
      const u = new URL(syncUrl);
      u.pathname = "/sync/molt/backfill";
      u.search = "";
      botBackfillUrl = u.toString();
    } catch {
      return NextResponse.json({ error: "Invalid WSCA_SYNC_URL" }, { status: 500 });
    }

    const base = process.env.NEXTAUTH_URL || "http://localhost:5777";
    const moltlyBackfillUrl = new URL("/api/sync/wsca/backfill", base).toString();

    const results: Record<string, any> = {};

    // Bot → Moltly
    const r1 = await fetch(botBackfillUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Sync-Secret": syncSecret },
      body: JSON.stringify({ discord_user_id: String(discordId) }),
    }).catch(() => undefined as any);
    if (r1) {
      try { results.fromBot = { status: r1.status, body: await r1.json().catch(async () => await r1.text()) }; } catch { results.fromBot = { status: r1.status }; }
    } else {
      results.fromBot = { error: "request_failed" };
    }

    // Moltly → Bot
    const r2 = await fetch(moltlyBackfillUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Sync-Secret": syncSecret },
      body: JSON.stringify({ discord_user_id: String(discordId) }),
    }).catch(() => undefined as any);
    if (r2) {
      try { results.toBot = { status: r2.status, body: await r2.json().catch(async () => await r2.text()) }; } catch { results.toBot = { status: r2.status }; }
    } else {
      results.toBot = { error: "request_failed" };
    }

    return NextResponse.json({ ok: true, discord_user_id: String(discordId), ...results });
  } catch (error) {
    console.error("/api/sync/wsca/me error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
