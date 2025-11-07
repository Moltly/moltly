export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { connectMongoose } from "@/lib/mongoose";
import SpeciesSuggestion from "@/models/SpeciesSuggestion";
import { ensureSpeciesSuggestion } from "@/lib/species-utils";
import { requireAdminSession } from "@/lib/admin";

export async function GET(request: Request) {
  const { ok } = await requireAdminSession();
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") || "pending").toLowerCase();
  const allowed = new Set(["pending", "approved", "rejected", "removed"]);
  const statusQuery = allowed.has(status) ? status : "pending";

  await connectMongoose();
  const docs = await SpeciesSuggestion.find({ status: statusQuery })
    .sort({ submittedAt: -1 })
    .lean();

  const items = docs.map((d) => ({
    id: String(d._id),
    fullName: d.fullName,
    genus: d.genus,
    species: d.species,
    subspecies: d.subspecies,
    family: d.family,
    status: d.status,
    submittedAt: d.submittedAt,
    submittedBy: d.submittedBy ?? null,
    reviewedAt: d.reviewedAt ?? null,
    reviewedBy: d.reviewedBy ?? null,
    reason: d.reason ?? null,
  }));

  return NextResponse.json({ suggestions: items });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const fullName = (payload?.fullName || "").trim();
    if (!fullName) {
      return NextResponse.json({ error: "fullName is required" }, { status: 400 });
    }

    await ensureSpeciesSuggestion(fullName, session.user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
