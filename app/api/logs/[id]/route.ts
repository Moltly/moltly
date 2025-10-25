import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import { authOptions } from "../../../../lib/auth-options";
import { connectMongoose } from "../../../../lib/mongoose";
import MoltEntry from "../../../../models/MoltEntry";

type RouteContext = {
  params: Promise<{ id?: string | string[] }>;
};

function ensureObjectId(id: string) {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid entry id.");
  }
  return new Types.ObjectId(id);
}

function assertId(raw: string | string[] | undefined) {
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) {
    throw new Error("Missing entry id.");
  }
  return id;
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = await context.params;
    const id = assertId(params.id);
    const updates = await request.json();
    await connectMongoose();
    const entry = await MoltEntry.findOne({ _id: ensureObjectId(id), userId: session.user.id });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    const allowedEntryTypes = new Set(["molt", "feeding", "water"]);
    const allowedStages = new Set(["Pre-molt", "Molt", "Post-molt"]);
    const allowedOutcomes = new Set(["Offered", "Ate", "Refused", "Not Observed"]);

    let effectiveEntryType: "molt" | "feeding" | "water" = (entry.entryType as any) ?? "molt";
    if (typeof updates.entryType === "string" && allowedEntryTypes.has(updates.entryType)) {
      effectiveEntryType = updates.entryType as "molt" | "feeding" | "water";
    }
    entry.entryType = effectiveEntryType;

    if ("specimen" in updates) {
      if (typeof updates.specimen === "string") {
        const trimmedSpecimen = updates.specimen.trim();
        entry.specimen = trimmedSpecimen.length > 0 ? trimmedSpecimen : undefined;
      } else if (updates.specimen === null) {
        entry.specimen = undefined;
      }
    }

    if ("species" in updates) {
      entry.species = typeof updates.species === "string" && updates.species.trim().length > 0 ? updates.species.trim() : undefined;
    }

    if (updates.date) {
      const nextDate = new Date(updates.date);
      if (!Number.isNaN(nextDate.getTime())) {
        entry.date = nextDate;
      }
    }

    if ("stage" in updates || effectiveEntryType !== "molt") {
      if (effectiveEntryType !== "molt") {
        entry.stage = undefined;
      } else if (typeof updates.stage === "string" && allowedStages.has(updates.stage)) {
        entry.stage = updates.stage;
      } else if (updates.stage !== undefined) {
        entry.stage = "Molt";
      }
    }

    if ("oldSize" in updates) {
      entry.oldSize = typeof updates.oldSize === "number" && Number.isFinite(updates.oldSize) ? updates.oldSize : undefined;
    }

    if ("newSize" in updates) {
      entry.newSize = typeof updates.newSize === "number" && Number.isFinite(updates.newSize) ? updates.newSize : undefined;
    }

    if ("humidity" in updates) {
      entry.humidity = typeof updates.humidity === "number" && Number.isFinite(updates.humidity) ? updates.humidity : undefined;
    }

    if ("temperature" in updates) {
      entry.temperature =
        typeof updates.temperature === "number" && Number.isFinite(updates.temperature) ? updates.temperature : undefined;
    }

    if ("notes" in updates) {
      entry.notes = typeof updates.notes === "string" && updates.notes.trim().length > 0 ? updates.notes.trim() : undefined;
    }

    if ("reminderDate" in updates) {
      if (typeof updates.reminderDate === "string" && updates.reminderDate.length > 0) {
        const reminder = new Date(updates.reminderDate);
        entry.reminderDate = Number.isNaN(reminder.getTime()) ? undefined : reminder;
      } else {
        entry.reminderDate = undefined;
      }
    }

    if ("feedingPrey" in updates) {
      entry.feedingPrey =
        effectiveEntryType === "feeding" && typeof updates.feedingPrey === "string" && updates.feedingPrey.trim().length > 0
          ? updates.feedingPrey.trim()
          : undefined;
    }

    if ("feedingAmount" in updates) {
      entry.feedingAmount =
        effectiveEntryType === "feeding" && typeof updates.feedingAmount === "string" && updates.feedingAmount.trim().length > 0
          ? updates.feedingAmount.trim()
          : undefined;
    }

    if ("feedingOutcome" in updates) {
      entry.feedingOutcome =
        effectiveEntryType === "feeding" &&
        typeof updates.feedingOutcome === "string" &&
        allowedOutcomes.has(updates.feedingOutcome)
          ? updates.feedingOutcome
          : undefined;
    }

    if (Array.isArray(updates.attachments)) {
      entry.attachments = updates.attachments;
    }

    if (effectiveEntryType !== "feeding") {
      entry.feedingPrey = undefined;
      entry.feedingOutcome = undefined;
      entry.feedingAmount = undefined;
    }

    if (effectiveEntryType === "molt" && !entry.species) {
      return NextResponse.json({ error: "Species is required for molt entries." }, { status: 400 });
    }

    await entry.save();

    return NextResponse.json({
      ...entry.toObject(),
      id: entry._id.toString(),
      userId: entry.userId.toString()
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update entry." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = await context.params;
    const id = assertId(params.id);
    await connectMongoose();
    const result = await MoltEntry.findOneAndDelete({
      _id: ensureObjectId(id),
      userId: session.user.id
    });

    if (!result) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to delete entry." }, { status: 500 });
  }
}
