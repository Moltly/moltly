export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = (searchParams.get("family") || "").trim();
    if (!raw) return NextResponse.json({ items: [] });
    const limitParam = searchParams.get("limit");
    const limit = Math.max(1, Math.min(200, limitParam ? parseInt(limitParam, 10) || 100 : 100));

    const client = await getMongoClientPromise();
    const db = client.db();
    const col = db.collection("species");
    const regex = new RegExp(`^${escapeRegExp(raw)}$`, "i");
    const docs = await col
      .find({ family: { $regex: regex } })
      .project({ _id: 0, fullName: 1, genus: 1, species: 1, subspecies: 1, family: 1, speciesId: 1, species_lsid: 1 })
      .limit(limit)
      .toArray();
    return NextResponse.json({ items: docs });
  } catch (error) {
    console.error("/api/species/by-family error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

