export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { connectMongoose } from "@/lib/mongoose";
import HealthEntry from "@/models/HealthEntry";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongoose();
  const documents = await HealthEntry.find({ userId: session.user.id }).sort({ date: -1 });

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
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  return undefined;
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
      weight,
      weightUnit,
      temperature,
      temperatureUnit,
      humidity,
      condition,
      behavior,
      healthIssues,
      treatment,
      followUpDate,
      notes,
      attachments = []
    } = payload;

    if (!date) {
      return NextResponse.json({ error: "Date is required." }, { status: 400 });
    }

    const trimmedSpecimen = typeof specimen === "string" ? specimen.trim() : "";
    const trimmedSpecies = typeof species === "string" ? species.trim() : "";
    const normalizedSpecimen = trimmedSpecimen.length > 0 ? trimmedSpecimen : undefined;
    const normalizedSpecies = trimmedSpecies.length > 0 ? trimmedSpecies : undefined;

    const allowedConditions = new Set(["Stable", "Observation", "Critical"]);
    const normalizedCondition = allowedConditions.has(condition) ? condition : "Stable";

    const normalizedWeightUnit = weightUnit === "oz" ? "oz" : "g";
    const normalizedBehavior = typeof behavior === "string" && behavior.trim().length > 0 ? behavior.trim() : undefined;
    const normalizedIssues =
      typeof healthIssues === "string" && healthIssues.trim().length > 0 ? healthIssues.trim() : undefined;
    const normalizedTreatment =
      typeof treatment === "string" && treatment.trim().length > 0 ? treatment.trim() : undefined;
    const normalizedNotes = typeof notes === "string" && notes.trim().length > 0 ? notes.trim() : undefined;
    const normalizedFollowUp = toDate(followUpDate);

    await connectMongoose();
    const entry = await HealthEntry.create({
      userId: session.user.id,
      specimen: normalizedSpecimen,
      species: normalizedSpecies,
      date,
      weight: toNumber(weight),
      weightUnit: normalizedWeightUnit,
      temperature: toNumber(temperature),
      temperatureUnit: temperatureUnit === "F" ? "F" : temperatureUnit === "C" ? "C" : undefined,
      humidity: toNumber(humidity),
      condition: normalizedCondition,
      behavior: normalizedBehavior,
      healthIssues: normalizedIssues,
      treatment: normalizedTreatment,
      followUpDate: normalizedFollowUp,
      notes: normalizedNotes,
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
    return NextResponse.json({ error: "Unable to create health entry." }, { status: 500 });
  }
}
