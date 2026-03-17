export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import getMongoClientPromise from "../../../../../lib/mongodb";
import { connectMongoose } from "../../../../../lib/mongoose";
import MoltEntry from "../../../../../models/MoltEntry";
import { ObjectId } from "mongodb";

export async function POST(req: Request) {
  try {
    const secret = process.env.WSCA_SYNC_SECRET;
    if (!secret) return NextResponse.json({ error: "Sync not configured." }, { status: 501 });
    const provided = req.headers.get("X-Sync-Secret") ?? req.headers.get("x-sync-secret");
    const override = process.env.BACKFILL_SECRET;
    if (!override && (!provided || provided !== secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const syncUrl = process.env.WSCA_SYNC_URL;
    const syncSecret = process.env.WSCA_SYNC_SECRET;
    if (!syncUrl || !syncSecret) return NextResponse.json({ error: "Missing WSCA sync env" }, { status: 500 });
    let filterDiscordId: string | undefined = undefined;
    try {
      const body = await req.json();
      const rawId = (body?.discord_user_id ?? body?.discordId) as string | number | undefined;
      if (rawId !== undefined) filterDiscordId = typeof rawId === "number" ? String(rawId) : String(rawId);
    } catch {}

    const client = await getMongoClientPromise();
    const db = client.db();
    // Get all discord-linked accounts
    const accounts = (await db
      .collection("accounts")
      .find({ provider: "discord", ...(filterDiscordId ? { providerAccountId: filterDiscordId } : {}) })
      .toArray()) as any[];

    await connectMongoose();
    let forwarded = 0;
    let ok = 0;
    for (const acc of accounts) {
      const userId = typeof acc.userId === "string" ? acc.userId : acc.userId?.toString();
      const discordId = acc.providerAccountId;
      if (!userId || !discordId) continue;
      const entries = await MoltEntry.find({ userId: new ObjectId(userId), entryType: "molt" })
        .select({ species: 1, specimen: 1, date: 1, notes: 1 })
        .sort({ date: 1 })
        .lean();
      for (const e of entries) {
        const dateIso = new Date(e.date).toISOString().slice(0, 10);
        const res = await fetch(syncUrl, {
          method: "POST",
          headers: { "content-type": "application/json", "X-Sync-Secret": syncSecret },
          body: JSON.stringify({
            discord_user_id: String(discordId),
            canonical: e.species,
            specimen_name: e.specimen ?? undefined,
            date: dateIso,
            stage: e.stage ?? undefined,
            notes: e.notes ?? undefined,
          }),
        }).catch(() => undefined);
        forwarded++;
        if (res && res.ok) ok++;
      }
    }
    return NextResponse.json({ forwarded, ok });
  } catch (error) {
    console.error("/api/sync/wsca/backfill error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
