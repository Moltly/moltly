import { ObjectId } from "mongodb";
import getMongoClientPromise from "./mongodb";

type MaybeDate = string | number | Date | undefined | null;

const NOTE_SYNC_URL = process.env.WSCA_NOTE_SYNC_URL || process.env.WSCA_NOTES_SYNC_URL || "";
const SYNC_SECRET = process.env.WSCA_SYNC_SECRET || "";

type StackLike = {
  [key: string]: any;
};

function toPlainObject<T extends StackLike>(input: T): Record<string, any> {
  if (!input) return {};
  if (typeof input.toObject === "function") {
    try {
      return input.toObject({ depopulate: true });
    } catch {
      // Fall through
    }
  }
  if (typeof input === "object") {
    return { ...input };
  }
  return {};
}

function toIsoString(value: MaybeDate, fallback?: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return fallback ?? new Date().toISOString();
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

async function findDiscordAccountId(userId: string) {
  const client = await getMongoClientPromise();
  const db = client.db();
  const accounts = db.collection("accounts");
  const asObjectId = (() => {
    try {
      return new ObjectId(userId);
    } catch {
      return null;
    }
  })();

  const account =
    (asObjectId && (await accounts.findOne({ provider: "discord", userId: asObjectId }))) ||
    (await accounts.findOne({ provider: "discord", userId })) ||
    null;

  const discordId = account?.providerAccountId;
  return discordId ? String(discordId) : undefined;
}

function buildWscaNotePayload(stackInput: StackLike) {
  const stack = toPlainObject(stackInput);

  const entries = Array.isArray(stack.notes)
    ? stack.notes
        .map((note: any) => {
          const noteObj = toPlainObject(note);
          const createdIso = toIsoString(noteObj.createdAt);
          const updatedIso = toIsoString(noteObj.updatedAt, createdIso);
          const entry: Record<string, any> = {
            id: toStringId(noteObj.externalId) ?? toStringId(noteObj.id) ?? toStringId(noteObj._id),
            title: typeof noteObj.title === "string" ? noteObj.title : undefined,
            content: typeof noteObj.content === "string" ? noteObj.content : undefined,
            entry_type:
              typeof noteObj.entryType === "string" && noteObj.entryType.trim().length > 0
                ? noteObj.entryType.trim()
                : "text",
            url: typeof noteObj.url === "string" && noteObj.url.trim().length > 0 ? noteObj.url.trim() : undefined,
            source_message_id: toStringId(noteObj.sourceMessageId),
            source_channel_id: toStringId(noteObj.sourceChannelId),
            source_guild_id: toStringId(noteObj.sourceGuildId),
            author_id: toStringId(noteObj.authorId),
            created_at: createdIso,
            updated_at: updatedIso
          };

          if (noteObj.individualLabel) {
            entry.individual_label = String(noteObj.individualLabel);
          }

          if (Array.isArray(noteObj.tags) && noteObj.tags.length > 0) {
            entry.tags = noteObj.tags.filter((tag: any) => typeof tag === "string" && tag.trim().length > 0);
          }

          entry.external_source =
            typeof noteObj.externalSource === "string" && noteObj.externalSource.trim().length > 0
              ? noteObj.externalSource.trim()
              : undefined;

          entry.external_id = toStringId(noteObj.externalId);
          return entry;
        })
        .filter((entry: Record<string, any>) => Boolean(entry.id || entry.content || entry.url))
    : [];

  // Keep most recent entries first by created_at descending
  entries.sort((a: any, b: any) => {
    const aTime = new Date(a.created_at ?? 0).getTime();
    const bTime = new Date(b.created_at ?? 0).getTime();
    return bTime - aTime;
  });

  const updatedIso = toIsoString(stack.updatedAt);
  const createdIso = toIsoString(stack.createdAt, updatedIso);

  const notePayload: Record<string, any> = {
    id: toStringId(stack.externalId) ?? toStringId(stack.id) ?? toStringId(stack._id),
    title: typeof stack.name === "string" ? stack.name : "Untitled",
    description:
      typeof stack.description === "string" && stack.description.trim().length > 0
        ? stack.description.trim()
        : undefined,
    is_public: typeof stack.isPublic === "boolean" ? stack.isPublic : undefined,
    alias: typeof stack.alias === "string" && stack.alias.trim().length > 0 ? stack.alias.trim() : undefined,
    save_count:
      typeof stack.saveCount === "number" && Number.isFinite(stack.saveCount)
        ? stack.saveCount
        : entries.length || undefined,
    updated_at: updatedIso,
    created_at: createdIso,
    entries
  };

  notePayload.external_source =
    typeof stack.externalSource === "string" && stack.externalSource.trim().length > 0
      ? stack.externalSource.trim()
      : "moltly";
  notePayload.external_id = toStringId(stack.externalId) ?? toStringId(stack.id) ?? toStringId(stack._id);

  return notePayload;
}

async function sendToWsca(
  discordUserId: string,
  payload: Record<string, any>,
  options?: { method?: string; noteIdForDelete?: string }
) {
  if (!NOTE_SYNC_URL || !SYNC_SECRET) return;

  const method = options?.method ?? "POST";
  const body =
    method.toUpperCase() === "DELETE"
      ? JSON.stringify({
          discord_user_id: discordUserId,
          note_id: options?.noteIdForDelete ?? payload?.note?.id ?? payload?.id
        })
      : JSON.stringify({
          discord_user_id: discordUserId,
          note: payload
        });

  await fetch(NOTE_SYNC_URL, {
    method,
    headers: {
      "content-type": "application/json",
      "X-Sync-Secret": SYNC_SECRET
    },
    body
  }).catch(() => undefined);
}

export async function trySyncResearchStackToWSCA(userId: string, stackInput: StackLike) {
  try {
    if (!NOTE_SYNC_URL || !SYNC_SECRET) return;
    const discordId = await findDiscordAccountId(userId);
    if (!discordId) return;
    const notePayload = buildWscaNotePayload(stackInput);
    if (!notePayload?.id) return;
    await sendToWsca(discordId, notePayload);
  } catch {
    // best-effort synchronization
  }
}

export async function tryDeleteResearchStackOnWSCA(
  userId: string,
  stackInput: StackLike,
  options?: { noteIdOverride?: string }
) {
  try {
    if (!NOTE_SYNC_URL || !SYNC_SECRET) return;
    const discordId = await findDiscordAccountId(userId);
    if (!discordId) return;
    const notePayload = buildWscaNotePayload(stackInput);
    const noteId = options?.noteIdOverride ?? notePayload?.id;
    if (!noteId) return;
    await sendToWsca(
      discordId,
      notePayload,
      {
        method: "DELETE",
        noteIdForDelete: noteId
      }
    );
  } catch {
    // best-effort
  }
}
