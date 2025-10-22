import { randomUUID } from "crypto";

export type StackPayload = {
  name?: string;
  species?: string;
  category?: string;
  description?: string;
  tags?: unknown;
  notes?: unknown;
};

export type SanitizedResearchNote = {
  id: string;
  title: string;
  individualLabel?: string;
  content: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type SanitizedStackCreate = {
  name: string;
  species?: string;
  category?: string;
  description?: string;
  tags: string[];
  notes: SanitizedResearchNote[];
};

export type SanitizedStackUpdate = Partial<Omit<SanitizedStackCreate, "notes">> & {
  notes?: SanitizedResearchNote[];
};

export type NormalizedResearchNote = {
  id: string;
  title: string;
  individualLabel?: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type NormalizedResearchStack = {
  id: string;
  name: string;
  species?: string;
  category?: string;
  description?: string;
  tags: string[];
  notes: NormalizedResearchNote[];
  createdAt: string;
  updatedAt: string;
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

  return {
    id,
    title,
    individualLabel,
    content,
    tags,
    createdAt,
    updatedAt
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
    notes
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
    updatedAt
  };
}
