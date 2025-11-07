export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { connectMongoose } from "@/lib/mongoose";
import SpeciesSuggestion from "@/models/SpeciesSuggestion";
import { Types } from "mongoose";
import getMongoClientPromise from "@/lib/mongodb";
import { parseSpeciesFullName } from "@/lib/species-utils";

type RouteContext = { params: Promise<{ id?: string | string[] }> };

function ensureId(raw: string | string[] | undefined) {
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) throw new Error("Missing id");
  return id;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { ok, session } = await requireAdminSession();
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const id = ensureId(params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let action: string | undefined;
  let reason: string | undefined;
  try {
    const payload = await request.json();
    action = (payload?.action || "").toLowerCase();
    reason = payload?.reason;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!action || (action !== "approve" && action !== "reject" && action !== "remove")) {
    return NextResponse.json({ error: "action must be 'approve' or 'reject' or 'remove'" }, { status: 400 });
  }

  await connectMongoose();
  const suggestion = await SpeciesSuggestion.findById(id);
  if (!suggestion) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const client = await getMongoClientPromise();
  const db = client.db();

  if (action === "reject") {
    if (suggestion.status !== "pending") {
      return NextResponse.json({ error: "Only pending suggestions can be rejected" }, { status: 400 });
    }
    suggestion.status = "rejected";
    suggestion.reason = reason;
    suggestion.reviewedAt = new Date();
    suggestion.reviewedBy = session!.user!.email || session!.user!.id;
    await suggestion.save();
    return NextResponse.json({ ok: true });
  }

  if (action === "approve") {
    const fullName = suggestion.fullName.trim();
    const fullNameLC = suggestion.fullNameLC.toLowerCase();
    const parts = parseSpeciesFullName(fullName);

    const already = await db.collection("species").findOne({ fullNameLC });
    if (!already) {
      await db.collection("species").insertOne({
        fullName,
        fullNameLC,
        genus: parts.genus || null,
        species: parts.species || null,
        subspecies: parts.subspecies || null,
        family: suggestion.family || null,
      });
    }

    suggestion.status = "approved";
    suggestion.reviewedAt = new Date();
    suggestion.reviewedBy = session!.user!.email || session!.user!.id;
    await suggestion.save();
    return NextResponse.json({ ok: true });
  }

  if (action === "remove") {
    if (suggestion.status !== "approved") {
      return NextResponse.json({ error: "Only approved suggestions can be removed" }, { status: 400 });
    }
    const fullNameLC = suggestion.fullNameLC.toLowerCase();
    await db.collection("species").deleteOne({ fullNameLC });
    suggestion.status = "removed" as any;
    suggestion.reviewedAt = new Date();
    suggestion.reviewedBy = session!.user!.email || session!.user!.id;
    await suggestion.save();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
