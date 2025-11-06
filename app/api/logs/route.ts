export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import MoltEntry from "../../../models/MoltEntry";
import getMongoClientPromise from "../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { MoltEntryCreateSchema } from "@/lib/schemas/molt";

async function trySyncToWSCA(userId: string, entry: any) {
  try {
    if (entry.entryType !== "molt") return;
    const syncUrl = process.env.WSCA_SYNC_URL;
    const syncSecret = process.env.WSCA_SYNC_SECRET;
    const debug = process.env.WSCA_SYNC_DEBUG === "true";
    if (!syncUrl || !syncSecret) return;

    // Look up linked Discord account for this user
    const client = await getMongoClientPromise();
    const db = client.db();
    const accounts = db.collection("accounts");
    const account =
      (await accounts.findOne({ provider: "discord", userId: new ObjectId(userId) })) ||
      (await accounts.findOne({ provider: "discord", userId })) ||
      null;
    const discordId = account?.providerAccountId;
    if (!discordId) return;

    const res = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Sync-Secret": syncSecret,
      },
      body: JSON.stringify({
        discord_user_id: String(discordId),
        canonical: entry.species,
        specimen_name: entry.specimen ?? undefined,
        date: typeof entry.date === "string" ? entry.date : new Date(entry.date).toISOString().slice(0, 10),
        stage: entry.stage ?? undefined,
        notes: entry.notes ?? undefined,
      }),
    }).catch((err) => {
      if (debug) console.error("[WSCA_SYNC] POST failed:", err);
      return undefined as any;
    });
    if (debug && res) {
      try {
        const t = await res.text();
        console.log("[WSCA_SYNC] POST", syncUrl, "status=", res.status, "body=", t);
      } catch {}
    }
  } catch {
    // best-effort only
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongoose();
  const documents = await MoltEntry.find({ userId: session.user.id }).sort({ date: -1 });

  const normalized = documents.map((document) => {
    const entry = document.toObject();
    const entryType = entry.entryType === "feeding" ? "feeding" : entry.entryType === "molt" ? "molt" : "water";
    return {
      ...entry,
      entryType,
      stage: entryType === "molt" ? entry.stage : undefined,
      id: document._id.toString(),
      userId: document.userId.toString()
    };
  });

  return NextResponse.json(normalized);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const parsed = MoltEntryCreateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body.",
          details: parsed.error.flatten()
        },
        { status: 400 }
      );
    }

    const data = parsed.data;

    await connectMongoose();
    const entry = await MoltEntry.create({
      userId: session.user.id,
      ...data
    });

    // Fire-and-forget sync to WSCA if configured
    trySyncToWSCA(session.user.id, entry).catch(() => undefined);

    return NextResponse.json(
      {
        ...entry.toObject(),
        id: entry._id.toString(),
        userId: entry.userId.toString()
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create entry." }, { status: 500 });
  }
}
