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
import { normalizeStack } from "../../../lib/research-stacks";
import path from "path";
import { readFile } from "fs/promises";
import crypto from "crypto";

type ExportAttachment = {
  id: string;
  name: string;
  url: string;
  type?: string;
  addedAt?: string | Date;
  dataUrl?: string;
};

function guessMimeFromName(name: string): string | undefined {
  const ext = name.split(".").pop()?.toLowerCase();
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

    const isAllowedHost = ALLOWED_IMAGE_HOSTS.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
    );
    return isAllowedHost ? url : null;
  } catch {
    return null;
  }
}

async function embedDataUrl(att: ExportAttachment): Promise<ExportAttachment> {
  try {
    if (!att?.url) return att;
    if (att.url.startsWith("/uploads/")) {
      const filePath = path.join(process.cwd(), "public", att.url);
      const buf = await readFile(filePath);
      const mime = att.type || guessMimeFromName(att.name) || "application/octet-stream";
      const base64 = buf.toString("base64");
      return { ...att, dataUrl: `data:${mime};base64,${base64}` };
    }
    const remote = resolveAllowedImageUrl(att.url);
    if (!remote) return att;
    const res = await fetch(remote.toString());
    if (!res.ok) return att;
    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    const mime = att.type || res.headers.get("content-type") || guessMimeFromName(att.name) || "application/octet-stream";
    const base64 = buf.toString("base64");
    return { ...att, dataUrl: `data:${mime};base64,${base64}` };
  } catch {
    return att;
  }
}

function buildExportImageAttachment(url: string, contextId: string): ExportAttachment {
  const normalizedUrl = url.trim();
  const fallbackName = `${contextId}-cover.jpg`;

  try {
    const pathname = normalizedUrl.startsWith("/")
      ? normalizedUrl
      : new URL(normalizedUrl).pathname;
    const basename = path.basename(pathname);
    const hasExtension = basename.includes(".") && basename.split(".").pop()?.trim();
    return {
      id: `${contextId}-cover`,
      name: hasExtension ? basename : fallbackName,
      url: normalizedUrl,
      type: guessMimeFromName(basename) || undefined,
    };
  } catch {
    const basename = path.basename(normalizedUrl);
    const hasExtension = basename.includes(".") && basename.split(".").pop()?.trim();
    return {
      id: `${contextId}-cover`,
      name: hasExtension ? basename : fallbackName,
      url: normalizedUrl,
      type: guessMimeFromName(basename) || undefined,
    };
  }
}

async function normalizeImageForExport(url: string | undefined, embed: boolean, contextId: string): Promise<string | undefined> {
  if (url === "") return "";
  if (!url) return undefined;
  if (!embed) return url;
  const embedded = await embedDataUrl(buildExportImageAttachment(url, contextId));
  return embedded.dataUrl || embedded.url;
}

function inferLegacySpecimenSpecies(
  specimenName: string,
  entries: Array<{ specimen?: string; species?: string }>,
  health: Array<{ specimen?: string; species?: string }>,
  breeding: Array<{ femaleSpecimen?: string; maleSpecimen?: string; species?: string }>
): string | undefined {
  const normalizedName = specimenName.trim().toLowerCase();
  const species = new Set<string>();

  const collectSpecies = (candidateName: string | undefined, candidateSpecies: string | undefined) => {
    if (!candidateName || !candidateSpecies) return;
    if (candidateName.trim().toLowerCase() !== normalizedName) return;
    const normalizedSpecies = candidateSpecies.trim();
    if (normalizedSpecies) species.add(normalizedSpecies);
  };

  entries.forEach((entry) => collectSpecies(entry.specimen, entry.species));
  health.forEach((entry) => collectSpecies(entry.specimen, entry.species));
  breeding.forEach((entry) => {
    collectSpecies(entry.femaleSpecimen, entry.species);
    collectSpecies(entry.maleSpecimen, entry.species);
  });

  return species.size === 1 ? Array.from(species)[0] : undefined;
}

