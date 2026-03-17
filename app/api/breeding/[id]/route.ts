import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import path from "path";
import { unlink } from "fs/promises";
import { authOptions } from "@/lib/auth-options";
import { connectMongoose } from "@/lib/mongoose";
import BreedingEntry from "@/models/BreedingEntry";
import Specimen from "@/models/Specimen";
import { deleteObject, isS3Configured, keyFromS3Url } from "@/lib/s3";

type RouteContext = {
  params: Promise<{ id?: string | string[] }>;
};

type ParticipantResolution =
  | {
      specimenId: Types.ObjectId | undefined;
      specimenName: string | undefined;
      species: string | undefined;
      error?: undefined;
    }
  | {
      specimenId: undefined;
      specimenName: string | undefined;
      species: string | undefined;
      error: string;
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

const hasConflictingRoleSex = (sex: unknown, expectedSex?: "Female" | "Male") =>
  Boolean(expectedSex && typeof sex === "string" && sex !== expectedSex && sex !== "Unknown" && sex !== "Unsexed");

async function resolveParticipant(
  userId: string,
  autoLink: boolean | undefined,
  specimenId: string | null | undefined,
  specimenName: string | undefined,
  species: string | undefined,
  expectedSex?: "Female" | "Male"
): Promise<ParticipantResolution> {
  if (autoLink === false) {
    return { specimenId: undefined, specimenName, species };
  }

  if (specimenId === null) {
    return { specimenId: undefined, specimenName, species };
  }

  if (specimenId) {
    if (!Types.ObjectId.isValid(specimenId)) {
      return {
        specimenId: undefined,
        specimenName,
        species,
        error: "Selected specimen could not be found.",
      };
    }
    const specimen = await Specimen.findOne({ _id: specimenId, userId });
    if (!specimen) {
      return {
        specimenId: undefined,
        specimenName,
        species,
        error: "Selected specimen could not be found.",
      };
    }
    if (hasConflictingRoleSex(specimen.sex, expectedSex)) {
      const roleLabel = expectedSex === "Female" ? "female" : "male";
      return {
        specimenId: undefined,
        specimenName: specimen.name,
        species: specimen.species ?? species,
        error: `${expectedSex} participant must use a ${roleLabel} or unsexed specimen.`,
      };
    }
    return {
      specimenId: specimen._id,
      specimenName: specimen.name,
      species: specimen.species ?? species,
    };
  }

  if (!specimenName) {
    return { specimenId: undefined, specimenName, species };
  }

  const query: Record<string, unknown> = {
    userId,
    name: specimenName,
  };
  if (species) {
    query.species = species;
  }
  if (expectedSex) {
    query.$or = [
      { sex: expectedSex },
      { sex: { $exists: false } },
      { sex: null },
      { sex: "" },
      { sex: "Unknown" },
      { sex: "Unsexed" },
    ];
  }

  const matches = await Specimen.find(query).sort({ createdAt: 1 }).limit(2);
  if (matches.length === 1) {
    const specimen = matches[0];
    return {
      specimenId: specimen._id,
      specimenName: specimen.name,
      species: specimen.species ?? species,
    };
  }

  return { specimenId: undefined, specimenName, species };
}

async function createSpecimenFromPayload(
  userId: string,
  input: { name: string; species?: string; sex?: string },
  expectedSex?: "Female" | "Male"
) {
  return Specimen.create({
    userId,
    name: input.name,
    species: input.species,
    sex: expectedSex ?? input.sex,
  });
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

    const nextSpecies = "species" in updates ? sanitizeString(updates.species) ?? undefined : entry.species ?? undefined;
    const femaleParticipantChanged =
      "femaleSpecimen" in updates ||
      "femaleSpecimenId" in updates ||
      "autoLinkFemaleSpecimen" in updates ||
      "createFemaleSpecimen" in updates;
    const maleParticipantChanged =
      "maleSpecimen" in updates ||
      "maleSpecimenId" in updates ||
      "autoLinkMaleSpecimen" in updates ||
      "createMaleSpecimen" in updates;

    const femaleNameInput = "femaleSpecimen" in updates
      ? sanitizeString(updates.femaleSpecimen) ?? undefined
      : entry.femaleSpecimen ?? undefined;
    const femaleIdInput = "femaleSpecimenId" in updates
      ? (typeof updates.femaleSpecimenId === "string"
          ? updates.femaleSpecimenId
          : updates.femaleSpecimenId === null
            ? null
            : undefined)
      : entry.femaleSpecimenId?.toString();
    const maleNameInput = "maleSpecimen" in updates
      ? sanitizeString(updates.maleSpecimen) ?? undefined
      : entry.maleSpecimen ?? undefined;
    const maleIdInput = "maleSpecimenId" in updates
      ? (typeof updates.maleSpecimenId === "string"
          ? updates.maleSpecimenId
          : updates.maleSpecimenId === null
            ? null
            : undefined)
      : entry.maleSpecimenId?.toString();

    let createdFemale: { _id: Types.ObjectId; name: string; species?: string } | null = null;
    let createdMale: { _id: Types.ObjectId; name: string; species?: string } | null = null;
    try {
      const createFemaleSpecimen =
        updates.createFemaleSpecimen &&
        typeof updates.createFemaleSpecimen === "object" &&
        typeof updates.createFemaleSpecimen.name === "string" &&
        updates.createFemaleSpecimen.name.trim()
          ? {
              name: updates.createFemaleSpecimen.name.trim(),
              species:
                typeof updates.createFemaleSpecimen.species === "string" && updates.createFemaleSpecimen.species.trim()
                  ? updates.createFemaleSpecimen.species.trim()
                  : nextSpecies,
              sex: "Female" as const,
            }
          : null;
      const createMaleSpecimen =
        updates.createMaleSpecimen &&
        typeof updates.createMaleSpecimen === "object" &&
        typeof updates.createMaleSpecimen.name === "string" &&
        updates.createMaleSpecimen.name.trim()
          ? {
              name: updates.createMaleSpecimen.name.trim(),
              species:
                typeof updates.createMaleSpecimen.species === "string" && updates.createMaleSpecimen.species.trim()
                  ? updates.createMaleSpecimen.species.trim()
                  : nextSpecies,
              sex: "Male" as const,
            }
          : null;

      const femaleCreated = createFemaleSpecimen
        ? await createSpecimenFromPayload(session.user.id, createFemaleSpecimen, "Female")
        : null;
      createdFemale = femaleCreated;
      const female = femaleCreated
        ? {
            specimenId: femaleCreated._id,
            specimenName: femaleCreated.name,
            species: femaleCreated.species ?? nextSpecies,
          }
        : femaleParticipantChanged
          ? await resolveParticipant(
              session.user.id,
              "autoLinkFemaleSpecimen" in updates ? updates.autoLinkFemaleSpecimen !== false : true,
              femaleIdInput,
              femaleNameInput,
              nextSpecies,
              "Female"
            )
          : {
              specimenId: entry.femaleSpecimenId,
              specimenName: entry.femaleSpecimen ?? undefined,
              species: nextSpecies,
            };
      if ("error" in female) {
        return NextResponse.json({ error: female.error }, { status: 400 });
      }

      const maleCreated = createMaleSpecimen
        ? await createSpecimenFromPayload(session.user.id, {
            ...createMaleSpecimen,
            species: createMaleSpecimen.species ?? female.species ?? nextSpecies,
          }, "Male")
        : null;
      createdMale = maleCreated;
      const male = maleCreated
        ? {
            specimenId: maleCreated._id,
            specimenName: maleCreated.name,
            species: maleCreated.species ?? female.species ?? nextSpecies,
          }
        : maleParticipantChanged
          ? await resolveParticipant(
              session.user.id,
              "autoLinkMaleSpecimen" in updates ? updates.autoLinkMaleSpecimen !== false : true,
              maleIdInput,
              maleNameInput,
              female.species ?? nextSpecies,
              "Male"
            )
          : {
              specimenId: entry.maleSpecimenId,
              specimenName: entry.maleSpecimen ?? undefined,
              species: female.species ?? nextSpecies,
            };
      if ("error" in male) {
        if (createdFemale) {
          await Specimen.deleteOne({ _id: createdFemale._id, userId: session.user.id }).catch(() => undefined);
        }
        return NextResponse.json({ error: male.error }, { status: 400 });
      }

      if (female.specimenId && male.specimenId && String(female.specimenId) === String(male.specimenId)) {
        if (createdFemale) {
          await Specimen.deleteOne({ _id: createdFemale._id, userId: session.user.id }).catch(() => undefined);
        }
        if (createdMale) {
          await Specimen.deleteOne({ _id: createdMale._id, userId: session.user.id }).catch(() => undefined);
        }
        return NextResponse.json({ error: "Female and male specimens must be different." }, { status: 400 });
      }

      entry.femaleSpecimenId = female.specimenId;
      entry.manualFemaleSpecimen = femaleParticipantChanged
        ? ("autoLinkFemaleSpecimen" in updates ? updates.autoLinkFemaleSpecimen === false : false)
        : entry.manualFemaleSpecimen;
      if (femaleParticipantChanged) {
        entry.detachedFemaleSpecimen = false;
      }
      entry.femaleSpecimen = female.specimenName ?? undefined;
      entry.maleSpecimenId = male.specimenId;
      entry.manualMaleSpecimen = maleParticipantChanged
        ? ("autoLinkMaleSpecimen" in updates ? updates.autoLinkMaleSpecimen === false : false)
        : entry.manualMaleSpecimen;
      if (maleParticipantChanged) {
        entry.detachedMaleSpecimen = false;
      }
      entry.maleSpecimen = male.specimenName ?? undefined;
      entry.species = male.species ?? female.species ?? nextSpecies;

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
      userId: entry.userId.toString(),
      manualFemaleSpecimen: entry.manualFemaleSpecimen,
      detachedFemaleSpecimen: entry.detachedFemaleSpecimen,
      femaleSpecimenId: entry.femaleSpecimenId?.toString(),
      manualMaleSpecimen: entry.manualMaleSpecimen,
      detachedMaleSpecimen: entry.detachedMaleSpecimen,
      maleSpecimenId: entry.maleSpecimenId?.toString(),
    });
    } catch (error) {
      if (createdFemale) {
        await Specimen.deleteOne({ _id: createdFemale._id, userId: session.user.id }).catch(() => undefined);
      }
      if (createdMale) {
        await Specimen.deleteOne({ _id: createdMale._id, userId: session.user.id }).catch(() => undefined);
      }
      throw error;
    }
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
