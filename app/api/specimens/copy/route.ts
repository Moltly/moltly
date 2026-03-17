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
import Specimen from "@/models/Specimen";
import { Types } from "mongoose";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import crypto from "crypto";
import { isS3Configured, objectKeyFor, putObject } from "@/lib/s3";

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

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  try {
    const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) return null;
    return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
  } catch {
    return null;
  }
}

function extFromMime(mime?: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/avif": "avif",
  };
  return mime && map[mime] ? map[mime] : "jpg";
}

function guessMimeFromName(name?: string): string | undefined {
  const ext = name?.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    avif: "image/avif",
  };
  return ext ? map[ext] : undefined;
}

const ALLOWED_IMAGE_HOSTS: string[] = (() => {
  const hosts = new Set<string>();

  const rawEnvHosts = (process.env.IMAGE_PROXY_ALLOWED_HOSTS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const value of rawEnvHosts) {
    try {
      const parsed = new URL(value);
      if (parsed.hostname) hosts.add(parsed.hostname.toLowerCase());
    } catch {
      hosts.add(value.toLowerCase());
    }
  }

  const s3Base = process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT || "";
  if (s3Base) {
    try {
      const parsed = new URL(s3Base);
      if (parsed.hostname) hosts.add(parsed.hostname.toLowerCase());
    } catch {
      hosts.add(s3Base.toLowerCase());
    }
  }

  return Array.from(hosts);
})();

function isLocalHostname(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value.endsWith(".localhost");
}

function isIpHostname(hostname: string): boolean {
  return /^[0-9.]+$/.test(hostname) || hostname.includes(":");
}

function resolveAllowedImageUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const hostname = url.hostname.toLowerCase();
    if (!hostname || isLocalHostname(hostname) || isIpHostname(hostname)) return null;
    if (ALLOWED_IMAGE_HOSTS.length === 0) return null;

    const isAllowedHost = ALLOWED_IMAGE_HOSTS.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
    );
    return isAllowedHost ? url : null;
  } catch {
    return null;
  }
}

async function duplicateAssetUrl(
  raw: string | undefined,
  mimeHint: string | undefined,
  userId: string,
  uploadsDir: string | null,
  useS3: boolean
): Promise<string | undefined> {
  if (raw === "") return "";
  if (!raw) return undefined;

  try {
    let buffer: Buffer | null = null;
    let mime = mimeHint || guessMimeFromName(raw);

    if (raw.startsWith("data:")) {
      const parsed = parseDataUrl(raw);
      if (parsed) {
        buffer = parsed.buffer;
        mime = mime || parsed.mime;
      }
    } else if (raw.startsWith("/uploads/")) {
      const filePath = path.join(process.cwd(), "public", raw);
      buffer = await readFile(filePath);
    } else {
      const remote = resolveAllowedImageUrl(raw);
      if (remote) {
        const res = await fetch(remote.toString());
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
          mime = mime || res.headers.get("content-type") || undefined;
        }
      }
    }

    if (!buffer) return raw;

    const ext = extFromMime(mime);
    const filename = `${crypto.randomUUID()}.${ext}`;
    if (useS3) {
      const key = objectKeyFor(userId, filename);
      const { url } = await putObject({ key, body: buffer, contentType: mime || `image/${ext}` });
      return url;
    }
    if (uploadsDir) {
      const destination = path.join(uploadsDir, filename);
      await writeFile(destination, buffer);
      return `/uploads/${userId}/${filename}`;
    }
  } catch {
    return raw;
  }

  return raw;
}

