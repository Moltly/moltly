export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import MoltEntry from "../../../models/MoltEntry";
import HealthEntry from "../../../models/HealthEntry";
import BreedingEntry from "../../../models/BreedingEntry";
import ResearchStack from "../../../models/ResearchStack";
import Specimen from "../../../models/Specimen";
import SpecimenCover from "../../../models/SpecimenCover";
import { sanitizeStackCreate, type StackPayload } from "../../../lib/research-stacks";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import crypto from "crypto";
import { isS3Configured, putObject, objectKeyFor } from "../../../lib/s3";
import { ImportPayloadSchema, type ImportPayload } from "@/lib/schemas/import";
import type { AttachmentWithDataInput } from "@/lib/schemas/attachments";
import { Types } from "mongoose";

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  try {
    const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return null;
    const mime = m[1];
    const buffer = Buffer.from(m[2], "base64");
    return { mime, buffer };
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
  return (
    value === "localhost" ||
    value === "127.0.0.1" ||
    value === "::1" ||
    value.endsWith(".localhost")
  );
}

function isIpHostname(hostname: string): boolean {
  return /^[0-9.]+$/.test(hostname) || hostname.includes(":");
}

function resolveAllowedImageUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const hostname = url.hostname.toLowerCase();
    if (!hostname || isLocalHostname(hostname) || isIpHostname(hostname)) {
      return null;
    }

    if (ALLOWED_IMAGE_HOSTS.length === 0) {
      return url;
    }

    const isAllowedHost = ALLOWED_IMAGE_HOSTS.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
    );
    return isAllowedHost ? url : null;
  } catch {
    return null;
  }
}

