export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { connectMongoose } from "@/lib/mongoose";
import MoltEntry from "@/models/MoltEntry";
import HealthEntry from "@/models/HealthEntry";
import BreedingEntry from "@/models/BreedingEntry";
import SpecimenCover from "@/models/SpecimenCover";
import { Types } from "mongoose";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { specimen, ownerId } = (await request.json()) as { specimen?: string; ownerId?: string };
    if (!specimen || typeof specimen !== "string" || !specimen.trim()) {
      return NextResponse.json({ error: "Invalid specimen" }, { status: 400 });
    }
    if (!ownerId || typeof ownerId !== "string" || !ownerId.trim()) {
      return NextResponse.json({ error: "Invalid owner" }, { status: 400 });
    }

    let ownerObjectId: Types.ObjectId;
    try {
      ownerObjectId = new Types.ObjectId(ownerId.trim());
    } catch {
      return NextResponse.json({ error: "Invalid owner" }, { status: 400 });
    }

    await connectMongoose();
    const match = new RegExp(`^${escapeRegex(specimen.trim())}$`, "i");

    const [moltEntries, healthEntries, breedingEntries, cover] = await Promise.all([
      MoltEntry.find({ userId: ownerObjectId, specimen: match }).lean(),
      HealthEntry.find({ userId: ownerObjectId, specimen: match }).lean(),
      BreedingEntry.find({
        userId: ownerObjectId,
        $or: [{ femaleSpecimen: match }, { maleSpecimen: match }],
      }).lean(),
      SpecimenCover.findOne({ userId: ownerObjectId, key: match }).lean(),
    ]);

    const now = new Date();
    const mappedMolt = moltEntries.map((e) => {
      const { _id, userId, createdAt, updatedAt, ...rest } = e as any;
      return {
        ...rest,
        userId: session.user!.id,
        createdAt: now,
        updatedAt: now,
      };
    });

    const mappedHealth = healthEntries.map((e) => {
      const { _id, userId, createdAt, updatedAt, ...rest } = e as any;
      return {
        ...rest,
        userId: session.user!.id,
        createdAt: now,
        updatedAt: now,
      };
    });

    const mappedBreeding = breedingEntries.map((e) => {
      const { _id, userId, createdAt, updatedAt, ...rest } = e as any;
      return {
        ...rest,
        userId: session.user!.id,
        createdAt: now,
        updatedAt: now,
      };
    });

    const results = await Promise.all([
      mappedMolt.length ? MoltEntry.insertMany(mappedMolt) : [],
      mappedHealth.length ? HealthEntry.insertMany(mappedHealth) : [],
      mappedBreeding.length ? BreedingEntry.insertMany(mappedBreeding) : [],
      cover
        ? SpecimenCover.updateOne(
            { userId: session.user.id, key: specimen.trim() },
            { $set: { imageUrl: (cover as any).imageUrl } },
            { upsert: true }
          )
        : null,
    ]);

    return NextResponse.json({
      copied: {
        molt: mappedMolt.length,
        health: mappedHealth.length,
        breeding: mappedBreeding.length,
        cover: Boolean(cover),
      },
    });
  } catch (err) {
    console.error("Failed to copy specimen", err);
    return NextResponse.json({ error: "Failed to copy specimen" }, { status: 500 });
  }
}
