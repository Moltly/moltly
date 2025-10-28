export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import MoltEntry from "../../../models/MoltEntry";
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
      const attachments = Array.isArray(obj.attachments) ? obj.attachments : [];
      const normalizedAtts: ExportAttachment[] = attachments.map((a: any) => ({
        id: a.id || a._id?.toString?.() || crypto.randomUUID?.() || `${doc._id}-att`,
        name: a.name,
        url: a.url,
        type: a.type,
        addedAt: typeof a.addedAt === "string" ? a.addedAt : a.addedAt?.toISOString?.() || undefined,
      }));

      const withData = embed ? await Promise.all(normalizedAtts.map(embedDataUrl)) : normalizedAtts;

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
        attachments: withData,
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
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
    research,
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
