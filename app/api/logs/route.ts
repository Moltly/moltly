export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import MoltEntry from "../../../models/MoltEntry";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongoose();
  const documents = await MoltEntry.find({ userId: session.user.id }).sort({ date: -1 });

  const normalized = documents.map((document) => {
    const entry = document.toObject();
    const entryType = entry.entryType === "feeding" ? "feeding" : "molt";
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
      notes,
      reminderDate,
      feedingPrey,
      feedingOutcome,
      feedingAmount,
      attachments = []
    } = payload;

    if (!specimen || !date) {
      return NextResponse.json({ error: "Specimen and date are required." }, { status: 400 });
    }

    const allowedEntryTypes = new Set(["molt", "feeding"]);
    const entryType: "molt" | "feeding" = allowedEntryTypes.has(rawEntryType) ? rawEntryType : "molt";

    const allowedStages = new Set(["Pre-molt", "Molt", "Post-molt"]);
    const normalizedStage =
      entryType === "molt"
        ? allowedStages.has(stage) ? stage : "Molt"
        : undefined;

    const allowedOutcomes = new Set(["Offered", "Ate", "Refused", "Not Observed"]);
    const normalizedOutcome =
      entryType === "feeding" && typeof feedingOutcome === "string" && allowedOutcomes.has(feedingOutcome)
        ? feedingOutcome
        : undefined;

    await connectMongoose();
    const entry = await MoltEntry.create({
      userId: session.user.id,
      specimen,
      species,
      date,
      entryType,
      stage: normalizedStage,
      oldSize,
      newSize,
      humidity,
      temperature,
      notes,
      reminderDate,
      feedingPrey: entryType === "feeding" ? feedingPrey : undefined,
      feedingOutcome: normalizedOutcome,
      feedingAmount: entryType === "feeding" ? feedingAmount : undefined,
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
    return NextResponse.json({ error: "Unable to create entry." }, { status: 500 });
  }
}
