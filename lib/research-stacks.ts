import { randomUUID } from "crypto";

export type StackPayload = {
  name?: string;
  species?: string;
  category?: string;
  description?: string;
  tags?: unknown;
  notes?: unknown;
  externalSource?: unknown;
  externalId?: unknown;
  isPublic?: unknown;
  alias?: unknown;
  saveCount?: unknown;
  isEncryptedStack?: unknown;
};

type SanitizedResearchNote = {
  id: string;
  title: string;
  individualLabel?: string;
  content: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  externalSource?: string;
  externalId?: string;
  entryType?: string;
  url?: string;
  sourceMessageId?: string;
  sourceChannelId?: string;
  sourceGuildId?: string;
  authorId?: string;
  // E2E encryption fields
  isEncrypted?: boolean;
  encryptionSalt?: string;
  encryptionIV?: string;
};

type SanitizedStackCreate = {
  name: string;
  species?: string;
  category?: string;
  description?: string;
  tags: string[];
  notes: SanitizedResearchNote[];
  externalSource?: string;
  externalId?: string;
  isPublic?: boolean;
  alias?: string;
  saveCount?: number;
  isEncryptedStack?: boolean;
};

type SanitizedStackUpdate = Partial<Omit<SanitizedStackCreate, "notes">> & {
  notes?: SanitizedResearchNote[];
};

type NormalizedResearchNote = {
  id: string;
  title: string;
  individualLabel?: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  externalSource?: string;
  externalId?: string;
  entryType?: string;
  url?: string;
  sourceMessageId?: string;
  sourceChannelId?: string;
  sourceGuildId?: string;
  authorId?: string;
  // E2E encryption fields
  isEncrypted?: boolean;
  encryptionSalt?: string;
  encryptionIV?: string;
};

type NormalizedResearchStack = {
  id: string;
  name: string;
  species?: string;
  category?: string;
  description?: string;
  tags: string[];
  notes: NormalizedResearchNote[];
  createdAt: string;
  updatedAt: string;
  externalSource?: string;
  externalId?: string;
  isPublic?: boolean;
  alias?: string;
  saveCount?: number;
  isEncryptedStack?: boolean;
};

function normalizeDate(value: unknown, fallback: string) {
  if (typeof value === "string" && value.length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return fallback;
}

function ensureStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function ensureDate(value: unknown, fallback: Date) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return fallback;
}

function sanitizeNote(note: unknown): SanitizedResearchNote | null {
  if (!note || typeof note !== "object") {
    return null;
  }

  const record = note as Record<string, unknown>;
  const now = new Date();

  const id =
    typeof record.id === "string" && record.id.trim().length > 0 ? record.id.trim() : randomUUID();

  const title =
    typeof record.title === "string" && record.title.trim().length > 0
      ? record.title.trim()
      : "Untitled note";

  const individualLabel =
    typeof record.individualLabel === "string" && record.individualLabel.trim().length > 0
      ? record.individualLabel.trim()
      : undefined;

  const content = typeof record.content === "string" ? record.content : "";
  const tags = ensureStringArray(record.tags);
  const createdAt = ensureDate(record.createdAt, now);
  const updatedAt = ensureDate(record.updatedAt, createdAt);
  const externalSource =
    typeof record.externalSource === "string" && record.externalSource.trim().length > 0
      ? record.externalSource.trim()
      : undefined;
  const externalId =
    typeof record.externalId === "string" && record.externalId.trim().length > 0
      ? record.externalId.trim()
      : undefined;
  const entryType =
    typeof record.entryType === "string" && record.entryType.trim().length > 0
      ? record.entryType.trim()
      : undefined;
  const url =
    typeof record.url === "string" && record.url.trim().length > 0 ? record.url.trim() : undefined;

  const toStringId = (value: unknown) => {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  };

  const sourceMessageId = toStringId(record.sourceMessageId);
  const sourceChannelId = toStringId(record.sourceChannelId);
  const sourceGuildId = toStringId(record.sourceGuildId);
  const authorId = toStringId(record.authorId);

  return {
    id,
    title,
    individualLabel,
    content,
    tags,
    createdAt,
    updatedAt,
    ...(externalSource ? { externalSource } : {}),
    ...(externalId ? { externalId } : {}),
    ...(entryType ? { entryType } : {}),
    ...(url ? { url } : {}),
    ...(sourceMessageId ? { sourceMessageId } : {}),
    ...(sourceChannelId ? { sourceChannelId } : {}),
    ...(sourceGuildId ? { sourceGuildId } : {}),
    ...(authorId ? { authorId } : {}),
    // E2E encryption fields
    ...(record.isEncrypted === true ? { isEncrypted: true } : {}),
    ...(typeof record.encryptionSalt === "string" && record.encryptionSalt.length > 0 ? { encryptionSalt: record.encryptionSalt } : {}),
    ...(typeof record.encryptionIV === "string" && record.encryptionIV.length > 0 ? { encryptionIV: record.encryptionIV } : {})
  };
}

