export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectMongoose } from "@/lib/mongoose";
import MoltEntry from "@/models/MoltEntry";
import HealthEntry from "@/models/HealthEntry";
import BreedingEntry from "@/models/BreedingEntry";
import SpecimenCover from "@/models/SpecimenCover";
import Specimen from "@/models/Specimen";
import { Types } from "mongoose";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildLegacyNameQuery = (field: string, name: string, species?: string, includeUnspecifiedSpecies = true) => {
  const match = new RegExp(`^${escapeRegex(name)}$`, "i");
  if (!species) {
    return { [field]: match };
  }

  const speciesMatch = new RegExp(`^${escapeRegex(species)}$`, "i");
  if (!includeUnspecifiedSpecies) {
    return { [field]: match, species: speciesMatch };
  }

  return {
    [field]: match,
    $or: [{ species: speciesMatch }, { species: { $exists: false } }, { species: null }, { species: "" }],
  };
};

const buildSiblingSpecimenQuery = (userId: Types.ObjectId, name: string) => ({
  userId,
  name: new RegExp(`^${escapeRegex(name)}$`, "i"),
});

const buildExactSpecimenQuery = (userId: Types.ObjectId, name: string, species?: string) => {
  const query: Record<string, unknown> = {
    userId,
    name: new RegExp(`^${escapeRegex(name)}$`, "i"),
  };
  if (species) {
    query.species = new RegExp(`^${escapeRegex(species)}$`, "i");
  } else {
    query.$or = [{ species: { $exists: false } }, { species: null }, { species: "" }];
  }
  return query;
};

const buildLegacyCoverQuery = (userId: Types.ObjectId, key: string) => ({
  userId,
  key: new RegExp(`^${escapeRegex(key)}$`, "i"),
});

type LegacyWindow = {
  after?: Date;
  before?: Date;
};

const buildUnspecifiedSpeciesClause = () => ({
  $or: [{ species: { $exists: false } }, { species: null }, { species: "" }],
});

const buildSpeciesOrUnspecifiedClause = (species?: string) => {
  if (!species) return buildUnspecifiedSpeciesClause();
  const speciesMatch = new RegExp(`^${escapeRegex(species)}$`, "i");
  return {
    $or: [{ species: speciesMatch }, { species: { $exists: false } }, { species: null }, { species: "" }],
  };
};

const combineQueryClauses = (...clauses: Array<Record<string, unknown> | undefined>) => {
  const filtered = clauses.filter((clause): clause is Record<string, unknown> => Boolean(clause));
  if (filtered.length === 0) return {};
  if (filtered.length === 1) return filtered[0];
  return { $and: filtered };
};

const buildLegacyWindowClause = (dateField: string, window?: LegacyWindow) => {
  if (!window?.after && !window?.before) return undefined;
  const range: Record<string, Date> = {};
  if (window.after) range.$gte = window.after;
  if (window.before) range.$lt = window.before;
  return { [dateField]: range };
};

const buildLegacyTimedQuery = (field: string, name: string, dateField: string, window: LegacyWindow, species?: string) =>
  combineQueryClauses(
    { [field]: new RegExp(`^${escapeRegex(name)}$`, "i") },
    buildSpeciesOrUnspecifiedClause(species),
    buildLegacyWindowClause(dateField, window)
  );

const buildLegacyUnspecifiedTimedQuery = (field: string, name: string, dateField: string, window: LegacyWindow) =>
  combineQueryClauses(
    { [field]: new RegExp(`^${escapeRegex(name)}$`, "i") },
    buildUnspecifiedSpeciesClause(),
    buildLegacyWindowClause(dateField, window)
  );

const excludeDetachedMoltClause = () => ({ detachedSpecimen: { $ne: true } });
const excludeExplicitManualHealthClause = () => ({
  $or: [{ manualSpecimen: { $exists: false } }, { manualSpecimen: false }],
});
const excludeDetachedHealthClause = () => ({ detachedSpecimen: { $ne: true } });
const excludeExplicitManualBreedingClause = (role: "female" | "male") =>
  role === "female"
    ? { $or: [{ manualFemaleSpecimen: { $exists: false } }, { manualFemaleSpecimen: false }] }
    : { $or: [{ manualMaleSpecimen: { $exists: false } }, { manualMaleSpecimen: false }] };

const excludeDetachedBreedingClause = (role: "female" | "male") =>
  role === "female" ? { detachedFemaleSpecimen: { $ne: true } } : { detachedMaleSpecimen: { $ne: true } };

