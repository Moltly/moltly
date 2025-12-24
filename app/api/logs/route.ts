export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Increase body size limit to handle large payloads with data URL attachments
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import MoltEntry from "../../../models/MoltEntry";
import getMongoClientPromise from "../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { MoltEntryCreateSchema } from "@/lib/schemas/molt";
import { ensureSpeciesSuggestion } from "@/lib/species-utils";

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
      } catch { }
    }
  } catch {
    // best-effort only
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const species = (searchParams.get("species") || "").trim();
  const entryType = (searchParams.get("entryType") || "").trim();

  await connectMongoose();
  const criteria: any = { userId: session.user.id };
  if (species) {
    criteria.species = { $regex: new RegExp(`^${species.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
  }
  if (entryType) {
    criteria.entryType = entryType;
  }
  const documents = await MoltEntry.find(criteria).sort({ date: -1 });

  const normalized = documents.map((document) => {
    const entry = document.toObject();
    const rawType = typeof entry.entryType === "string" ? entry.entryType : "molt";
    const entryType = rawType && rawType.trim().length > 0 ? rawType : "molt";
    return {
      ...entry,
      entryType,
      stage: entryType === "molt" ? entry.stage : undefined,
      id: document._id.toString(),
      userId: document.userId.toString(),
      specimenId: document.specimenId?.toString()
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
      console.error("[/api/logs POST] Validation failed:", JSON.stringify(parsed.error.flatten(), null, 2));
      console.error("[/api/logs POST] Payload attachments:", JSON.stringify(payload.attachments?.map((a: any) => ({ id: a.id, name: a.name, urlLength: a.url?.length, urlStart: a.url?.slice(0, 100) })), null, 2));
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

    // Record species suggestion if unknown
    if (entry.species && typeof entry.species === "string") {
      ensureSpeciesSuggestion(entry.species, session.user.id).catch(() => undefined);
    }

    return NextResponse.json(
      {
        ...entry.toObject(),
        id: entry._id.toString(),
        userId: entry.userId.toString(),
        specimenId: entry.specimenId?.toString()
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create entry." }, { status: 500 });
  }
}
