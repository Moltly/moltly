export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import MoltEntry from "../../../models/MoltEntry";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongoose();
  const documents = await MoltEntry.find({ userId: session.user.id }).sort({ date: -1 });

  const normalized = documents.map((document) => {
    const entry = document.toObject();
    return {
      ...entry,
      id: document._id.toString(),
      userId: document.userId.toString()
    };
  });

  return NextResponse.json(normalized);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const {
      specimen,
      species,
      date,
      stage,
      oldSize,
      newSize,
      humidity,
      temperature,
      notes,
      reminderDate,
      attachments = []
    } = payload;

    if (!specimen || !date) {
      return NextResponse.json({ error: "Specimen and date are required." }, { status: 400 });
    }

    await connectMongoose();
    const entry = await MoltEntry.create({
      userId: session.user.id,
      specimen,
      species,
      date,
      stage,
      oldSize,
      newSize,
      humidity,
      temperature,
      notes,
      reminderDate,
      attachments
    });

    return NextResponse.json(
      {
        ...entry.toObject(),
        id: entry._id.toString(),
        userId: entry.userId.toString()
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create entry." }, { status: 500 });
  }
}
