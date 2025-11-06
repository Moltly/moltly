export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import MoltEntry from "../../../models/MoltEntry";
import HealthEntry from "../../../models/HealthEntry";
import BreedingEntry from "../../../models/BreedingEntry";
import ResearchStack from "../../../models/ResearchStack";
import { sanitizeStackCreate, type StackPayload } from "../../../lib/research-stacks";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import crypto from "crypto";
import { isS3Configured, putObject, objectKeyFor } from "../../../lib/s3";
import { ImportPayloadSchema, type ImportPayload } from "@/lib/schemas/import";
import type { AttachmentWithDataInput } from "@/lib/schemas/attachments";

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

const isRemoteUrl = (value: string) => /^https?:\/\//i.test(value);

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
      } else if (a?.url && isRemoteUrl(a.url)) {
        try {
          const res = await fetch(a.url);
          if (res.ok) {
            const arr = await res.arrayBuffer();
            buffer = Buffer.from(arr);
            mime = mime || res.headers.get("content-type") || undefined;
          }
        } catch {}
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

  const { entries, health, breeding, research } = parsed.data;

  await connectMongoose();

  const userId = session.user.id;
  const useS3 = isS3Configured();
  const uploadsDir = !useS3 ? path.join(process.cwd(), "public", "uploads", userId) : null;
  if (!useS3 && uploadsDir) await mkdir(uploadsDir, { recursive: true });

  let createdEntries = 0;
  let createdHealth = 0;
  let createdBreeding = 0;
  let createdStacks = 0;

  // Import entries
  for (const raw of entries) {
    try {
      const { attachments: rawAttachments, ...rest } = raw;
      const attachments = await normalizeAttachments(rawAttachments, userId, uploadsDir, useS3);
      const entry = await MoltEntry.create({
        userId,
        ...rest,
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
      const { attachments: rawAttachments, ...rest } = raw;
      const attachments = await normalizeAttachments(rawAttachments, userId, uploadsDir, useS3);
      const entry = await HealthEntry.create({
        userId,
        ...rest,
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
      const { attachments: rawAttachments, ...rest } = raw;
      const attachments = await normalizeAttachments(rawAttachments, userId, uploadsDir, useS3);
      const entry = await BreedingEntry.create({
        userId,
        ...rest,
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

  return NextResponse.json({ success: true, createdEntries, createdHealth, createdBreeding, createdStacks });
}
