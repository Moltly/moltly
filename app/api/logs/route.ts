export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import MoltEntry from "../../../models/MoltEntry";
import getMongoClientPromise from "../../../lib/mongodb";
import { ObjectId } from "mongodb";

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
    const {
      specimen,
      species,
      date,
      entryType: rawEntryType,
      stage,
      oldSize,
      newSize,
      humidity,
      temperature,
      temperatureUnit,
      notes,
      reminderDate,
      feedingPrey,
      feedingOutcome,
      feedingAmount,
      attachments = []
    } = payload;

    if (!date) {
      return NextResponse.json({ error: "Date is required." }, { status: 400 });
    }

    const allowedEntryTypes = new Set(["molt", "feeding", "water"]);
    const entryType: "molt" | "feeding" | "water" = allowedEntryTypes.has(rawEntryType) ? rawEntryType : "molt";

    const trimmedSpecimen = typeof specimen === "string" ? specimen.trim() : "";
    const normalizedSpecimen = trimmedSpecimen.length > 0 ? trimmedSpecimen : undefined;

    const trimmedSpecies = typeof species === "string" ? species.trim() : "";
    const normalizedSpecies = trimmedSpecies.length > 0 ? trimmedSpecies : undefined;

    if (entryType === "molt" && !normalizedSpecies) {
      return NextResponse.json({ error: "Species is required for molt entries." }, { status: 400 });
    }

    const allowedStages = new Set(["Pre-molt", "Molt", "Post-molt"]);
    const normalizedStage = entryType === "molt" ? (allowedStages.has(stage) ? stage : "Molt") : undefined;

    const allowedOutcomes = new Set(["Offered", "Ate", "Refused", "Not Observed"]);
    const normalizedOutcome =
      entryType === "feeding" && typeof feedingOutcome === "string" && allowedOutcomes.has(feedingOutcome)
        ? feedingOutcome
        : undefined;

    await connectMongoose();
    const entry = await MoltEntry.create({
      userId: session.user.id,
      specimen: normalizedSpecimen,
      species: normalizedSpecies,
      date,
      entryType,
      stage: normalizedStage,
      oldSize,
      newSize,
      humidity,
      temperature,
      temperatureUnit: temperatureUnit === "F" ? "F" : temperatureUnit === "C" ? "C" : undefined,
      notes,
      reminderDate,
      feedingPrey: entryType === "feeding" ? feedingPrey : undefined,
      feedingOutcome: normalizedOutcome,
      feedingAmount: entryType === "feeding" ? feedingAmount : undefined,
      attachments
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