async function normalizeAttachmentsForExport(
  raw: any[],
  embed: boolean,
  contextId: string
): Promise<ExportAttachment[]> {
  const normalized: ExportAttachment[] = (Array.isArray(raw) ? raw : []).map((a: any, index: number) => ({
    id: a?.id || a?._id?.toString?.() || crypto.randomUUID?.() || `${contextId}-att-${index}`,
    name: a?.name,
    url: a?.url,
    type: a?.type,
    addedAt: typeof a?.addedAt === "string" ? a?.addedAt : a?.addedAt?.toISOString?.() || undefined,
  }));

  return embed ? Promise.all(normalized.map((att) => embedDataUrl(att))) : normalized;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const embed = /^(1|true)$/i.test(url.searchParams.get("embed") || "1");

  await connectMongoose();

  const entriesDocs = await MoltEntry.find({ userId: session.user.id }).sort({ date: -1 });
  const entries = await Promise.all(
    entriesDocs.map(async (doc) => {
      const obj = doc.toObject();
      const entryType = obj.entryType === "feeding" ? "feeding" : obj.entryType === "molt" ? "molt" : "water";
      const attachments = await normalizeAttachmentsForExport(obj.attachments, embed, doc._id.toString());

      return {
        id: doc._id.toString(),
        detachedSpecimen: typeof obj.detachedSpecimen === "boolean" ? obj.detachedSpecimen : undefined,
        specimenId: obj.specimenId?.toString?.() ?? undefined,
        entryType,
        specimen: obj.specimen ?? undefined,
        species: obj.species ?? undefined,
        date: (obj.date instanceof Date ? obj.date : new Date(obj.date)).toISOString(),
        stage: entryType === "molt" ? obj.stage : undefined,
        oldSize: typeof obj.oldSize === "number" ? obj.oldSize : undefined,
        newSize: typeof obj.newSize === "number" ? obj.newSize : undefined,
        humidity: typeof obj.humidity === "number" ? obj.humidity : undefined,
        temperature: typeof obj.temperature === "number" ? obj.temperature : undefined,
        temperatureUnit: obj.temperatureUnit === "F" ? "F" : obj.temperatureUnit === "C" ? "C" : undefined,
        notes: typeof obj.notes === "string" ? obj.notes : undefined,
        reminderDate: obj.reminderDate ? new Date(obj.reminderDate).toISOString() : undefined,
        feedingPrey: obj.feedingPrey ?? undefined,
        feedingOutcome: obj.feedingOutcome ?? undefined,
        feedingAmount: obj.feedingAmount ?? undefined,
        attachments,
        createdAt: obj.createdAt ? new Date(obj.createdAt).toISOString() : undefined,
        updatedAt: obj.updatedAt ? new Date(obj.updatedAt).toISOString() : undefined,
      };
    })
  );

  const healthDocs = await HealthEntry.find({ userId: session.user.id }).sort({ date: -1 });
  const health = await Promise.all(
    healthDocs.map(async (doc) => {
      const obj = doc.toObject();
      const attachments = await normalizeAttachmentsForExport(obj.attachments, embed, `health-${doc._id.toString()}`);
      return {
        id: doc._id.toString(),
        manualSpecimen: typeof obj.manualSpecimen === "boolean" ? obj.manualSpecimen : undefined,
        detachedSpecimen: typeof obj.detachedSpecimen === "boolean" ? obj.detachedSpecimen : undefined,
        specimenId: obj.specimenId?.toString?.() ?? undefined,
        specimen: obj.specimen ?? undefined,
        species: obj.species ?? undefined,
        date: (obj.date instanceof Date ? obj.date : new Date(obj.date)).toISOString(),
        weight: typeof obj.weight === "number" ? obj.weight : undefined,
        weightUnit: obj.weightUnit === "oz" ? "oz" : "g",
        temperature: typeof obj.temperature === "number" ? obj.temperature : undefined,
        temperatureUnit: obj.temperatureUnit === "F" ? "F" : obj.temperatureUnit === "C" ? "C" : undefined,
        humidity: typeof obj.humidity === "number" ? obj.humidity : undefined,
        condition: obj.condition ?? "Stable",
        behavior: obj.behavior ?? undefined,
        healthIssues: obj.healthIssues ?? undefined,
        treatment: obj.treatment ?? undefined,
        followUpDate: obj.followUpDate ? new Date(obj.followUpDate).toISOString() : undefined,
        notes: obj.notes ?? undefined,
        attachments,
        createdAt: obj.createdAt ? new Date(obj.createdAt).toISOString() : undefined,
        updatedAt: obj.updatedAt ? new Date(obj.updatedAt).toISOString() : undefined,
      };
    })
  );

  const breedingDocs = await BreedingEntry.find({ userId: session.user.id }).sort({ pairingDate: -1 });
  const breeding = await Promise.all(
    breedingDocs.map(async (doc) => {
      const obj = doc.toObject();
      const attachments = await normalizeAttachmentsForExport(obj.attachments, embed, `breeding-${doc._id.toString()}`);
      return {
        id: doc._id.toString(),
        manualFemaleSpecimen:
          typeof obj.manualFemaleSpecimen === "boolean" ? obj.manualFemaleSpecimen : undefined,
        detachedFemaleSpecimen:
          typeof obj.detachedFemaleSpecimen === "boolean" ? obj.detachedFemaleSpecimen : undefined,
        femaleSpecimenId: obj.femaleSpecimenId?.toString?.() ?? undefined,
        femaleSpecimen: obj.femaleSpecimen ?? undefined,
        manualMaleSpecimen: typeof obj.manualMaleSpecimen === "boolean" ? obj.manualMaleSpecimen : undefined,
        detachedMaleSpecimen:
          typeof obj.detachedMaleSpecimen === "boolean" ? obj.detachedMaleSpecimen : undefined,
        maleSpecimenId: obj.maleSpecimenId?.toString?.() ?? undefined,
        maleSpecimen: obj.maleSpecimen ?? undefined,
        species: obj.species ?? undefined,
        pairingDate: (obj.pairingDate instanceof Date ? obj.pairingDate : new Date(obj.pairingDate)).toISOString(),
        status: obj.status ?? "Planned",
        pairingNotes: obj.pairingNotes ?? undefined,
        eggSacDate: obj.eggSacDate ? new Date(obj.eggSacDate).toISOString() : undefined,
        eggSacStatus: obj.eggSacStatus ?? "Not Laid",
        eggSacCount: typeof obj.eggSacCount === "number" ? obj.eggSacCount : undefined,
        hatchDate: obj.hatchDate ? new Date(obj.hatchDate).toISOString() : undefined,
        slingCount: typeof obj.slingCount === "number" ? obj.slingCount : undefined,
        followUpDate: obj.followUpDate ? new Date(obj.followUpDate).toISOString() : undefined,
        notes: obj.notes ?? undefined,
        attachments,
        createdAt: obj.createdAt ? new Date(obj.createdAt).toISOString() : undefined,
        updatedAt: obj.updatedAt ? new Date(obj.updatedAt).toISOString() : undefined,
      };
    })
  );

  const stacksDocs = await ResearchStack.find({ userId: session.user.id }).sort({ updatedAt: -1 });
  const research = stacksDocs
    .map((d) => normalizeStack(d.toObject()))
    .filter((s): s is NonNullable<ReturnType<typeof normalizeStack>> => Boolean(s));

  const coverDocs = await SpecimenCover.find({ userId: session.user.id }).lean();
  const legacyCovers = coverDocs.reduce((acc, doc) => {
    acc[String(doc.key).trim().toLowerCase()] = String(doc.imageUrl);
    return acc;
  }, {} as Record<string, string>);

  const specimenDocs = await Specimen.find({ userId: session.user.id }).sort({ name: 1 });
  const specimensFromRecords = await Promise.all(
    specimenDocs.map(async (doc) => {
      const obj = doc.toObject();
      const attachments = await normalizeAttachmentsForExport(obj.attachments, embed, `specimen-${doc._id.toString()}`);
      const coverUrl = obj.imageUrl ?? legacyCovers[obj.name.trim().toLowerCase()] ?? undefined;
      const imageUrl = await normalizeImageForExport(coverUrl, embed, `specimen-${doc._id.toString()}`);
      return {
        id: doc._id.toString(),
        name: obj.name,
        species: obj.species ?? undefined,
        sex: obj.sex ?? undefined,
        imageUrl,
        notes: obj.notes ?? undefined,
        attachments,
        archived: obj.archived ?? false,
        archivedAt: obj.archivedAt ? new Date(obj.archivedAt).toISOString() : undefined,
        archivedReason: obj.archivedReason ?? undefined,
        createdAt: obj.createdAt ? new Date(obj.createdAt).toISOString() : undefined,
        updatedAt: obj.updatedAt ? new Date(obj.updatedAt).toISOString() : undefined,
      };
    })
  );

  const specimenNames = new Set(specimenDocs.map((doc) => doc.name.trim().toLowerCase()));
  const legacyOnlySpecimens = await Promise.all(
    coverDocs
      .filter((doc) => {
        const key = String(doc.key ?? "").trim().toLowerCase();
        return key.length > 0 && !specimenNames.has(key);
      })
      .map(async (doc) => ({
        id: `legacy-cover-${String(doc._id)}`,
        name: String(doc.key),
        species: inferLegacySpecimenSpecies(String(doc.key), entries, health, breeding),
        sex: undefined,
        imageUrl: await normalizeImageForExport(String(doc.imageUrl), embed, `legacy-cover-${String(doc._id)}`),
        notes: undefined,
        attachments: [],
        archived: false,
        archivedAt: undefined,
        archivedReason: undefined,
        createdAt: doc.createdAt ? new Date(doc.createdAt as Date).toISOString() : undefined,
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt as Date).toISOString() : undefined,
      }))
  );

  const specimens = [...specimensFromRecords, ...legacyOnlySpecimens].sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    version: 3,
    exportedAt: new Date().toISOString(),
    entries,
    research,
    health,
    breeding,
    specimens,
  };

  const body = JSON.stringify(payload);
  const res = new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="moltly-export-${new Date().toISOString().slice(0,10)}.json"`,
      "cache-control": "no-store",
    },
  });
  return res;
}
