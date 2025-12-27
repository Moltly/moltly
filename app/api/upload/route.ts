export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { isS3Configured, putObject, objectKeyFor } from "../../../lib/s3";
import { UploadedImageSchema } from "@/lib/schemas/upload";

/**
 * Strip EXIF and other metadata from an image buffer for privacy.
 * Returns the processed buffer. Falls back to original if processing fails.
 */
async function stripExifData(buffer: Buffer, ext: string): Promise<Buffer> {
  // GIFs need special handling - sharp doesn't support animated GIFs well
  // For now, we'll skip EXIF stripping on GIFs (they rarely have sensitive EXIF anyway)
  if (ext === "gif") {
    return buffer;
  }

  try {
    // Use sharp to re-encode the image without metadata
    // The .rotate() call auto-orients based on EXIF before stripping
    let pipeline = sharp(buffer).rotate();

    // Re-encode in the original format
    switch (ext) {
      case "png":
        pipeline = pipeline.png();
        break;
      case "webp":
        pipeline = pipeline.webp({ quality: 90 });
        break;
      case "avif":
        pipeline = pipeline.avif({ quality: 80 });
        break;
      case "heic":
      case "heif":
        // Sharp outputs HEIF as AVIF, keep as JPEG for compatibility
        pipeline = pipeline.jpeg({ quality: 90 });
        break;
      default:
        // Default to JPEG for jpg and unknown formats
        pipeline = pipeline.jpeg({ quality: 90 });
    }

    return await pipeline.toBuffer();
  } catch (error) {
    console.warn("Failed to strip EXIF data, using original:", error);
    return buffer;
  }
}

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
      const metaResult = UploadedImageSchema.safeParse({
        name: item.name,
        type: item.type,
        size: item.size
      });
      if (!metaResult.success) {
        const message = metaResult.error.issues[0]?.message ?? "Invalid upload.";
        return NextResponse.json({ error: message }, { status: 400 });
      }

      const meta = metaResult.data;
      const ext = getExt(meta.name ?? "", meta.type ?? null);
      const safeName = sanitizeFilename(meta.name ?? `upload.${ext}`);

      const id = crypto.randomUUID();
      const filename = `${id}.${ext}`;
      const array = await item.arrayBuffer();
      const rawBuffer = Buffer.from(array);

      // Strip EXIF data for privacy (removes GPS, camera info, timestamps, etc.)
      const buffer = await stripExifData(rawBuffer, ext);

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

      attachments.push({ id, name: safeName, url, type: meta.type ?? `image/${ext}`, addedAt: nowIso });
    }

    return NextResponse.json({ attachments }, { status: 201 });
  } catch (err) {
    console.error("Upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