export function sanitizeStackCreate(payload: StackPayload): SanitizedStackCreate {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (name.length === 0) {
    throw new Error("Name is required.");
  }

  const notes = Array.isArray(payload.notes)
    ? (payload.notes.map(sanitizeNote).filter((note): note is SanitizedResearchNote => Boolean(note)))
    : [];

  return {
    name,
    species:
      typeof payload.species === "string" && payload.species.trim().length > 0
        ? payload.species.trim()
        : undefined,
    category:
      typeof payload.category === "string" && payload.category.trim().length > 0
        ? payload.category.trim()
        : undefined,
    description:
      typeof payload.description === "string" && payload.description.trim().length > 0
        ? payload.description.trim()
        : undefined,
    tags: ensureStringArray(payload.tags),
    notes,
    ...(typeof payload.externalSource === "string" && payload.externalSource.trim().length > 0
      ? { externalSource: payload.externalSource.trim() }
      : {}),
    ...(typeof payload.externalId === "string" && payload.externalId.trim().length > 0
      ? { externalId: payload.externalId.trim() }
      : {}),
    ...(typeof payload.isPublic === "boolean" ? { isPublic: payload.isPublic } : {}),
    ...(typeof payload.alias === "string" && payload.alias.trim().length > 0
      ? { alias: payload.alias.trim() }
      : {}),
    ...(typeof payload.saveCount === "number" && Number.isFinite(payload.saveCount)
      ? { saveCount: payload.saveCount }
      : {}),
    ...(typeof payload.isEncryptedStack === "boolean" ? { isEncryptedStack: payload.isEncryptedStack } : {})
  };
}

export function sanitizeStackUpdate(payload: StackPayload): SanitizedStackUpdate {
  const update: SanitizedStackUpdate = {};

  if (typeof payload.name === "string") {
    update.name = payload.name.trim();
  }

  if (typeof payload.species === "string") {
    const trimmed = payload.species.trim();
    update.species = trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof payload.category === "string") {
    const trimmed = payload.category.trim();
    update.category = trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof payload.description === "string") {
    const trimmed = payload.description.trim();
    update.description = trimmed.length > 0 ? trimmed : undefined;
  }

  if (payload.tags !== undefined) {
    update.tags = ensureStringArray(payload.tags);
  }

  if (payload.notes !== undefined) {
    update.notes = Array.isArray(payload.notes)
      ? payload.notes.map(sanitizeNote).filter((note): note is SanitizedResearchNote => Boolean(note))
      : [];
  }

  if (typeof payload.externalSource === "string") {
    const trimmed = payload.externalSource.trim();
    update.externalSource = trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof payload.externalId === "string") {
    const trimmed = payload.externalId.trim();
    update.externalId = trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof payload.isPublic === "boolean") {
    update.isPublic = payload.isPublic;
  }

  if (typeof payload.alias === "string") {
    const trimmed = payload.alias.trim();
    update.alias = trimmed.length > 0 ? trimmed : undefined;
  }

  if (payload.saveCount !== undefined) {
    const num =
      typeof payload.saveCount === "number" && Number.isFinite(payload.saveCount)
        ? payload.saveCount
        : Number.parseInt(String(payload.saveCount), 10);
    if (!Number.isNaN(num)) {
      update.saveCount = num;
    }
  }

  if (typeof payload.isEncryptedStack === "boolean") {
    update.isEncryptedStack = payload.isEncryptedStack;
  }

  return update;
}

