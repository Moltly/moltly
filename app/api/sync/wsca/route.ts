export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "../../../../lib/mongoose";
import MoltEntry from "../../../../models/MoltEntry";
import getMongoClientPromise from "../../../../lib/mongodb";

type InboundMoltPayload = {
  discord_user_id: string | number;
  species?: string; // canonical species string (e.g., "Grammostola pulchripes")
  canonical?: string; // alias for species
  specimen_name?: string | null;
  date: string; // YYYY-MM-DD
  stage?: string | null; // "Pre-molt" | "Molt" | "Post-molt"
  notes?: string | null;
  lsid?: string | null;
};

function readHeader(headers: Headers, name: string): string | undefined {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
}

function specimenFilter(raw: string | null | undefined): Record<string, any> {
  const s = (raw || "").trim();
  if (s) {
    return { specimen: s };
  }
  // Match entries where specimen is not set/empty
  return { $or: [{ specimen: { $exists: false } }, { specimen: null }, { specimen: "" }] };
}
function stageEqFilter(raw: string | null | undefined): Record<string, any> | undefined {
  const s = (raw || "").trim();
  if (!s) return undefined;
  const allowed = new Set(["Pre-molt", "Molt", "Post-molt"]);
  if (!allowed.has(s)) return undefined;
  return { stage: s };
}

