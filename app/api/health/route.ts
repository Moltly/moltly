export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { connectMongoose } from "@/lib/mongoose";
import HealthEntry from "@/models/HealthEntry";
import Specimen from "@/models/Specimen";
import { HealthEntryCreateSchema } from "@/lib/schemas/health";
import { ensureSpeciesSuggestion } from "@/lib/species-utils";
import { Types } from "mongoose";

type SpecimenLinkResolution =
  | {
      specimenId: string | undefined;
      specimen: string | undefined;
      species: string | undefined;
      error?: undefined;
    }
  | {
      specimenId: undefined;
      specimen: string | undefined;
      species: string | undefined;
      error: string;
    };

async function resolveSpecimenLink(
  userId: string,
  payload: { autoLinkSpecimen?: boolean; specimenId?: string; specimen?: string; species?: string }
): Promise<SpecimenLinkResolution> {
  if (payload.autoLinkSpecimen === false) {
    return {
      specimenId: undefined,
      specimen: payload.specimen,
      species: payload.species,
    };
  }

  if (payload.specimenId) {
    if (!Types.ObjectId.isValid(payload.specimenId)) {
      return {
        specimenId: undefined,
        specimen: payload.specimen,
        species: payload.species,
        error: "Selected specimen could not be found.",
      };
    }

    const specimen = await Specimen.findOne({ _id: payload.specimenId, userId });
    if (!specimen) {
      return {
        specimenId: undefined,
        specimen: payload.specimen,
        species: payload.species,
        error: "Selected specimen could not be found.",
      };
    }

    return {
      specimenId: specimen._id.toString(),
      specimen: specimen.name,
      species: specimen.species ?? payload.species,
    };
  }

  if (!payload.specimen) {
    return {
      specimenId: undefined,
      specimen: payload.specimen,
      species: payload.species,
    };
  }

  const query: Record<string, unknown> = {
    userId,
    name: payload.specimen,
  };
  if (payload.species) {
    query.species = payload.species;
  }

  const matches = await Specimen.find(query).sort({ createdAt: 1 }).limit(2);
  if (matches.length === 1) {
    const specimen = matches[0];
    return {
      specimenId: specimen._id.toString(),
      specimen: specimen.name,
      species: specimen.species ?? payload.species,
    };
  }

  return {
    specimenId: undefined,
    specimen: payload.specimen,
    species: payload.species,
  };
}

async function createSpecimenFromPayload(
  userId: string,
  input: { name: string; species?: string; sex?: string }
) {
  const specimen = await Specimen.create({
    userId,
    name: input.name,
    species: input.species,
    sex: input.sex,
  });

  return {
    doc: specimen,
    link: {
      specimenId: specimen._id.toString(),
      specimen: specimen.name,
      species: specimen.species,
    },
  };
}

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
      userId: document.userId.toString(),
      manualSpecimen: entry.manualSpecimen,
      detachedSpecimen: entry.detachedSpecimen,
      specimenId: document.specimenId?.toString(),
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
    const parsed = HealthEntryCreateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await connectMongoose();
    let createdSpecimen: { _id: Types.ObjectId } | null = null;
    try {
      const { createSpecimen, ...entryData } = parsed.data;
      const specimenLink = createSpecimen ? undefined : await resolveSpecimenLink(session.user.id, parsed.data);
      if (specimenLink && "error" in specimenLink) {
        return NextResponse.json({ error: specimenLink.error }, { status: 400 });
      }

      const created = createSpecimen
        ? await createSpecimenFromPayload(session.user.id, createSpecimen)
        : null;
      createdSpecimen = created?.doc ?? null;
      const createdLink = created?.link;
      const resolvedSpecimenId = createdLink?.specimenId ?? specimenLink?.specimenId;
      const resolvedSpecimenName = createdLink?.specimen ?? specimenLink?.specimen;
      const resolvedSpecies = createdLink?.species ?? specimenLink?.species ?? entryData.species;

      const entry = await HealthEntry.create({
        userId: session.user.id,
        ...entryData,
        specimenId: resolvedSpecimenId,
        manualSpecimen: parsed.data.autoLinkSpecimen === false,
        specimen: resolvedSpecimenName,
        species: resolvedSpecies,
      });

      if (entry.species && typeof entry.species === "string") {
        ensureSpeciesSuggestion(entry.species, session.user.id).catch(() => undefined);
      }

      return NextResponse.json(
        {
          ...entry.toObject(),
          id: entry._id.toString(),
          userId: entry.userId.toString(),
          manualSpecimen: entry.manualSpecimen,
          detachedSpecimen: entry.detachedSpecimen,
          specimenId: entry.specimenId?.toString(),
        },
        { status: 201 }
      );
    } catch (error) {
      if (createdSpecimen) {
        await Specimen.deleteOne({ _id: createdSpecimen._id, userId: session.user.id }).catch(() => undefined);
      }
      throw error;
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create health entry." }, { status: 500 });
  }
}
