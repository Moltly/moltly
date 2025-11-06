export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const limitParam = searchParams.get("limit");
  const limit = Math.max(1, Math.min(50, limitParam ? parseInt(limitParam, 10) || 10 : 10));

  if (!q) {
    return NextResponse.json({ suggestions: [] });
  }

  const client = await getMongoClientPromise();
  const db = client.db();
  const col = db.collection("species");

  const regex = new RegExp("^" + escapeRegExp(q));

  const docs = await col
    .find({ fullNameLC: { $regex: regex } })
    .project({
      _id: 0,
      fullName: 1,
      genus: 1,
      species: 1,
      subspecies: 1,
      family: 1,
      speciesId: 1,
      species_lsid: 1,
    })
    .limit(limit)
    .toArray();

  return NextResponse.json({ suggestions: docs });
}

