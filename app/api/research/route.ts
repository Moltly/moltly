export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import ResearchStack from "../../../models/ResearchStack";
import { normalizeStack, sanitizeStackCreate, type StackPayload } from "../../../lib/research-stacks";
import { trySyncResearchStackToWSCA } from "../../../lib/wsca-notes-sync";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const speciesFilter = (searchParams.get("species") || "").trim();

  await connectMongoose();
  const query: any = { userId: session.user.id };
  if (speciesFilter) {
    query.species = { $regex: new RegExp(`^${speciesFilter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
  }
  const stacks = await ResearchStack.find(query).sort({ updatedAt: -1 });
  const normalized = stacks
    .map((stack) => normalizeStack(stack.toObject()))
    .filter((stack): stack is NonNullable<typeof stack> => Boolean(stack));
  return NextResponse.json(normalized);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as StackPayload;
    const sanitized = sanitizeStackCreate(payload);
    await connectMongoose();
    const stack = await ResearchStack.create({
      userId: session.user.id,
      ...sanitized
    });

    const normalized = normalizeStack(stack.toObject());
    if (!normalized) {
      throw new Error("Unable to load research stack.");
    }

    trySyncResearchStackToWSCA(session.user.id, stack).catch(() => undefined);

    return NextResponse.json(normalized, { status: 201 });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unable to create research stack.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
