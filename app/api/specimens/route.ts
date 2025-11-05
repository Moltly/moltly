export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { connectMongoose } from "@/lib/mongoose";
import SpecimenCover from "@/models/SpecimenCover";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectMongoose();
  const docs = await SpecimenCover.find({ userId: session.user.id }).sort({ key: 1 });
  const covers = docs.map((d) => ({ key: d.key as string, imageUrl: d.imageUrl as string }));
  return NextResponse.json(covers);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { key, imageUrl } = await request.json();
    if (typeof key !== "string" || key.length === 0) {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 });
    }

    await connectMongoose();
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
  } catch (err) {
    console.error("Failed to set specimen cover", err);
    return NextResponse.json({ error: "Failed to set specimen cover" }, { status: 500 });
  }
}

