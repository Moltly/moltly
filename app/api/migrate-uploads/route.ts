export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import MoltEntry from "../../../models/MoltEntry";
import { isS3Configured, putObject, objectKeyFor } from "../../../lib/s3";
import { readFile, unlink } from "fs/promises";
import path from "path";

function guessContentTypeByExt(ext: string) {
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
  return map[ext.toLowerCase()] || "application/octet-stream";
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isS3Configured()) {
    return NextResponse.json({ error: "S3 is not configured" }, { status: 400 });
  }

  await connectMongoose();
  const entries = await MoltEntry.find({ userId: session.user.id });

  let migratedFiles = 0;
  let updatedEntries = 0;
  let errors: Array<{ id: string; error: string }> = [];

  for (const doc of entries) {
    const entry = doc.toObject();
    const atts = Array.isArray(entry.attachments) ? entry.attachments : [];
    let changed = false;

    for (const att of atts) {
      const url: string = att?.url || "";
      if (!url.startsWith("/uploads/")) continue; // only migrate local filesystem references
      const filePath = path.join(process.cwd(), "public", url);
      const filename = path.basename(filePath);
      const ext = (filename.split(".").pop() || "jpg").toLowerCase();
      try {
        const body = await readFile(filePath);
        const key = objectKeyFor(session.user.id, filename);
        const { url: s3url } = await putObject({ key, body, contentType: guessContentTypeByExt(ext) });
        att.url = s3url; // mutate attachment in-place
        changed = true;
        try { await unlink(filePath); } catch {}
        migratedFiles += 1;
      } catch (err: any) {
        errors.push({ id: doc._id.toString(), error: String(err?.message || err) });
      }
    }

    if (changed) {
      doc.attachments = atts as any;
      await doc.save();
      updatedEntries += 1;
    }
  }

  return NextResponse.json({ migratedFiles, updatedEntries, errors });
}

