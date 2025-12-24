export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { connectMongoose } from "@/lib/mongoose";
import Specimen from "@/models/Specimen";
import SpecimenCover from "@/models/SpecimenCover";
import { z } from "zod";
import { runSpecimenMigration } from "@/lib/specimen-migration";

const SpecimenCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  species: z.string().trim().max(160).optional(),
  imageUrl: z.string().optional(),
  notes: z.string().max(2000).optional()
});

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectMongoose();

  // Run migration on first request (idempotent, runs once per app lifecycle)
  runSpecimenMigration().catch(() => { });

  // Check if archived specimens should be included
  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("includeArchived") === "true";

  // Get specimens from new Specimen collection
  const query: Record<string, unknown> = { userId: session.user.id };
  if (!includeArchived) {
    query.archived = { $ne: true };
  }
  const specimens = await Specimen.find(query).sort({ name: 1 });

  // Also get legacy covers for backward compatibility
  const coverDocs = await SpecimenCover.find({ userId: session.user.id });
  const legacyCovers = coverDocs.reduce((acc, d) => {
    acc[d.key as string] = d.imageUrl as string;
    return acc;
  }, {} as Record<string, string>);

  const result = specimens.map((s) => ({
    id: s._id.toString(),
    name: s.name,
    species: s.species,
    imageUrl: s.imageUrl ?? legacyCovers[s.name] ?? undefined,
    notes: s.notes,
    archived: s.archived ?? false,
    archivedAt: s.archivedAt?.toISOString(),
    archivedReason: s.archivedReason,
    createdAt: s.createdAt?.toISOString(),
    updatedAt: s.updatedAt?.toISOString()
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Handle legacy cover API format for backward compatibility
    if (body.key && typeof body.key === "string") {
      await connectMongoose();
      const key = body.key;
      const imageUrl = body.imageUrl;

      if (!imageUrl) {
        await SpecimenCover.deleteOne({ userId: session.user.id, key });
        return NextResponse.json({ ok: true });
      }
      await SpecimenCover.updateOne(
        { userId: session.user.id, key },
        { $set: { imageUrl } },
        { upsert: true }
      );
      return NextResponse.json({ ok: true });
    }

    // New specimen creation
    const parsed = SpecimenCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await connectMongoose();
    const specimen = await Specimen.create({
      userId: session.user.id,
      name: parsed.data.name,
      species: parsed.data.species,
      imageUrl: parsed.data.imageUrl,
      notes: parsed.data.notes
    });

    return NextResponse.json(
      {
        id: specimen._id.toString(),
        name: specimen.name,
        species: specimen.species,
        imageUrl: specimen.imageUrl,
        notes: specimen.notes,
        createdAt: specimen.createdAt?.toISOString(),
        updatedAt: specimen.updatedAt?.toISOString()
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Failed to create specimen", err);
    return NextResponse.json({ error: "Failed to create specimen" }, { status: 500 });
  }
}