const normalizePairingStatus = (specimen: {
  pairingStatus?: string | null;
  availableForPairing?: boolean | null;
  sex?: string | null;
}) => {
  const allowed = new Set(["none", "seeking_male", "seeking_female", "has_male", "has_female", "open_to_offers"]);
  if (specimen.pairingStatus && allowed.has(specimen.pairingStatus)) {
    if (specimen.pairingStatus === "has_male") return "seeking_female";
    if (specimen.pairingStatus === "has_female") return "seeking_male";
    return specimen.pairingStatus;
  }
  if (specimen.availableForPairing) return specimen.sex === "Female" ? "seeking_male" : "seeking_female";
  return "none";
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const specimen = (searchParams.get("specimen") || "").trim();
  const specimenId = (searchParams.get("specimenId") || "").trim();
  const species = (searchParams.get("species") || "").trim();
  const ownerId = (searchParams.get("owner") || "").trim();
  if ((!specimen && !specimenId) || !ownerId) {
    return NextResponse.json({ error: "Missing specimen identity or owner" }, { status: 400 });
  }

  try {
    let ownerObjectId: Types.ObjectId;
    try {
      ownerObjectId = new Types.ObjectId(ownerId);
    } catch {
      return NextResponse.json({ error: "Invalid owner id" }, { status: 400 });
    }
    await connectMongoose();
    let sharedSpecimen:
        | {
          id: string;
          name: string;
          species?: string;
          sex?: string;
          imageUrl?: string;
          notes?: string;
          pairingStatus?: string;
          pairingNotes?: string;
          createdAt?: string;
          updatedAt?: string;
        }
      | null = null;

    if (specimenId) {
      if (!Types.ObjectId.isValid(specimenId)) {
        return NextResponse.json({ error: "Invalid specimen id" }, { status: 400 });
      } else {
        const sourceSpecimen = await Specimen.findOne({ _id: specimenId, userId: ownerObjectId }).lean();
        if (!sourceSpecimen) {
          return NextResponse.json({ error: "Specimen not found" }, { status: 404 });
        } else if (sourceSpecimen) {
          sharedSpecimen = {
            id: String(sourceSpecimen._id),
            name: sourceSpecimen.name as string,
            species: sourceSpecimen.species as string | undefined,
            sex: sourceSpecimen.sex as string | undefined,
            imageUrl: sourceSpecimen.imageUrl as string | undefined,
            notes: sourceSpecimen.notes as string | undefined,
            pairingStatus: normalizePairingStatus(sourceSpecimen),
            pairingNotes: sourceSpecimen.pairingNotes as string | undefined,
            createdAt: sourceSpecimen.createdAt instanceof Date ? sourceSpecimen.createdAt.toISOString() : undefined,
            updatedAt: sourceSpecimen.updatedAt instanceof Date ? sourceSpecimen.updatedAt.toISOString() : undefined,
          };
        }
      }
    }

    if (!sharedSpecimen && specimen) {
      const legacySpecimenQuery: Record<string, unknown> = buildSiblingSpecimenQuery(ownerObjectId, specimen);
      if (species) {
        legacySpecimenQuery.species = new RegExp(`^${escapeRegex(species)}$`, "i");
      }
      const legacyMatches = await Specimen.find(legacySpecimenQuery)
        .sort({ createdAt: 1, _id: 1 })
        .limit(2)
        .lean();
      if (legacyMatches.length > 1) {
        return NextResponse.json({ error: "Specimen link is ambiguous" }, { status: 409 });
      }
      if (legacyMatches.length === 1) {
        const matchedSpecimen = legacyMatches[0];
        sharedSpecimen = {
          id: String(matchedSpecimen._id),
          name: matchedSpecimen.name as string,
          species: matchedSpecimen.species as string | undefined,
          sex: matchedSpecimen.sex as string | undefined,
          imageUrl: matchedSpecimen.imageUrl as string | undefined,
          notes: matchedSpecimen.notes as string | undefined,
          pairingStatus: normalizePairingStatus(matchedSpecimen),
          pairingNotes: matchedSpecimen.pairingNotes as string | undefined,
          createdAt: matchedSpecimen.createdAt instanceof Date ? matchedSpecimen.createdAt.toISOString() : undefined,
          updatedAt: matchedSpecimen.updatedAt instanceof Date ? matchedSpecimen.updatedAt.toISOString() : undefined,
        };
      }
    }

    let sameNameCount = 0;
    let exactIdentityCount = 0;
    let legacyWindow: LegacyWindow | undefined;
    if (sharedSpecimen) {
      const sameNameSiblings = await Specimen.find(buildSiblingSpecimenQuery(ownerObjectId, sharedSpecimen.name))
        .select({ _id: 1, createdAt: 1 })
        .sort({ createdAt: 1, _id: 1 })
        .lean();
      sameNameCount = sameNameSiblings.length;
      if (sameNameCount > 1) {
        const currentIndex = sameNameSiblings.findIndex((doc) => String(doc._id) === sharedSpecimen?.id);
        if (currentIndex >= 0) {
          legacyWindow = {
            after: currentIndex > 0 ? (sameNameSiblings[currentIndex]?.createdAt as Date | undefined) : undefined,
            before:
              currentIndex < sameNameSiblings.length - 1
                ? (sameNameSiblings[currentIndex + 1]?.createdAt as Date | undefined)
                : undefined,
          };
        }
      }
      if (sharedSpecimen.species) {
        exactIdentityCount = await Specimen.countDocuments(
          buildExactSpecimenQuery(ownerObjectId, sharedSpecimen.name, sharedSpecimen.species)
        );
      }
    }

    const buildLegacyClauses = (field: string, dateField: string) => {
      if (!sharedSpecimen) {
        return [buildLegacyNameQuery(field, specimen, species || undefined)];
      }
      if (sameNameCount <= 1) {
        return [buildLegacyNameQuery(field, sharedSpecimen.name, sharedSpecimen.species)];
      }
      if (sharedSpecimen.species && exactIdentityCount === 1) {
        const clauses: Record<string, unknown>[] = [
          buildLegacyNameQuery(field, sharedSpecimen.name, sharedSpecimen.species, false),
        ];
        if (legacyWindow) {
          clauses.push(buildLegacyUnspecifiedTimedQuery(field, sharedSpecimen.name, dateField, legacyWindow));
        }
        return clauses;
      }
      if (legacyWindow) {
        return [
          buildLegacyTimedQuery(
            field,
            sharedSpecimen.name,
            dateField,
            legacyWindow,
            sharedSpecimen.species ?? (species || undefined)
          ),
        ];
      }
      return [];
    };

    const resolvedSpecimenId = sharedSpecimen?.id;

    const [moltEntries, healthEntries, breedingEntries, cover] = await Promise.all([
      sharedSpecimen
        ? MoltEntry.find({
            userId: ownerObjectId,
            $or: [
              { specimenId: resolvedSpecimenId },
              ...buildLegacyClauses("specimen", "date").map((clause) =>
                combineQueryClauses(clause, excludeDetachedMoltClause())
              ),
            ],
          })
            .sort({ date: -1 })
            .lean()
        : MoltEntry.find({
            userId: ownerObjectId,
            ...buildLegacyNameQuery("specimen", specimen, species || undefined),
          }).sort({ date: -1 }).lean(),
      sharedSpecimen
        ? HealthEntry.find({
            userId: ownerObjectId,
            $or: [
              { specimenId: resolvedSpecimenId },
              ...buildLegacyClauses("specimen", "date").map((clause) =>
                combineQueryClauses(clause, excludeExplicitManualHealthClause(), excludeDetachedHealthClause())
              ),
            ],
          })
            .sort({ date: -1 })
            .lean()
        : HealthEntry.find({
            userId: ownerObjectId,
            ...combineQueryClauses(
              buildLegacyNameQuery("specimen", specimen, species || undefined),
              excludeExplicitManualHealthClause()
            ),
          }).sort({ date: -1 }).lean(),
      (sharedSpecimen
        ? BreedingEntry.find({
            userId: ownerObjectId,
            $or: [
              { femaleSpecimenId: resolvedSpecimenId },
              { maleSpecimenId: resolvedSpecimenId },
              ...buildLegacyClauses("femaleSpecimen", "pairingDate").map((clause) =>
                combineQueryClauses(
                  clause,
                  excludeExplicitManualBreedingClause("female"),
                  excludeDetachedBreedingClause("female")
                )
              ),
              ...buildLegacyClauses("maleSpecimen", "pairingDate").map((clause) =>
                combineQueryClauses(
                  clause,
                  excludeExplicitManualBreedingClause("male"),
                  excludeDetachedBreedingClause("male")
                )
              ),
            ],
          })
        : BreedingEntry.find({
            userId: ownerObjectId,
            $or: [
              combineQueryClauses(
                buildLegacyNameQuery("femaleSpecimen", specimen, species || undefined),
                excludeExplicitManualBreedingClause("female")
              ),
              combineQueryClauses(
                buildLegacyNameQuery("maleSpecimen", specimen, species || undefined),
                excludeExplicitManualBreedingClause("male")
              ),
            ],
          }))
        .sort({ pairingDate: -1 })
        .lean(),
      sharedSpecimen && sharedSpecimen.imageUrl !== undefined
        ? Promise.resolve(null)
        : SpecimenCover.findOne(buildLegacyCoverQuery(ownerObjectId, sharedSpecimen?.name ?? specimen)).lean(),
    ]);

    const normalize = (doc: any) => ({
      ...doc,
      id: doc._id?.toString() ?? "",
      specimenId: doc.specimenId?.toString?.() ?? doc.specimenId,
      manualSpecimen: doc.manualSpecimen,
      detachedSpecimen: doc.detachedSpecimen,
      femaleSpecimenId: doc.femaleSpecimenId?.toString?.() ?? doc.femaleSpecimenId,
      manualFemaleSpecimen: doc.manualFemaleSpecimen,
      detachedFemaleSpecimen: doc.detachedFemaleSpecimen,
      maleSpecimenId: doc.maleSpecimenId?.toString?.() ?? doc.maleSpecimenId,
      manualMaleSpecimen: doc.manualMaleSpecimen,
      detachedMaleSpecimen: doc.detachedMaleSpecimen,
      _id: undefined,
      userId: undefined,
    });

    return NextResponse.json({
      specimen: sharedSpecimen,
      entries: moltEntries.map(normalize),
      health: healthEntries.map(normalize),
      breeding: breedingEntries.map(normalize),
      cover: sharedSpecimen?.imageUrl ?? cover?.imageUrl ?? null,
    });
  } catch (err) {
    console.error("Failed to load shared specimen", err);
    return NextResponse.json({ error: "Failed to load shared specimen" }, { status: 500 });
  }
}