export function normalizeStack(document: unknown): NormalizedResearchStack | null {
  if (!document || typeof document !== "object") {
    return null;
  }

  const record = document as Record<string, unknown>;
  const identifier =
    typeof record.id === "string"
      ? record.id
      : record._id && typeof record._id === "object" && "toString" in record._id
        ? (record._id as { toString: () => string }).toString()
        : null;

  if (!identifier) {
    return null;
  }

  const createdAt = normalizeDate(record.createdAt, new Date().toISOString());
  const updatedAt = normalizeDate(record.updatedAt, createdAt);

  const notes = Array.isArray(record.notes)
    ? record.notes
      .map((note, index) => {
        if (!note || typeof note !== "object") {
          return null;
        }
        const noteRecord = note as Record<string, unknown>;
        const noteId =
          typeof noteRecord.id === "string" && noteRecord.id.length > 0
            ? noteRecord.id
            : `${identifier}-note-${index}`;
        const title =
          typeof noteRecord.title === "string" && noteRecord.title.trim().length > 0
            ? noteRecord.title.trim()
            : "Untitled note";
        const individualLabel =
          typeof noteRecord.individualLabel === "string" && noteRecord.individualLabel.trim().length > 0
            ? noteRecord.individualLabel.trim()
            : undefined;
        const content = typeof noteRecord.content === "string" ? noteRecord.content : "";
        const tags = ensureStringArray(noteRecord.tags);
        const noteCreatedAt = normalizeDate(noteRecord.createdAt, createdAt);
        const noteUpdatedAt = normalizeDate(noteRecord.updatedAt, noteCreatedAt);

        const normalizedNote: NormalizedResearchNote = {
          id: noteId,
          title,
          content,
          tags,
          createdAt: noteCreatedAt,
          updatedAt: noteUpdatedAt,
          ...(individualLabel ? { individualLabel } : {})
        };
        const externalSource =
          typeof noteRecord.externalSource === "string" && noteRecord.externalSource.trim().length > 0
            ? noteRecord.externalSource.trim()
            : undefined;
        const externalId =
          typeof noteRecord.externalId === "string" && noteRecord.externalId.trim().length > 0
            ? noteRecord.externalId.trim()
            : undefined;
        const entryType =
          typeof noteRecord.entryType === "string" && noteRecord.entryType.trim().length > 0
            ? noteRecord.entryType.trim()
            : undefined;
        const url =
          typeof noteRecord.url === "string" && noteRecord.url.trim().length > 0
            ? noteRecord.url.trim()
            : undefined;

        const toStringId = (value: unknown) => {
          if (typeof value === "string" && value.trim().length > 0) {
            return value.trim();
          }
          if (typeof value === "number" && Number.isFinite(value)) {
            return String(value);
          }
          return undefined;
        };

        const sourceMessageId = toStringId(noteRecord.sourceMessageId);
        const sourceChannelId = toStringId(noteRecord.sourceChannelId);
        const sourceGuildId = toStringId(noteRecord.sourceGuildId);
        const authorId = toStringId(noteRecord.authorId);

        if (externalSource) normalizedNote.externalSource = externalSource;
        if (externalId) normalizedNote.externalId = externalId;
        if (entryType) normalizedNote.entryType = entryType;
        if (url) normalizedNote.url = url;
        if (sourceMessageId) normalizedNote.sourceMessageId = sourceMessageId;
        if (sourceChannelId) normalizedNote.sourceChannelId = sourceChannelId;
        if (sourceGuildId) normalizedNote.sourceGuildId = sourceGuildId;
        if (authorId) normalizedNote.authorId = authorId;

        // E2E encryption fields
        if (noteRecord.isEncrypted === true) normalizedNote.isEncrypted = true;
        if (typeof noteRecord.encryptionSalt === "string" && noteRecord.encryptionSalt.length > 0) {
          normalizedNote.encryptionSalt = noteRecord.encryptionSalt;
        }
        if (typeof noteRecord.encryptionIV === "string" && noteRecord.encryptionIV.length > 0) {
          normalizedNote.encryptionIV = noteRecord.encryptionIV;
        }

        return normalizedNote;
      })
      .filter((note): note is NormalizedResearchNote => Boolean(note))
    : [];

  return {
    id: identifier,
    name:
      typeof record.name === "string" && record.name.trim().length > 0
        ? record.name.trim()
        : "Untitled stack",
    species:
      typeof record.species === "string" && record.species.trim().length > 0
        ? record.species.trim()
        : undefined,
    category:
      typeof record.category === "string" && record.category.trim().length > 0
        ? record.category.trim()
        : undefined,
    description:
      typeof record.description === "string" && record.description.trim().length > 0
        ? record.description.trim()
        : undefined,
    tags: ensureStringArray(record.tags),
    notes,
    createdAt,
    updatedAt,
    ...(typeof record.externalSource === "string" && record.externalSource.trim().length > 0
      ? { externalSource: record.externalSource.trim() }
      : {}),
    ...(typeof record.externalId === "string" && record.externalId.trim().length > 0
      ? { externalId: record.externalId.trim() }
      : {}),
    ...(typeof record.isPublic === "boolean" ? { isPublic: record.isPublic } : {}),
    ...(typeof record.alias === "string" && record.alias.trim().length > 0
      ? { alias: record.alias.trim() }
      : {}),
    ...(typeof record.saveCount === "number" && Number.isFinite(record.saveCount)
      ? { saveCount: record.saveCount }
      : {}),
    ...(typeof record.isEncryptedStack === "boolean" ? { isEncryptedStack: record.isEncryptedStack } : {})
  };
}
