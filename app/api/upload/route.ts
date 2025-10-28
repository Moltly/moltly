export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { isS3Configured, putObject, objectKeyFor } from "../../../lib/s3";

function sanitizeFilename(name: string) {
  const base = name.replace(/\\|\//g, " ").trim();
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getExt(name: string, mime?: string | null) {
  const fromName = path.extname(name || "").replace(/^\./, "");
  if (fromName) return fromName.toLowerCase();
  if (!mime) return "jpg";
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
  return map[mime] ?? "jpg";
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const files = form.getAll("file");
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const attachments: Array<{ id: string; name: string; url: string; type: string; addedAt: string }> = [];

    const useS3 = isS3Configured();
    const uploadsDir = !useS3 ? path.join(process.cwd(), "public", "uploads", session.user.id) : null;
    if (!useS3 && uploadsDir) await mkdir(uploadsDir, { recursive: true });

    for (const item of files) {
      if (!(item instanceof File)) continue;
      const isImage = (item.type || "").startsWith("image/");
      const ext = getExt(item.name, item.type || null);
      const safeName = sanitizeFilename(item.name || `upload.${ext}`);
      if (!isImage && !["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif"].includes(ext)) {
        return NextResponse.json({ error: `Unsupported file type for ${safeName}` }, { status: 415 });
      }

      const id = crypto.randomUUID();
      const filename = `${id}.${ext}`;
      const array = await item.arrayBuffer();
      const buffer = Buffer.from(array);

      let url: string;
      if (useS3) {
        const key = objectKeyFor(session.user.id, filename);
        const { url: putUrl } = await putObject({ key, body: buffer, contentType: item.type || `image/${ext}` });
        url = putUrl;
      } else if (uploadsDir) {
        const dest = path.join(uploadsDir, filename);
        await writeFile(dest, buffer);
        url = `/uploads/${session.user.id}/${filename}`;
      } else {
        throw new Error("No upload destination available");
      }

      attachments.push({ id, name: safeName, url, type: item.type || `image/${ext}` , addedAt: nowIso });
    }

    return NextResponse.json({ attachments }, { status: 201 });
  } catch (err) {
    console.error("Upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