export async function POST(req: Request) {
  console.log("[wsca-sync] POST /api/sync/wsca hit");
  try {
    const secret = process.env.WSCA_SYNC_SECRET;
    if (!secret) {
      console.warn("[wsca-sync] WSCA_SYNC_SECRET not set");
      return NextResponse.json({ error: "Sync not configured." }, { status: 501 });
    }
    const provided = readHeader(req.headers, "X-Sync-Secret");
    if (!provided || provided !== secret) {
      console.warn("[wsca-sync] Auth failed — secret mismatch");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as InboundMoltPayload;
    const discordUserId = typeof body.discord_user_id === "number" ? String(body.discord_user_id) : (body.discord_user_id || "").trim();
    const species = (body.canonical || body.species || "").trim();
    const specimen = (body.specimen_name || "").trim();
    const dateStr = (body.date || "").trim();
    const notes = (body.notes || "").trim();
    const rawStage = (body.stage || "").trim();
    const allowedStages = new Set(["Pre-molt", "Molt", "Post-molt"]);
    const stage = allowedStages.has(rawStage) ? rawStage : "Molt";

    console.log("[wsca-sync] POST inbound", { discordUserId, species, specimen, dateStr, stage });

    if (!discordUserId || !species || !dateStr) {
      console.warn("[wsca-sync] Missing required fields", { discordUserId, species, dateStr });
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // Resolve moltly user by Discord account link in NextAuth accounts
    const client = await getMongoClientPromise();
    const db = client.db();
    const account = await db.collection("accounts").findOne({ provider: "discord", providerAccountId: discordUserId });
    if (!account?.userId) {
      console.warn("[wsca-sync] No linked user for discord", discordUserId);
      return NextResponse.json({ error: "No linked user for that Discord account." }, { status: 404 });
    }

    const userId = typeof account.userId === "string" ? account.userId : String(account.userId);

    await connectMongoose();

    // Deduplicate by (userId, date, species, specimen, entryType)
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    const existing = await MoltEntry.findOne({
      userId: new Types.ObjectId(userId),
      entryType: "molt",
      species,
      date,
      ...specimenFilter(specimen || undefined),
      ...(stageEqFilter(rawStage || undefined) || {}),
    }).lean();

    if (existing) {
      console.log("[wsca-sync] Duplicate entry, skipping", { species, dateStr, specimen, stage });
      return NextResponse.json({ status: "exists" }, { status: 200 });
    }

    const created = await MoltEntry.create({
      userId: new Types.ObjectId(userId),
      specimen: specimen || undefined,
      species,
      date,
      entryType: "molt",
      stage,
      notes: notes || undefined,
    });

    console.log("[wsca-sync] Created entry", { id: created._id.toString(), species, dateStr, specimen, stage });
    return NextResponse.json({ id: created._id.toString(), status: "created" }, { status: 201 });
  } catch (error) {
    console.error("/api/sync/wsca POST error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

type UpdatePayload = {
  discord_user_id: string | number;
  old: { canonical: string; specimen_name?: string | null; date: string; stage?: string | null };
  new: { canonical?: string; specimen_name?: string | null; date?: string; stage?: string | null; notes?: string | null; lsid?: string | null };
};

export async function PUT(req: Request) {
  try {
    const secret = process.env.WSCA_SYNC_SECRET;
    if (!secret) return NextResponse.json({ error: "Sync not configured." }, { status: 501 });
    const provided = readHeader(req.headers, "X-Sync-Secret");
    if (!provided || provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as UpdatePayload;
    const discordUserId = typeof body.discord_user_id === "number" ? String(body.discord_user_id) : (body.discord_user_id || "").trim();
    if (!discordUserId || !body.old?.canonical || !body.old?.date) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // Map Discord account to Moltly user
    const client = await getMongoClientPromise();
    const db = client.db();
    const account = await db.collection("accounts").findOne({ provider: "discord", providerAccountId: discordUserId });
    if (!account?.userId) return NextResponse.json({ error: "No linked user." }, { status: 404 });

    const userId = typeof account.userId === "string" ? account.userId : String(account.userId);
    await connectMongoose();

    const oldDate = new Date(`${body.old.date}T00:00:00.000Z`);
    const entry = await MoltEntry.findOne({
      userId: new Types.ObjectId(userId),
      entryType: "molt",
      species: body.old.canonical,
      date: oldDate,
      ...specimenFilter(body.old.specimen_name as any),
      ...(body.old.stage && ["Pre-molt", "Molt", "Post-molt"].includes((body.old.stage as any)) ? { stage: body.old.stage as any } : {}),
    });
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    if (Object.prototype.hasOwnProperty.call(body.new, "canonical")) {
      entry.species = (body.new.canonical || "").trim() || undefined;
    }
    if (Object.prototype.hasOwnProperty.call(body.new, "specimen_name")) {
      const s = (body.new.specimen_name || "").trim();
      entry.specimen = s ? s : undefined;
    }
    if (Object.prototype.hasOwnProperty.call(body.new, "date")) {
      const d = (body.new.date || "").trim();
      if (d) entry.date = new Date(`${d}T00:00:00.000Z`);
    }
    if (Object.prototype.hasOwnProperty.call(body.new, "notes")) {
      const n = (body.new.notes || "").trim();
      entry.notes = n ? n : undefined;
    }
    if (Object.prototype.hasOwnProperty.call(body.new, "stage")) {
      const s = (body.new.stage || "").trim();
      const allowed = new Set(["Pre-molt", "Molt", "Post-molt"]);
      entry.stage = allowed.has(s) ? (s as any) : entry.stage;
    }
    await entry.save();
    return NextResponse.json({ status: "updated" }, { status: 200 });
  } catch (error) {
    console.error("/api/sync/wsca PUT error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

type DeletePayload = { discord_user_id: string | number; canonical: string; specimen_name?: string | null; date: string };
function stageFilter(raw: string | null | undefined): Record<string, any> | undefined {
  const s = (raw || "").trim();
  const allowed = new Set(["Pre-molt", "Molt", "Post-molt"]);
  if (!s || !allowed.has(s)) return undefined;
  return { stage: s };
}

export async function DELETE(req: Request) {
  try {
    const secret = process.env.WSCA_SYNC_SECRET;
    if (!secret) return NextResponse.json({ error: "Sync not configured." }, { status: 501 });
    const provided = readHeader(req.headers, "X-Sync-Secret");
    if (!provided || provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as DeletePayload & { stage?: string | null };
    const discordUserId = typeof body.discord_user_id === "number" ? String(body.discord_user_id) : (body.discord_user_id || "").trim();
    const canonical = (body.canonical || "").trim();
    const dateStr = (body.date || "").trim();
    if (!discordUserId || !canonical || !dateStr) return NextResponse.json({ error: "Missing fields." }, { status: 400 });

    const client = await getMongoClientPromise();
    const db = client.db();
    const account = await db.collection("accounts").findOne({ provider: "discord", providerAccountId: discordUserId });
    if (!account?.userId) return NextResponse.json({ error: "No linked user." }, { status: 404 });
    const userId = typeof account.userId === "string" ? account.userId : String(account.userId);

    await connectMongoose();
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    const entry = await MoltEntry.findOneAndDelete({
      userId: new Types.ObjectId(userId),
      entryType: "molt",
      species: canonical,
      date,
      ...specimenFilter(body.specimen_name as any),
      ...(stageFilter((body as any).stage) || {}),
    });
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    return NextResponse.json({ status: "deleted" });
  } catch (error) {
    console.error("/api/sync/wsca DELETE error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