async function normalizeAttachments(
  raw: AttachmentWithDataInput[] | undefined,
  userId: string,
  uploadsDir: string | null,
  useS3: boolean
): Promise<any[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }

  const attachments: any[] = [];
  for (const a of raw) {
    try {
      let buffer: Buffer | null = null;
      let mime: string | undefined = a.type;
      if (a?.dataUrl) {
        const parsed = parseDataUrl(a.dataUrl);
        if (parsed) {
          buffer = parsed.buffer;
          mime = mime || parsed.mime;
        }
      } else if (a?.url) {
        const remote = resolveAllowedImageUrl(a.url);
        if (remote) {
          try {
            const res = await fetch(remote.toString());
            if (res.ok) {
              const arr = await res.arrayBuffer();
              buffer = Buffer.from(arr);
              mime = mime || res.headers.get("content-type") || undefined;
            }
          } catch {}
        }
      }

      let url = a?.url || "";
      const filenameBase =
        (a?.name && a.name.replace(/\\|\//g, " ").replace(/[^a-zA-Z0-9._-]/g, "_")) || "attachment";
      const ext = extFromMime(mime);
      const filename = `${crypto.randomUUID()}.${ext}`;

      if (buffer) {
        if (useS3) {
          const key = objectKeyFor(userId, filename);
          const { url: putUrl } = await putObject({ key, body: buffer, contentType: mime || `image/${ext}` });
          url = putUrl;
        } else if (uploadsDir) {
          const dest = path.join(uploadsDir, filename);
          await writeFile(dest, buffer);
          url = `/uploads/${userId}/${filename}`;
        }
      }

      attachments.push({
        id: a?.id || crypto.randomUUID(),
        name: a?.name || filenameBase,
        url,
        type: mime || a?.type || `image/${ext}`,
        addedAt: a?.addedAt || new Date().toISOString(),
      });
    } catch {}
  }

  return attachments;
}

async function normalizeImageUrl(
  raw: string | undefined,
  userId: string,
  uploadsDir: string | null,
  useS3: boolean,
  requestUrl: string
): Promise<string | undefined> {
  if (raw === "") return "";
  if (!raw) return undefined;

  try {
    let buffer: Buffer | null = null;
    let mime: string | undefined;

    if (raw.startsWith("data:")) {
      const parsed = parseDataUrl(raw);
      if (parsed) {
        buffer = parsed.buffer;
        mime = parsed.mime;
      }
    } else {
      let resolvedUrl: URL | null = null;
      if (raw.startsWith("/")) {
        try {
          resolvedUrl = new URL(raw, requestUrl);
        } catch {
          resolvedUrl = null;
        }
      } else {
        resolvedUrl = resolveAllowedImageUrl(raw);
      }

      if (resolvedUrl) {
        try {
          const res = await fetch(resolvedUrl.toString());
          if (res.ok) {
            const arr = await res.arrayBuffer();
            buffer = Buffer.from(arr);
            mime = res.headers.get("content-type") || undefined;
          }
        } catch {}
      }
    }

    if (!buffer) {
      return raw.trim();
    }

    const ext = extFromMime(mime);
    const filename = `${crypto.randomUUID()}.${ext}`;
    if (useS3) {
      const key = objectKeyFor(userId, filename);
      const { url } = await putObject({ key, body: buffer, contentType: mime || `image/${ext}` });
      return url;
    }
    if (uploadsDir) {
      const dest = path.join(uploadsDir, filename);
      await writeFile(dest, buffer);
      return `/uploads/${userId}/${filename}`;
    }
  } catch {}

  return undefined;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ImportPayload;
  try {
    payload = (await request.json()) as ImportPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ImportPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid import payload.",
        details: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const { entries, health, breeding, research, specimens, specimenCovers } = parsed.data;

  await connectMongoose();

  const userId = session.user.id;
  const useS3 = isS3Configured();
  const uploadsDir = !useS3 ? path.join(process.cwd(), "public", "uploads", userId) : null;
  if (!useS3 && uploadsDir) await mkdir(uploadsDir, { recursive: true });

  let createdEntries = 0;
  let createdHealth = 0;
  let createdBreeding = 0;
  let createdStacks = 0;
  let createdSpecimens = 0;
  const specimenIdMap = new Map<string, string>();
  const specimenIdsByNameSpecies = new Map<string, string[]>();
  const specimenIdsByName = new Map<string, string[]>();

  const normalizeIdentityPart = (value?: string | null) => (value ?? "").trim().toLowerCase();
  const addIdentityCandidate = (map: Map<string, string[]>, key: string, specimenId: string) => {
    const next = map.get(key) ?? [];
    next.push(specimenId);
    map.set(key, next);
  };
  const resolveImportedSpecimenId = (importedId?: string, specimenName?: string, specimenSpecies?: string) => {
    if (importedId) {
      const mapped = specimenIdMap.get(importedId);
      if (mapped) return mapped;
    }

    const normalizedName = normalizeIdentityPart(specimenName);
    if (!normalizedName) return undefined;

    const speciesKey = `${normalizedName}::${normalizeIdentityPart(specimenSpecies)}`;
    const exactMatches = specimenIdsByNameSpecies.get(speciesKey) ?? [];
    if (exactMatches.length === 1) return exactMatches[0];

    const nameMatches = specimenIdsByName.get(normalizedName) ?? [];
    return nameMatches.length === 1 ? nameMatches[0] : undefined;
  };

  for (const raw of specimens) {
    try {
      const { attachments: rawAttachments, id: importedId, archivedAt, imageUrl, createdAt, updatedAt, ...rest } = raw;
      const attachments = await normalizeAttachments(rawAttachments, userId, uploadsDir, useS3);
      const normalizedImageUrl = await normalizeImageUrl(imageUrl, userId, uploadsDir, useS3, request.url);
      const now = new Date();
      const created = await Specimen.collection.insertOne({
        userId: new Types.ObjectId(userId),
        ...rest,
        imageUrl: normalizedImageUrl,
        attachments,
        archivedAt: archivedAt ? new Date(archivedAt) : undefined,
        createdAt: createdAt ? new Date(createdAt) : now,
        updatedAt: updatedAt ? new Date(updatedAt) : now,
      });
      if (created) {
        createdSpecimens += 1;
        const createdId = created.insertedId.toString();
        addIdentityCandidate(
          specimenIdsByNameSpecies,
          `${normalizeIdentityPart(rest.name)}::${normalizeIdentityPart(rest.species)}`,
          createdId
        );
        addIdentityCandidate(specimenIdsByName, normalizeIdentityPart(rest.name), createdId);
        if (importedId) {
          specimenIdMap.set(importedId, createdId);
        }
      }
    } catch (err) {
      console.warn("Specimen import failed", err);
    }
  }

  for (const [key, rawImageUrl] of Object.entries(specimenCovers)) {
    try {
      const normalizedKey = key.trim();
      const normalizedImageUrl = await normalizeImageUrl(rawImageUrl, userId, uploadsDir, useS3, request.url);
      if (!normalizedKey || !normalizedImageUrl) {
        continue;
      }
      await SpecimenCover.findOneAndUpdate(
        { userId, key: normalizedKey },
        { $set: { userId, key: normalizedKey, imageUrl: normalizedImageUrl } },
        { upsert: true }
      );
    } catch (err) {
      console.warn("Specimen cover import failed", err);
    }
  }

  // Import entries
  for (const raw of entries) {
    try {
      const { attachments: rawAttachments, specimenId, detachedSpecimen, ...rest } = raw;
      const attachments = await normalizeAttachments(rawAttachments, userId, uploadsDir, useS3);
      const entry = await MoltEntry.create({
        userId,
        ...rest,
        detachedSpecimen,
        specimenId: detachedSpecimen === true ? undefined : resolveImportedSpecimenId(specimenId, rest.specimen, rest.species),
        attachments
      });
      if (entry) createdEntries += 1;
    } catch (err) {
      // Continue on individual entry failures
      console.warn("Entry import failed", err);
    }
  }

  // Import health entries
  for (const raw of health) {
    try {
      const { attachments: rawAttachments, specimenId, manualSpecimen, detachedSpecimen, ...rest } = raw;
      const attachments = await normalizeAttachments(rawAttachments, userId, uploadsDir, useS3);
      const preserveManualSpecimen = detachedSpecimen === true ? true : manualSpecimen;
      const entry = await HealthEntry.create({
        userId,
        ...rest,
        manualSpecimen: preserveManualSpecimen,
        detachedSpecimen,
        specimenId:
          preserveManualSpecimen === true ? undefined : resolveImportedSpecimenId(specimenId, rest.specimen, rest.species),
        attachments
      });
      if (entry) createdHealth += 1;
    } catch (err) {
      console.warn("Health entry import failed", err);
    }
  }

  // Import breeding entries
  for (const raw of breeding) {
    try {
      const {
        attachments: rawAttachments,
        femaleSpecimenId,
        maleSpecimenId,
        manualFemaleSpecimen,
        detachedFemaleSpecimen,
        manualMaleSpecimen,
        detachedMaleSpecimen,
        ...rest
      } = raw;
      const attachments = await normalizeAttachments(rawAttachments, userId, uploadsDir, useS3);
      const preserveManualFemaleSpecimen = detachedFemaleSpecimen === true ? true : manualFemaleSpecimen;
      const preserveManualMaleSpecimen = detachedMaleSpecimen === true ? true : manualMaleSpecimen;
      const resolvedFemaleSpecimenId = preserveManualFemaleSpecimen === true
        ? undefined
        : resolveImportedSpecimenId(femaleSpecimenId, rest.femaleSpecimen, rest.species);
      const resolvedMaleSpecimenId = preserveManualMaleSpecimen === true
        ? undefined
        : resolveImportedSpecimenId(maleSpecimenId, rest.maleSpecimen, rest.species);
      const duplicateResolvedParticipant =
        resolvedFemaleSpecimenId &&
        resolvedMaleSpecimenId &&
        resolvedFemaleSpecimenId === resolvedMaleSpecimenId;
      const entry = await BreedingEntry.create({
        userId,
        ...rest,
        manualFemaleSpecimen: duplicateResolvedParticipant ? true : preserveManualFemaleSpecimen,
        detachedFemaleSpecimen: duplicateResolvedParticipant ? false : detachedFemaleSpecimen,
        femaleSpecimenId: duplicateResolvedParticipant ? undefined : resolvedFemaleSpecimenId,
        manualMaleSpecimen: duplicateResolvedParticipant ? true : preserveManualMaleSpecimen,
        detachedMaleSpecimen: duplicateResolvedParticipant ? false : detachedMaleSpecimen,
        maleSpecimenId: duplicateResolvedParticipant ? undefined : resolvedMaleSpecimenId,
        attachments
      });
      if (entry) createdBreeding += 1;
    } catch (err) {
      console.warn("Breeding entry import failed", err);
    }
  }

  // Import research stacks
  for (const raw of research) {
    try {
      const sanitized = sanitizeStackCreate(raw as StackPayload);
      const created = await ResearchStack.create({ userId, ...sanitized });
      if (created) createdStacks += 1;
    } catch (err) {
      console.warn("Stack import failed", err);
    }
  }

  return NextResponse.json({ success: true, createdEntries, createdHealth, createdBreeding, createdStacks, createdSpecimens });
}
