import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import path from "path";
import { unlink } from "fs/promises";
import { authOptions } from "@/lib/auth-options";
import { connectMongoose } from "@/lib/mongoose";
import BreedingEntry from "@/models/BreedingEntry";
import { deleteObject, isS3Configured, keyFromS3Url } from "@/lib/s3";

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
    const entry = await BreedingEntry.findOne({ _id: ensureObjectId(id), userId: session.user.id });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    if ("femaleSpecimen" in updates) {
      entry.femaleSpecimen = sanitizeString(updates.femaleSpecimen) ?? undefined;
    }

    if ("maleSpecimen" in updates) {
      entry.maleSpecimen = sanitizeString(updates.maleSpecimen) ?? undefined;
    }

    if ("species" in updates) {
      entry.species = sanitizeString(updates.species) ?? undefined;
    }

    if ("pairingDate" in updates) {
      const nextDate = toDate(updates.pairingDate);
      if (nextDate) {
        entry.pairingDate = nextDate;
      }
    }

    if ("status" in updates) {
      const allowedStatuses = new Set(["Planned", "Attempted", "Successful", "Failed", "Observation"]);
      if (allowedStatuses.has(updates.status)) {
        entry.status = updates.status;
      }
    }

    if ("pairingNotes" in updates) {
      entry.pairingNotes = sanitizeString(updates.pairingNotes) ?? undefined;
    }

    if ("eggSacDate" in updates) {
      entry.eggSacDate = toDate(updates.eggSacDate);
    }

    if ("eggSacStatus" in updates) {
      const allowedEggStatuses = new Set(["Not Laid", "Laid", "Pulled", "Failed", "Hatched"]);
      if (allowedEggStatuses.has(updates.eggSacStatus)) {
        entry.eggSacStatus = updates.eggSacStatus;
      }
    }

    if ("eggSacCount" in updates) {
      entry.eggSacCount = toNumber(updates.eggSacCount);
    }

    if ("hatchDate" in updates) {
      entry.hatchDate = toDate(updates.hatchDate);
    }

    if ("slingCount" in updates) {
      entry.slingCount = toNumber(updates.slingCount);
    }

    if ("followUpDate" in updates) {
      entry.followUpDate = toDate(updates.followUpDate);
    }

    if ("notes" in updates) {
      entry.notes = sanitizeString(updates.notes) ?? undefined;
    }

    let removedAttachmentUrls: string[] = [];
    if (Array.isArray(updates.attachments)) {
      const prevUrls = (entry.attachments || []).map((a: any) => a.url).filter(Boolean);
      const nextUrls = (updates.attachments || []).map((a: any) => a.url).filter(Boolean);
      removedAttachmentUrls = prevUrls.filter((url: string) => !nextUrls.includes(url));
      entry.attachments = updates.attachments;
    }

    await entry.save();

    if (removedAttachmentUrls.length > 0) {
      const useS3 = isS3Configured();
      await Promise.all(
        removedAttachmentUrls.map(async (url) => {
          if (useS3) {
            const key = keyFromS3Url(url);
            if (key) {
              try {
                await deleteObject(key);
              } catch {}
            }
          } else if (url.startsWith("/uploads/")) {
            const file = path.join(process.cwd(), "public", url);
            try {
              await unlink(file);
            } catch {}
          }
        })
      );
    }

    return NextResponse.json({
      ...entry.toObject(),
      id: entry._id.toString(),
      userId: entry.userId.toString()
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update breeding entry." }, { status: 500 });
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
    const entry = await BreedingEntry.findOneAndDelete({
      _id: ensureObjectId(id),
      userId: session.user.id
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    try {
      const urls: string[] = (entry.attachments || []).map((a: any) => a.url).filter(Boolean);
      const useS3 = isS3Configured();
      await Promise.all(
        urls.map(async (url) => {
          if (useS3) {
            const key = keyFromS3Url(url);
            if (key) {
              try {
                await deleteObject(key);
              } catch {}
            }
          } else if (url.startsWith("/uploads/")) {
            const file = path.join(process.cwd(), "public", url);
            try {
              await unlink(file);
            } catch {}
          }
        })
      );
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to delete breeding entry." }, { status: 500 });
  }
}

