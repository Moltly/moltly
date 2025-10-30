export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import MoltEntry from "../../../models/MoltEntry";
import HealthEntry from "../../../models/HealthEntry";
import BreedingEntry from "../../../models/BreedingEntry";
import ResearchStack from "../../../models/ResearchStack";
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
    // Remote/public URL – fetch
    const res = await fetch(att.url);
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
        entryType,
        specimen: obj.specimen ?? undefined,
        species: obj.species ?? undefined,
        date: (obj.date instanceof Date ? obj.date : new Date(obj.date)).toISOString(),
        stage: entryType === "molt" ? obj.stage : undefined,
        oldSize: typeof obj.oldSize === "number" ? obj.oldSize : undefined,
        newSize: typeof obj.newSize === "number" ? obj.newSize : undefined,
        humidity: typeof obj.humidity === "number" ? obj.humidity : undefined,
        temperature: typeof obj.temperature === "number" ? obj.temperature : undefined,
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
        specimen: obj.specimen ?? undefined,
        species: obj.species ?? undefined,
        date: (obj.date instanceof Date ? obj.date : new Date(obj.date)).toISOString(),
        weight: typeof obj.weight === "number" ? obj.weight : undefined,
        weightUnit: obj.weightUnit === "oz" ? "oz" : "g",
        temperature: typeof obj.temperature === "number" ? obj.temperature : undefined,
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
        femaleSpecimen: obj.femaleSpecimen ?? undefined,
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

  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    entries,
    research,
    health,
    breeding,
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
