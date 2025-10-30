export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { connectMongoose } from "@/lib/mongoose";
import BreedingEntry from "@/models/BreedingEntry";

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function toDate(value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  return undefined;
}

function sanitizeString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongoose();
  const documents = await BreedingEntry.find({ userId: session.user.id }).sort({ pairingDate: -1 });

  const normalized = documents.map((document) => {
    const entry = document.toObject();
    return {
      ...entry,
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
      femaleSpecimen,
      maleSpecimen,
      species,
      pairingDate,
      status,
      pairingNotes,
      eggSacDate,
      eggSacStatus,
      eggSacCount,
      hatchDate,
      slingCount,
      followUpDate,
      notes,
      attachments = []
    } = payload;

    if (!pairingDate) {
      return NextResponse.json({ error: "Pairing date is required." }, { status: 400 });
    }

    const allowedStatuses = new Set(["Planned", "Attempted", "Successful", "Failed", "Observation"]);
    const allowedEggStatuses = new Set(["Not Laid", "Laid", "Pulled", "Failed", "Hatched"]);

    await connectMongoose();
    const entry = await BreedingEntry.create({
      userId: session.user.id,
      femaleSpecimen: sanitizeString(femaleSpecimen),
      maleSpecimen: sanitizeString(maleSpecimen),
      species: sanitizeString(species),
      pairingDate,
      status: allowedStatuses.has(status) ? status : "Planned",
      pairingNotes: sanitizeString(pairingNotes),
      eggSacDate: toDate(eggSacDate),
      eggSacStatus: allowedEggStatuses.has(eggSacStatus) ? eggSacStatus : "Not Laid",
      eggSacCount: toNumber(eggSacCount),
      hatchDate: toDate(hatchDate),
      slingCount: toNumber(slingCount),
      followUpDate: toDate(followUpDate),
      notes: sanitizeString(notes),
      attachments
    });

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
    return NextResponse.json({ error: "Unable to create breeding entry." }, { status: 500 });
  }
}

