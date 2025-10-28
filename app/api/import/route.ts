export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import MoltEntry from "../../../models/MoltEntry";
import ResearchStack from "../../../models/ResearchStack";
import { sanitizeStackCreate, type StackPayload } from "../../../lib/research-stacks";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import crypto from "crypto";
import { isS3Configured, putObject, objectKeyFor } from "../../../lib/s3";

type IncomingAttachment = {
  id?: string;
  name?: string;
  url?: string;
  type?: string;
  addedAt?: string;
  dataUrl?: string;
};

type IncomingEntry = {
  entryType?: string;
  specimen?: string;
  species?: string;
  date?: string;
  stage?: string;
  oldSize?: number;
  newSize?: number;
  humidity?: number;
  temperature?: number;
  notes?: string;
  reminderDate?: string | null;
  feedingPrey?: string;
  feedingOutcome?: string;
  feedingAmount?: string;
  attachments?: IncomingAttachment[];
};

type ImportPayload = {
  entries?: IncomingEntry[];
  research?: StackPayload[];
};

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

  await connectMongoose();

  const userId = session.user.id;
  const useS3 = isS3Configured();
  const uploadsDir = !useS3 ? path.join(process.cwd(), "public", "uploads", userId) : null;
  if (!useS3 && uploadsDir) await mkdir(uploadsDir, { recursive: true });

  let createdEntries = 0;
  let createdStacks = 0;

  // Import entries
  if (Array.isArray(payload.entries)) {
    for (const raw of payload.entries) {
      try {
        if (!raw?.date) continue;
        const entryType = ((): "molt" | "feeding" | "water" => {
          const t = (raw.entryType || "molt").toLowerCase();
          return t === "feeding" ? "feeding" : t === "water" ? "water" : "molt";
        })();

        const attachments: any[] = [];
        if (Array.isArray(raw.attachments)) {
          for (const a of raw.attachments) {
            try {
              let buffer: Buffer | null = null;
              let mime: string | undefined = a.type;
              if (a.dataUrl) {
                const parsed = parseDataUrl(a.dataUrl);
                if (parsed) {
                  buffer = parsed.buffer;
                  mime = mime || parsed.mime;
                }
              } else if (a.url) {
                try {
                  const res = await fetch(a.url);
                  if (res.ok) {
                    const arr = await res.arrayBuffer();
                    buffer = Buffer.from(arr);
                    mime = mime || res.headers.get("content-type") || undefined;
                  }
                } catch {}
              }

              let url = a.url || "";
              const filenameBase = (a.name && a.name.replace(/\\|\//g, " ").replace(/[^a-zA-Z0-9._-]/g, "_")) || "attachment";
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
                id: a.id || crypto.randomUUID(),
                name: a.name || filenameBase,
                url,
                type: mime || a.type || `image/${ext}`,
                addedAt: a.addedAt || new Date().toISOString(),
              });
            } catch {}
          }
        }

        const entry = await MoltEntry.create({
          userId,
          specimen: raw.specimen?.trim() || undefined,
          species: raw.species?.trim() || undefined,
          date: raw.date,
          entryType,
          stage: entryType === "molt" ? (raw.stage || "Molt") : undefined,
          oldSize: typeof raw.oldSize === "number" ? raw.oldSize : undefined,
          newSize: typeof raw.newSize === "number" ? raw.newSize : undefined,
          humidity: typeof raw.humidity === "number" ? raw.humidity : undefined,
          temperature: typeof raw.temperature === "number" ? raw.temperature : undefined,
          notes: raw.notes?.trim() || undefined,
          reminderDate: raw.reminderDate || undefined,
          feedingPrey: entryType === "feeding" ? raw.feedingPrey?.trim() || undefined : undefined,
          feedingOutcome: entryType === "feeding" ? raw.feedingOutcome : undefined,
          feedingAmount: entryType === "feeding" ? raw.feedingAmount?.trim() || undefined : undefined,
          attachments,
        });
        if (entry) createdEntries += 1;
      } catch (err) {
        // Continue on individual entry failures
        // eslint-disable-next-line no-console
        console.warn("Entry import failed", err);
      }
    }
  }

  // Import research stacks
  if (Array.isArray(payload.research)) {
    for (const raw of payload.research) {
      try {
        const sanitized = sanitizeStackCreate(raw);
        const created = await ResearchStack.create({ userId, ...sanitized });
        if (created) createdStacks += 1;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Stack import failed", err);
      }
    }
  }

  return NextResponse.json({ success: true, createdEntries, createdStacks });
}

