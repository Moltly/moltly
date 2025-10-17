import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import { authOptions } from "../../../../lib/auth-options";
import { connectMongoose } from "../../../../lib/mongoose";
import MoltEntry from "../../../../models/MoltEntry";

type RouteContext = {
  params: Promise<{ id?: string | string[] }>;
};

function ensureObjectId(id: string) {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid entry id.");
  }
  return new Types.ObjectId(id);
}

function assertId(raw: string | string[] | undefined) {
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) {
    throw new Error("Missing entry id.");
  }
  return id;
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = await context.params;
    const id = assertId(params.id);
    const updates = await request.json();
    await connectMongoose();
    const entry = await MoltEntry.findOneAndUpdate(
      { _id: ensureObjectId(id), userId: session.user.id },
      updates,
      { new: true }
    );

    if (!entry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    return NextResponse.json({
      ...entry.toObject(),
      id: entry._id.toString(),
      userId: entry.userId.toString()
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update entry." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = await context.params;
    const id = assertId(params.id);
    await connectMongoose();
    const result = await MoltEntry.findOneAndDelete({
      _id: ensureObjectId(id),
      userId: session.user.id
    });

    if (!result) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to delete entry." }, { status: 500 });
  }
}
