export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { connectMongoose } from "@/lib/mongoose";
import BreedingEntry from "@/models/BreedingEntry";
import Specimen from "@/models/Specimen";
import { BreedingEntryCreateSchema } from "@/lib/schemas/breeding";
import { ensureSpeciesSuggestion } from "@/lib/species-utils";
import { Types } from "mongoose";

type ParticipantResolution =
  | {
      specimenId: string | undefined;
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

const hasConflictingRoleSex = (sex: unknown, expectedSex?: "Female" | "Male") =>
  Boolean(expectedSex && typeof sex === "string" && sex !== expectedSex && sex !== "Unknown" && sex !== "Unsexed");

async function resolveParticipant(
  userId: string,
  autoLink: boolean | undefined,
  specimenId: string | undefined,
  specimenName: string | undefined,
  species: string | undefined,
  expectedSex?: "Female" | "Male"
): Promise<ParticipantResolution> {
  if (autoLink === false) {
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
      specimenId: specimen._id.toString(),
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
      specimenId: specimen._id.toString(),
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
      userId: document.userId.toString(),
      manualFemaleSpecimen: entry.manualFemaleSpecimen,
      detachedFemaleSpecimen: entry.detachedFemaleSpecimen,
      femaleSpecimenId: document.femaleSpecimenId?.toString(),
      manualMaleSpecimen: entry.manualMaleSpecimen,
      detachedMaleSpecimen: entry.detachedMaleSpecimen,
      maleSpecimenId: document.maleSpecimenId?.toString(),
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
    const parsed = BreedingEntryCreateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await connectMongoose();
    let createdFemale: { _id: Types.ObjectId } | null = null;
    let createdMale: { _id: Types.ObjectId } | null = null;
    try {
      const { createFemaleSpecimen, createMaleSpecimen, ...entryData } = parsed.data;

      const femaleCreated = createFemaleSpecimen
        ? await createSpecimenFromPayload(session.user.id, createFemaleSpecimen, "Female")
        : null;
      createdFemale = femaleCreated;

      const female = femaleCreated
        ? {
            specimenId: femaleCreated._id.toString(),
            specimenName: femaleCreated.name,
            species: femaleCreated.species ?? parsed.data.species,
          }
        : await resolveParticipant(
            session.user.id,
            parsed.data.autoLinkFemaleSpecimen,
            parsed.data.femaleSpecimenId,
            parsed.data.femaleSpecimen,
            parsed.data.species,
            "Female"
          );
      if ("error" in female) {
        return NextResponse.json({ error: female.error }, { status: 400 });
      }

      const maleCreated = createMaleSpecimen
        ? await createSpecimenFromPayload(session.user.id, {
            ...createMaleSpecimen,
            species: createMaleSpecimen.species ?? female.species ?? parsed.data.species,
          }, "Male")
        : null;
      createdMale = maleCreated;

      const male = maleCreated
        ? {
            specimenId: maleCreated._id.toString(),
            specimenName: maleCreated.name,
            species: maleCreated.species ?? female.species ?? parsed.data.species,
          }
        : await resolveParticipant(
            session.user.id,
            parsed.data.autoLinkMaleSpecimen,
            parsed.data.maleSpecimenId,
            parsed.data.maleSpecimen,
            female.species ?? parsed.data.species,
            "Male"
          );
      if ("error" in male) {
        if (createdFemale) {
          await Specimen.deleteOne({ _id: createdFemale._id, userId: session.user.id }).catch(() => undefined);
        }
        return NextResponse.json({ error: male.error }, { status: 400 });
      }

      if (female.specimenId && male.specimenId && female.specimenId === male.specimenId) {
        if (createdFemale) {
          await Specimen.deleteOne({ _id: createdFemale._id, userId: session.user.id }).catch(() => undefined);
        }
        if (createdMale) {
          await Specimen.deleteOne({ _id: createdMale._id, userId: session.user.id }).catch(() => undefined);
        }
        return NextResponse.json({ error: "Female and male specimens must be different." }, { status: 400 });
      }
      const entry = await BreedingEntry.create({
        userId: session.user.id,
        ...entryData,
        femaleSpecimenId: female.specimenId,
        manualFemaleSpecimen: parsed.data.autoLinkFemaleSpecimen === false,
        femaleSpecimen: female.specimenName,
        maleSpecimenId: male.specimenId,
        manualMaleSpecimen: parsed.data.autoLinkMaleSpecimen === false,
        maleSpecimen: male.specimenName,
        species: male.species ?? female.species ?? parsed.data.species,
      });

      if (entry.species && typeof entry.species === "string") {
        ensureSpeciesSuggestion(entry.species, session.user.id).catch(() => undefined);
      }

      return NextResponse.json(
        {
          ...entry.toObject(),
          id: entry._id.toString(),
          userId: entry.userId.toString(),
          manualFemaleSpecimen: entry.manualFemaleSpecimen,
          detachedFemaleSpecimen: entry.detachedFemaleSpecimen,
          femaleSpecimenId: entry.femaleSpecimenId?.toString(),
          manualMaleSpecimen: entry.manualMaleSpecimen,
          detachedMaleSpecimen: entry.detachedMaleSpecimen,
          maleSpecimenId: entry.maleSpecimenId?.toString(),
        },
        { status: 201 }
      );
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
    return NextResponse.json({ error: "Unable to create breeding entry." }, { status: 500 });
  }
}
