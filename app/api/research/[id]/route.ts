import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import { authOptions } from "../../../../lib/auth-options";
import { connectMongoose } from "../../../../lib/mongoose";
import ResearchStack from "../../../../models/ResearchStack";
import {
  normalizeStack,
  sanitizeStackUpdate,
  type StackPayload
} from "../../../../lib/research-stacks";

type RouteContext = {
  params: Promise<{ id?: string | string[] }>;
};

function assertId(raw: string | string[] | undefined) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    throw new Error("Missing stack id.");
  }
  return value;
}

function ensureObjectId(id: string) {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid stack id.");
  }
  return new Types.ObjectId(id);
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = await context.params;
    const id = assertId(params.id);
    const payload = (await request.json()) as StackPayload;
    const updates = sanitizeStackUpdate(payload);

    await connectMongoose();
    const stack = await ResearchStack.findOne({ _id: ensureObjectId(id), userId: session.user.id });

    if (!stack) {
      return NextResponse.json({ error: "Stack not found." }, { status: 404 });
    }

    if (Object.prototype.hasOwnProperty.call(updates, "name")) {
      const nextName = updates.name ?? "";
      if (nextName.trim().length === 0) {
        return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
      }
      stack.name = nextName.trim();
    }

    if (Object.prototype.hasOwnProperty.call(updates, "species")) {
      stack.species = updates.species;
    }

    if (Object.prototype.hasOwnProperty.call(updates, "category")) {
      stack.category = updates.category;
    }

    if (Object.prototype.hasOwnProperty.call(updates, "description")) {
      stack.description = updates.description;
    }

    if (Object.prototype.hasOwnProperty.call(updates, "tags")) {
      stack.tags = updates.tags ?? [];
    }

    if (Object.prototype.hasOwnProperty.call(updates, "notes")) {
      stack.notes = updates.notes ?? [];
    }

    await stack.save();
    const normalized = normalizeStack(stack.toObject());
    if (!normalized) {
      throw new Error("Unable to load stack after update.");
    }
    return NextResponse.json(normalized);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unable to update stack.";
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
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
    const result = await ResearchStack.findOneAndDelete({
      _id: ensureObjectId(id),
      userId: session.user.id
    });

    if (!result) {
      return NextResponse.json({ error: "Stack not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unable to delete stack.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
