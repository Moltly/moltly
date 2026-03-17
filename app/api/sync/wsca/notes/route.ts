export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import getMongoClientPromise from "../../../../../lib/mongodb";
import { connectMongoose } from "../../../../../lib/mongoose";
import ResearchStack from "../../../../../models/ResearchStack";
import { normalizeStack } from "../../../../../lib/research-stacks";

type WscaNoteEntry = {
  id?: string | number;
  entry_type?: string;
  content?: string;
  url?: string;
  created_at?: string;
  updated_at?: string;
  individual_label?: string;
  tags?: unknown;
  source_message_id?: string | number;
  source_channel_id?: string | number;
  source_guild_id?: string | number;
  author_id?: string | number;
  external_source?: string;
  external_id?: string | number;
};

type WscaNotePayload = {
  id?: string | number;
  title?: string;
  description?: string;
  is_public?: boolean;
  alias?: string;
  save_count?: number;
  created_at?: string;
  updated_at?: string;
  external_source?: string;
  external_id?: string | number;
  entries?: WscaNoteEntry[];
};

type InboundBody = {
  discord_user_id?: string | number;
  note?: WscaNotePayload;
};

function readHeader(headers: Headers, name: string): string | undefined {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
}

function toStringId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (value && typeof value === "object" && "toString" in value) {
    try {
      const str = (value as { toString: () => string }).toString();
      return str && str.trim().length > 0 ? str.trim() : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function toDate(value: string | number | Date | undefined | null): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

function mapEntries(entries: WscaNoteEntry[] | undefined) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      const id = toStringId(entry.id) ?? toStringId(entry.external_id);
      const createdAt = toDate(entry.created_at);
      const updatedAt = entry.updated_at ? toDate(entry.updated_at) : createdAt;
      const entryType =
        typeof entry.entry_type === "string" && entry.entry_type.trim().length > 0
          ? entry.entry_type.trim()
          : undefined;
      const titleBase = entryType ?? "Note entry";
      const dateSuffix = createdAt ? createdAt.toISOString().slice(0, 10) : undefined;
      const title = `${titleBase}${dateSuffix ? ` (${dateSuffix})` : ""}`;
      const tags =
        Array.isArray(entry.tags)
          ? entry.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
          : [];

      return {
        id: id ?? randomUUID(),
        title,
        content: typeof entry.content === "string" ? entry.content : "",
        tags,
        individualLabel:
          typeof entry.individual_label === "string" && entry.individual_label.trim().length > 0
            ? entry.individual_label.trim()
            : undefined,
        entryType,
        url: typeof entry.url === "string" && entry.url.trim().length > 0 ? entry.url.trim() : undefined,
        sourceMessageId: toStringId(entry.source_message_id),
        sourceChannelId: toStringId(entry.source_channel_id),
        sourceGuildId: toStringId(entry.source_guild_id),
        authorId: toStringId(entry.author_id),
        externalSource:
          typeof entry.external_source === "string" && entry.external_source.trim().length > 0
            ? entry.external_source.trim()
            : "wsca",
        externalId: id,
        createdAt,
        updatedAt
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

async function resolveUserFromDiscord(discordIdRaw: string | number | undefined) {
  const discordId = typeof discordIdRaw === "number" ? String(discordIdRaw) : (discordIdRaw || "").trim();
  if (!discordId) return null;
  const client = await getMongoClientPromise();
  const db = client.db();
  const account = await db
    .collection("accounts")
    .findOne({ provider: "discord", providerAccountId: discordId });
  if (!account?.userId) return null;
  const userId =
    typeof account.userId === "string" ? account.userId : account.userId?.toString();
  if (!userId) return null;
  return {
    userId,
    userObjectId: (() => {
      try {
        return new Types.ObjectId(userId);
      } catch {
        return new Types.ObjectId(account.userId);
      }
    })()
  };
}

export async function POST(req: Request) {
  try {
    const secret = process.env.WSCA_SYNC_SECRET;
    if (!secret) return NextResponse.json({ error: "Sync not configured." }, { status: 501 });
    const provided = readHeader(req.headers, "X-Sync-Secret");
    if (!provided || provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as InboundBody;
    const identity = await resolveUserFromDiscord(body.discord_user_id);
    if (!identity) {
      return NextResponse.json({ error: "No linked user for Discord account." }, { status: 404 });
    }

    const note = body.note;
    if (!note || typeof note !== "object") {
      return NextResponse.json({ error: "Missing note payload." }, { status: 400 });
    }
    const noteId = toStringId(note.external_id) ?? toStringId(note.id);
    const title = typeof note.title === "string" && note.title.trim().length > 0 ? note.title.trim() : null;
    if (!noteId || !title) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const description =
      typeof note.description === "string" && note.description.trim().length > 0 ? note.description.trim() : undefined;
    const alias = typeof note.alias === "string" && note.alias.trim().length > 0 ? note.alias.trim() : undefined;
    const isPublic = typeof note.is_public === "boolean" ? note.is_public : undefined;
    const saveCount =
      typeof note.save_count === "number" && Number.isFinite(note.save_count) ? note.save_count : undefined;
    const externalSource =
      typeof note.external_source === "string" && note.external_source.trim().length > 0
        ? note.external_source.trim()
        : "wsca";

    const createdAt = note.created_at ? toDate(note.created_at) : undefined;
    const updatedAt = note.updated_at ? toDate(note.updated_at) : undefined;

    await connectMongoose();

    const stack = await ResearchStack.findOne({
      userId: identity.userObjectId,
      externalSource,
      externalId: noteId
    });

    const notes = mapEntries(note.entries);

    if (!stack) {
      const created = await ResearchStack.create({
        userId: identity.userObjectId,
        name: title,
        description,
        tags: [],
        externalSource,
        externalId: noteId,
        isPublic,
        alias,
        saveCount,
        notes,
        ...(createdAt ? { createdAt } : {}),
        ...(updatedAt ? { updatedAt } : {})
      });

      const normalized = normalizeStack(created.toObject());
      return NextResponse.json({ status: "created", stack: normalized }, { status: 201 });
    }

    stack.name = title;
    stack.description = description;
    stack.externalSource = externalSource;
    stack.externalId = noteId;
    stack.isPublic = isPublic;
    stack.alias = alias;
    if (saveCount !== undefined) {
      stack.saveCount = saveCount;
    }
    stack.notes = notes;
    if (createdAt && !stack.createdAt) {
      stack.createdAt = createdAt;
    }
    if (updatedAt) {
      stack.updatedAt = updatedAt;
    }
    stack.markModified("notes");
    await stack.save();

    const normalized = normalizeStack(stack.toObject());
    return NextResponse.json({ status: "updated", stack: normalized }, { status: 200 });
  } catch (error) {
    console.error("/api/sync/wsca/notes POST error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const secret = process.env.WSCA_SYNC_SECRET;
    if (!secret) return NextResponse.json({ error: "Sync not configured." }, { status: 501 });
    const provided = readHeader(req.headers, "X-Sync-Secret");
    if (!provided || provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { discord_user_id?: string | number; note_id?: string | number };
    const identity = await resolveUserFromDiscord(body.discord_user_id);
    if (!identity) {
      return NextResponse.json({ error: "No linked user for Discord account." }, { status: 404 });
    }

    const noteId = toStringId(body.note_id);
    if (!noteId) {
      return NextResponse.json({ error: "Missing note id." }, { status: 400 });
    }

    await connectMongoose();
    const result = await ResearchStack.findOneAndDelete({
      userId: identity.userObjectId,
      externalSource: { $in: ["wsca", "wsca-note"] },
      externalId: noteId
    });

    if (!result) {
      return NextResponse.json({ error: "Stack not found." }, { status: 404 });
    }

    return NextResponse.json({ status: "deleted" }, { status: 200 });
  } catch (error) {
    console.error("/api/sync/wsca/notes DELETE error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
