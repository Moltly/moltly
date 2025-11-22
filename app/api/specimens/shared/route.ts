export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectMongoose } from "@/lib/mongoose";
import MoltEntry from "@/models/MoltEntry";
import HealthEntry from "@/models/HealthEntry";
import BreedingEntry from "@/models/BreedingEntry";
import SpecimenCover from "@/models/SpecimenCover";
import { Types } from "mongoose";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const specimen = (searchParams.get("specimen") || "").trim();
  const ownerId = (searchParams.get("owner") || "").trim();
  if (!specimen || !ownerId) {
    return NextResponse.json({ error: "Missing specimen or owner" }, { status: 400 });
  }

  try {
    let ownerObjectId: Types.ObjectId;
    try {
      ownerObjectId = new Types.ObjectId(ownerId);
    } catch {
      return NextResponse.json({ error: "Invalid owner id" }, { status: 400 });
    }
    await connectMongoose();
    const match = new RegExp(`^${escapeRegex(specimen)}$`, "i");

    const [moltEntries, healthEntries, breedingEntries, cover] = await Promise.all([
      MoltEntry.find({ userId: ownerObjectId, specimen: match }).sort({ date: -1 }).lean(),
      HealthEntry.find({ userId: ownerObjectId, specimen: match }).sort({ date: -1 }).lean(),
      BreedingEntry.find({
        userId: ownerObjectId,
        $or: [{ femaleSpecimen: match }, { maleSpecimen: match }],
      })
        .sort({ pairingDate: -1 })
        .lean(),
      SpecimenCover.findOne({ userId: ownerObjectId, key: match }).lean(),
    ]);

    const normalize = (doc: any) => ({
      ...doc,
      id: doc._id?.toString() ?? "",
      _id: undefined,
      userId: undefined,
    });

    return NextResponse.json({
      entries: moltEntries.map(normalize),
      health: healthEntries.map(normalize),
      breeding: breedingEntries.map(normalize),
      cover: cover?.imageUrl ?? null,
    });
  } catch (err) {
    console.error("Failed to load shared specimen", err);
    return NextResponse.json({ error: "Failed to load shared specimen" }, { status: 500 });
  }
}