async function duplicateAttachments(
  raw: any[] | undefined,
  userId: string,
  uploadsDir: string | null,
  useS3: boolean
) {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  return Promise.all(
    raw.map(async (attachment) => ({
      id: attachment?.id || crypto.randomUUID(),
      name: attachment?.name,
      url: await duplicateAssetUrl(attachment?.url, attachment?.type, userId, uploadsDir, useS3),
      type: attachment?.type,
      addedAt: attachment?.addedAt,
    }))
  );
}

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

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUserId = session.user.id;

  try {
    const { specimen, specimenId, species, ownerId } = (await request.json()) as {
      specimen?: string;
      specimenId?: string;
      species?: string;
      ownerId?: string;
    };
    if ((!specimen || typeof specimen !== "string" || !specimen.trim()) && (!specimenId || typeof specimenId !== "string" || !specimenId.trim())) {
      return NextResponse.json({ error: "Invalid specimen identity" }, { status: 400 });
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
    const useS3 = isS3Configured();
    const uploadsDir = !useS3 ? path.join(process.cwd(), "public", "uploads", sessionUserId) : null;
    if (!useS3 && uploadsDir) {
      await mkdir(uploadsDir, { recursive: true });
    }

    let sourceSpecimen:
      | {
          id: string;
          name: string;
          species?: string;
          sex?: string;
          imageUrl?: string;
          notes?: string;
          attachments?: Array<{
            id?: string;
            name?: string;
            url?: string;
            type?: string;
            addedAt?: string | Date;
          }>;
          archived?: boolean;
          archivedAt?: Date | string;
          archivedReason?: string;
          createdAt?: Date | string;
        }
      | null = null;

    if (specimenId?.trim()) {
      if (!Types.ObjectId.isValid(specimenId.trim())) {
        return NextResponse.json({ error: "Invalid specimen id" }, { status: 400 });
      } else {
        const found = await Specimen.findOne({ _id: specimenId.trim(), userId: ownerObjectId }).lean();
        if (!found) {
          return NextResponse.json({ error: "Specimen not found" }, { status: 404 });
        } else if (found) {
          sourceSpecimen = {
            id: String(found._id),
            name: found.name as string,
            species: found.species as string | undefined,
            sex: found.sex as string | undefined,
            imageUrl: found.imageUrl as string | undefined,
            notes: found.notes as string | undefined,
            attachments: Array.isArray(found.attachments) ? (found.attachments as any[]) : undefined,
            archived: found.archived as boolean | undefined,
            archivedAt: found.archivedAt as Date | string | undefined,
            archivedReason: found.archivedReason as string | undefined,
            createdAt: found.createdAt as Date | string | undefined,
          };
        }
      }
    }

    if (!sourceSpecimen && specimen?.trim()) {
      const legacySpecimenQuery: Record<string, unknown> = buildSiblingSpecimenQuery(ownerObjectId, specimen.trim());
      if (species?.trim()) {
        legacySpecimenQuery.species = new RegExp(`^${escapeRegex(species.trim())}$`, "i");
      }
      const legacyMatches = await Specimen.find(legacySpecimenQuery).limit(2).lean();
      if (legacyMatches.length > 1) {
        return NextResponse.json({ error: "Specimen link is ambiguous" }, { status: 409 });
      }
      if (legacyMatches.length === 1) {
        const found = legacyMatches[0];
        sourceSpecimen = {
          id: String(found._id),
          name: found.name as string,
          species: found.species as string | undefined,
          sex: found.sex as string | undefined,
          imageUrl: found.imageUrl as string | undefined,
          notes: found.notes as string | undefined,
          attachments: Array.isArray(found.attachments) ? (found.attachments as any[]) : undefined,
          archived: found.archived as boolean | undefined,
          archivedAt: found.archivedAt as Date | string | undefined,
          archivedReason: found.archivedReason as string | undefined,
          createdAt: found.createdAt as Date | string | undefined,
        };
      }
    }

    const specimenName = sourceSpecimen?.name ?? specimen!.trim();
    const normalizedRequestedSpecies = species?.trim().toLowerCase() || "";
    let sameNameCount = 0;
    let exactIdentityCount = 0;
    let legacyWindow: LegacyWindow | undefined;
    if (sourceSpecimen) {
      const sameNameSiblings = await Specimen.find(buildSiblingSpecimenQuery(ownerObjectId, sourceSpecimen.name))
        .select({ _id: 1, createdAt: 1 })
        .sort({ createdAt: 1, _id: 1 })
        .lean();
      sameNameCount = sameNameSiblings.length;
      if (sameNameCount > 1) {
        const currentIndex = sameNameSiblings.findIndex((doc) => String(doc._id) === sourceSpecimen?.id);
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
      if (sourceSpecimen.species) {
        exactIdentityCount = await Specimen.countDocuments(
          buildExactSpecimenQuery(ownerObjectId, sourceSpecimen.name, sourceSpecimen.species)
        );
      }
    }

    const buildLegacyClauses = (field: string, dateField: string) => {
      if (!sourceSpecimen) {
        return [buildLegacyNameQuery(field, specimenName, species?.trim() || undefined)];
      }
      if (sameNameCount <= 1) {
        return [buildLegacyNameQuery(field, sourceSpecimen.name, sourceSpecimen.species)];
      }
      if (sourceSpecimen.species && exactIdentityCount === 1) {
        const clauses: Record<string, unknown>[] = [
          buildLegacyNameQuery(field, sourceSpecimen.name, sourceSpecimen.species, false),
        ];
        if (legacyWindow) {
          clauses.push(buildLegacyUnspecifiedTimedQuery(field, sourceSpecimen.name, dateField, legacyWindow));
        }
        return clauses;
      }
      if (legacyWindow) {
        return [
          buildLegacyTimedQuery(
            field,
            sourceSpecimen.name,
            dateField,
            legacyWindow,
            sourceSpecimen.species ?? (species?.trim() || undefined)
          ),
        ];
      }
      return [];
    };

    const hasUnspecifiedSpecies = (value: unknown) =>
      value === undefined || value === null || String(value).trim() === "";

    const matchesLegacyNameForSource = (participantName: unknown, rowSpecies: unknown, rowDate: unknown) => {
      if (typeof participantName !== "string") return false;

      const normalizedSourceName = sourceSpecimen?.name?.trim().toLowerCase() || specimenName.trim().toLowerCase();
      if (!normalizedSourceName || participantName.trim().toLowerCase() !== normalizedSourceName) return false;

      const normalizedRowSpecies = typeof rowSpecies === "string" ? rowSpecies.trim().toLowerCase() : "";
      const normalizedSourceSpecies = sourceSpecimen?.species?.trim().toLowerCase();
      const normalizedLegacySpecies = normalizedSourceSpecies || normalizedRequestedSpecies;

      if (sameNameCount <= 1) {
        return !normalizedLegacySpecies || !normalizedRowSpecies || normalizedRowSpecies === normalizedLegacySpecies;
      }

      if (normalizedSourceSpecies && exactIdentityCount === 1) {
        if (normalizedRowSpecies) {
          return normalizedRowSpecies === normalizedSourceSpecies;
        }
        if (!legacyWindow) return false;
        const entryDate = rowDate ? new Date(String(rowDate)) : null;
        if (!entryDate || Number.isNaN(entryDate.getTime())) return false;
        if (legacyWindow.after && entryDate < legacyWindow.after) return false;
        if (legacyWindow.before && entryDate >= legacyWindow.before) return false;
        return true;
      }

      if (normalizedLegacySpecies) {
        if (normalizedRowSpecies && normalizedRowSpecies !== normalizedLegacySpecies) {
          return false;
        }
      } else if (!hasUnspecifiedSpecies(rowSpecies)) {
        return false;
      }

      if (!legacyWindow) return false;
      const entryDate = rowDate ? new Date(String(rowDate)) : null;
      if (!entryDate || Number.isNaN(entryDate.getTime())) return false;
      if (legacyWindow.after && entryDate < legacyWindow.after) return false;
      if (legacyWindow.before && entryDate >= legacyWindow.before) return false;
      return true;
    };

    const [moltEntries, healthEntries, breedingEntries, cover] = await Promise.all([
      sourceSpecimen
        ? MoltEntry.find({
            userId: ownerObjectId,
            $or: [
              { specimenId: sourceSpecimen.id },
              ...buildLegacyClauses("specimen", "date").map((clause) =>
                combineQueryClauses(clause, excludeDetachedMoltClause())
              ),
            ],
          }).lean()
        : MoltEntry.find({
            userId: ownerObjectId,
            ...combineQueryClauses(
              buildLegacyNameQuery("specimen", specimenName, species?.trim() || undefined),
              excludeDetachedMoltClause()
            ),
          }).lean(),
      sourceSpecimen
        ? HealthEntry.find({
            userId: ownerObjectId,
            $or: [
              { specimenId: sourceSpecimen.id },
              ...buildLegacyClauses("specimen", "date").map((clause) =>
                combineQueryClauses(clause, excludeExplicitManualHealthClause(), excludeDetachedHealthClause())
              ),
            ],
          }).lean()
        : HealthEntry.find({
            userId: ownerObjectId,
            ...combineQueryClauses(
              buildLegacyNameQuery("specimen", specimenName, species?.trim() || undefined),
              excludeExplicitManualHealthClause(),
              excludeDetachedHealthClause()
            ),
          }).lean(),
      sourceSpecimen
        ? BreedingEntry.find({
            userId: ownerObjectId,
            $or: [
              { femaleSpecimenId: sourceSpecimen.id },
              { maleSpecimenId: sourceSpecimen.id },
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
          }).lean()
        : BreedingEntry.find({
            userId: ownerObjectId,
            $or: [
              combineQueryClauses(
                buildLegacyNameQuery("femaleSpecimen", specimenName, species?.trim() || undefined),
                excludeExplicitManualBreedingClause("female"),
                excludeDetachedBreedingClause("female")
              ),
              combineQueryClauses(
                buildLegacyNameQuery("maleSpecimen", specimenName, species?.trim() || undefined),
                excludeExplicitManualBreedingClause("male"),
                excludeDetachedBreedingClause("male")
              ),
            ],
          }).lean(),
      sourceSpecimen && sourceSpecimen.imageUrl !== undefined
        ? Promise.resolve(null)
        : SpecimenCover.findOne(buildLegacyCoverQuery(ownerObjectId, specimenName)).lean(),
    ]);

    if (!sourceSpecimen && moltEntries.length === 0 && healthEntries.length === 0 && breedingEntries.length === 0 && !cover) {
      return NextResponse.json({ error: "Specimen not found" }, { status: 404 });
    }

    const duplicatedSpecimenImageUrl = await duplicateAssetUrl(
      sourceSpecimen?.imageUrl,
      undefined,
      sessionUserId,
      uploadsDir,
      useS3
    );
    const duplicatedSpecimenAttachments = await duplicateAttachments(
      sourceSpecimen?.attachments,
      sessionUserId,
      uploadsDir,
      useS3
    );

    const destinationSpecimen = await Specimen.create({
      userId: sessionUserId,
      name: sourceSpecimen?.name ?? specimenName,
      species: sourceSpecimen?.species ?? (species?.trim() || undefined),
      sex: sourceSpecimen?.sex ?? "Unknown",
      imageUrl: duplicatedSpecimenImageUrl,
      notes: sourceSpecimen?.notes,
      attachments: duplicatedSpecimenAttachments,
      archived: false,
      archivedAt: undefined,
      archivedReason: undefined,
    });

    const now = new Date();
    const mappedMolt = await Promise.all(moltEntries.map(async (e) => {
      const { _id, userId, createdAt, updatedAt, specimenId: _sourceEntrySpecimenId, ...rest } = e as any;
      return {
        ...rest,
        attachments: await duplicateAttachments(rest.attachments, sessionUserId, uploadsDir, useS3),
        specimenId: destinationSpecimen?._id,
        manualSpecimen: destinationSpecimen ? false : rest.manualSpecimen,
        detachedSpecimen: destinationSpecimen ? false : rest.detachedSpecimen,
        userId: sessionUserId,
        createdAt: now,
        updatedAt: now,
      };
    }));

    const mappedHealth = await Promise.all(healthEntries.map(async (e) => {
      const { _id, userId, createdAt, updatedAt, specimenId: _sourceEntrySpecimenId, ...rest } = e as any;
      return {
        ...rest,
        attachments: await duplicateAttachments(rest.attachments, sessionUserId, uploadsDir, useS3),
        specimenId: destinationSpecimen?._id,
        manualSpecimen: destinationSpecimen ? false : rest.manualSpecimen,
        detachedSpecimen: destinationSpecimen ? false : rest.detachedSpecimen,
        userId: sessionUserId,
        createdAt: now,
        updatedAt: now,
      };
    }));

    const mappedBreeding = await Promise.all(breedingEntries.map(async (e) => {
      const {
        _id,
        userId,
        createdAt,
        updatedAt,
        femaleSpecimenId,
        maleSpecimenId,
        ...rest
      } = e as any;
      const femaleMatchesById = sourceSpecimen ? String(femaleSpecimenId) === sourceSpecimen.id : false;
      const maleMatchesById = sourceSpecimen ? String(maleSpecimenId) === sourceSpecimen.id : false;
      const femaleMatchesByName = !femaleSpecimenId && matchesLegacyNameForSource(rest.femaleSpecimen, rest.species, rest.pairingDate);
      const maleMatchesByName = !maleSpecimenId && matchesLegacyNameForSource(rest.maleSpecimen, rest.species, rest.pairingDate);

      let assignFemale = femaleMatchesById || femaleMatchesByName;
      let assignMale = maleMatchesById || maleMatchesByName;

      if (assignFemale && assignMale) {
        if (femaleMatchesById && !maleMatchesById) {
          assignMale = false;
        } else if (maleMatchesById && !femaleMatchesById) {
          assignFemale = false;
        } else if (sourceSpecimen?.sex === "Female") {
          assignMale = false;
        } else if (sourceSpecimen?.sex === "Male") {
          assignFemale = false;
        } else {
          assignFemale = false;
          assignMale = false;
        }
      }

      const nextFemaleSpecimenId = destinationSpecimen && assignFemale ? destinationSpecimen._id : undefined;
      const nextMaleSpecimenId = destinationSpecimen && assignMale ? destinationSpecimen._id : undefined;
      const hasFemaleParticipant = Boolean(rest.femaleSpecimen || femaleSpecimenId);
      const hasMaleParticipant = Boolean(rest.maleSpecimen || maleSpecimenId);

      return {
        ...rest,
        attachments: await duplicateAttachments(rest.attachments, sessionUserId, uploadsDir, useS3),
        femaleSpecimenId: nextFemaleSpecimenId,
        maleSpecimenId: nextMaleSpecimenId,
        detachedFemaleSpecimen: nextFemaleSpecimenId ? false : rest.detachedFemaleSpecimen,
        detachedMaleSpecimen: nextMaleSpecimenId ? false : rest.detachedMaleSpecimen,
        manualFemaleSpecimen: nextFemaleSpecimenId ? false : hasFemaleParticipant ? true : (rest.manualFemaleSpecimen ?? false),
        manualMaleSpecimen: nextMaleSpecimenId ? false : hasMaleParticipant ? true : (rest.manualMaleSpecimen ?? false),
        userId: sessionUserId,
        createdAt: now,
        updatedAt: now,
      };
    }));

    const createdMoltIds: Types.ObjectId[] = [];
    const createdHealthIds: Types.ObjectId[] = [];
    const createdBreedingIds: Types.ObjectId[] = [];

    try {
      for (const document of mappedMolt) {
        const created = await MoltEntry.create(document);
        createdMoltIds.push(created._id);
      }

      for (const document of mappedHealth) {
        const created = await HealthEntry.create(document);
        createdHealthIds.push(created._id);
      }

      for (const document of mappedBreeding) {
        const created = await BreedingEntry.create(document);
        createdBreedingIds.push(created._id);
      }

      if (cover) {
        const duplicatedCoverUrl = await duplicateAssetUrl(
          (cover as any).imageUrl,
          undefined,
          sessionUserId,
          uploadsDir,
          useS3
        );
        if (destinationSpecimen) {
          await Specimen.updateOne(
            { _id: destinationSpecimen._id, userId: sessionUserId },
            { $set: { imageUrl: duplicatedCoverUrl } }
          );
        } else {
          await SpecimenCover.updateOne(
            { userId: sessionUserId, key: specimenName },
            { $set: { imageUrl: duplicatedCoverUrl } },
            { upsert: true }
          );
        }
      }
    } catch (error) {
      if (createdMoltIds.length > 0) {
        await MoltEntry.deleteMany({ _id: { $in: createdMoltIds }, userId: sessionUserId }).catch(() => undefined);
      }
      if (createdHealthIds.length > 0) {
        await HealthEntry.deleteMany({ _id: { $in: createdHealthIds }, userId: sessionUserId }).catch(() => undefined);
      }
      if (createdBreedingIds.length > 0) {
        await BreedingEntry.deleteMany({ _id: { $in: createdBreedingIds }, userId: sessionUserId }).catch(() => undefined);
      }
      if (destinationSpecimen) {
        await Specimen.deleteOne({ _id: destinationSpecimen._id, userId: sessionUserId }).catch(() => undefined);
      }
      throw error;
    }

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
