"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { APP_VERSION, LAST_SEEN_VERSION_KEY } from "../lib/app-version";
import { getUpdatesSince, type ChangelogEntry } from "../lib/changelog";
import ResearchNotebook from "./ResearchNotebook";

type EntryType = "molt" | "feeding";
type Stage = "Pre-molt" | "Molt" | "Post-molt";
type FeedingOutcome = "Offered" | "Ate" | "Refused" | "Not Observed";
type UnknownRecord = Record<string, unknown>;

type Attachment = {
  id: string;
  name: string;
  url: string;
  type: string;
  addedAt: string;
};

export type MoltEntry = {
  id: string;
  entryType: EntryType;
  specimen: string;
  species?: string;
  date: string;
  stage?: Stage;
  oldSize?: number;
  newSize?: number;
  humidity?: number;
  temperature?: number;
  notes?: string;
  reminderDate?: string;
  feedingPrey?: string;
  feedingOutcome?: FeedingOutcome;
  feedingAmount?: string;
  attachments?: Attachment[];
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  entryType: EntryType;
  specimen: string;
  species: string;
  date: string;
  stage: Stage;
  oldSize: string;
  newSize: string;
  humidity: string;
  temperature: string;
  notes: string;
  reminderDate: string;
  feedingPrey: string;
  feedingOutcome: "" | FeedingOutcome;
  feedingAmount: string;
};

const defaultForm = (): FormState => ({
  entryType: "molt",
  specimen: "",
  species: "",
  date: new Date().toISOString().slice(0, 10),
  stage: "Molt",
  oldSize: "",
  newSize: "",
  humidity: "",
  temperature: "",
  notes: "",
  reminderDate: "",
  feedingPrey: "",
  feedingOutcome: "",
  feedingAmount: ""
});

type SpecimenDashboard = {
  key: string;
  specimen: string;
  species?: string;
  totalMolts: number;
  totalFeedings: number;
  stageCounts: Record<Stage, number>;
  lastMoltDate: string | null;
  firstMoltDate: string | null;
  averageIntervalDays: number | null;
  lastIntervalDays: number | null;
  yearMolts: number;
  attachmentsCount: number;
  reminder: { tone: string; label: string; date?: string } | null;
  recentEntries: MoltEntry[];
  latestEntry: MoltEntry | null;
};

function formatDate(iso: string | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function reminderDiff(iso?: string) {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function reminderDescriptor(iso?: string) {
  const diff = reminderDiff(iso);
  if (diff === null) return null;
  if (diff === 0) {
    return { tone: "due", label: "Due today" };
  }
  if (diff > 0) {
    if (diff <= 3) {
      return { tone: "soon", label: `Due in ${diff}d` };
    }
    return { tone: "upcoming", label: `In ${diff}d` };
  }
  return { tone: "overdue", label: `Overdue ${Math.abs(diff)}d` };
}

function differenceInDays(startIso: string | undefined, endIso: string | undefined): number | null {
  if (!startIso || !endIso) {
    return null;
  }
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  const diff = end.getTime() - start.getTime();
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

async function fileToAttachment(file: File): Promise<Attachment> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  return {
    id: crypto.randomUUID(),
    name: file.name || "Photo",
    url: dataUrl,
    type: file.type || "image/*",
    addedAt: new Date().toISOString()
  };
}

function normalizeEntry(raw: unknown): MoltEntry {
  const record: UnknownRecord = typeof raw === "object" && raw !== null ? (raw as UnknownRecord) : {};

  const stageOptions: Stage[] = ["Pre-molt", "Molt", "Post-molt"];
  const feedingOptions: FeedingOutcome[] = ["Offered", "Ate", "Refused", "Not Observed"];

  const resolveId = (value: unknown): string | undefined => {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    if (value && typeof value === "object" && "toString" in value) {
      const toString = (value as { toString?: () => string }).toString;
      if (typeof toString === "function") {
        return toString.call(value);
      }
    }
    return undefined;
  };

  const entryType: EntryType = record.entryType === "feeding" ? "feeding" : "molt";

  const stageValue = record.stage;
  const stage =
    entryType === "molt" && typeof stageValue === "string" && stageOptions.includes(stageValue as Stage)
      ? (stageValue as Stage)
      : undefined;

  const feedingOutcomeValue = record.feedingOutcome;
  const feedingOutcome =
    entryType === "feeding" &&
    typeof feedingOutcomeValue === "string" &&
    feedingOptions.includes(feedingOutcomeValue as FeedingOutcome)
      ? (feedingOutcomeValue as FeedingOutcome)
      : undefined;

  const entryId = resolveId(record.id) ?? resolveId(record["_id"]) ?? crypto.randomUUID();

  const attachmentsSource = Array.isArray(record["attachments"]) ? (record["attachments"] as unknown[]) : [];
  const attachments = attachmentsSource.map((value, index) => {
    const attachment = typeof value === "object" && value !== null ? (value as UnknownRecord) : {};
    const idValue = attachment.id;
    const nameValue = attachment.name;
    const urlValue = attachment.url;
    const typeValue = attachment.type;
    const addedAtValue = attachment.addedAt;

    return {
      id: typeof idValue === "string" && idValue.length > 0 ? idValue : `${entryId}-attachment-${index}`,
      name:
        typeof nameValue === "string" && nameValue.length > 0 ? nameValue : `Attachment ${index + 1}`,
      url: typeof urlValue === "string" ? urlValue : "",
      type: typeof typeValue === "string" ? typeValue : "image/*",
      addedAt:
        typeof addedAtValue === "string"
          ? addedAtValue
          : addedAtValue instanceof Date
          ? addedAtValue.toISOString()
          : new Date().toISOString()
    };
  });

  const toIsoString = (value: unknown, fallback: string) => {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString();
    }
    if (typeof value === "number") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
    const parsed = new Date(fallback);
    return parsed.toISOString();
  };

  const baseDate = new Date().toISOString();

  return {
    id: entryId,
    entryType,
    specimen:
      typeof record.specimen === "string" && record.specimen.trim().length > 0 ? record.specimen : "Unnamed",
    species:
      typeof record.species === "string" && record.species.trim().length > 0 ? record.species : undefined,
    date: toIsoString(record.date, baseDate),
    stage: entryType === "molt" ? stage ?? "Molt" : undefined,
    oldSize: typeof record.oldSize === "number" ? record.oldSize : undefined,
    newSize: typeof record.newSize === "number" ? record.newSize : undefined,
    humidity: typeof record.humidity === "number" ? record.humidity : undefined,
    temperature: typeof record.temperature === "number" ? record.temperature : undefined,
    notes:
      typeof record.notes === "string" && record.notes.trim().length > 0 ? record.notes : undefined,
    reminderDate:
      typeof record.reminderDate === "string" && record.reminderDate.length > 0
        ? record.reminderDate
        : undefined,
    feedingPrey:
      entryType === "feeding" &&
      typeof record.feedingPrey === "string" &&
      record.feedingPrey.trim().length > 0
        ? record.feedingPrey
        : undefined,
    feedingOutcome,
    feedingAmount:
      entryType === "feeding" &&
      typeof record.feedingAmount === "string" &&
      record.feedingAmount.trim().length > 0
        ? record.feedingAmount
        : undefined,
    attachments,
    createdAt: toIsoString(record.createdAt, baseDate),
    updatedAt: toIsoString(record.updatedAt, baseDate)
  };
}

export default function Dashboard() {
  const [entries, setEntries] = useState<MoltEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attachmentDraft, setAttachmentDraft] = useState<Attachment[]>([]);
  const [filters, setFilters] = useState({
    search: "",
    stage: "all" as "all" | Stage,
    type: "all" as "all" | EntryType,
    order: "desc" as "asc" | "desc"
  });
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<ChangelogEntry[]>([]);
  const [showChangelog, setShowChangelog] = useState(false);
  const [expandedSpecimenKeys, setExpandedSpecimenKeys] = useState<string[]>([]);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/logs", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to load log entries.");
      }
      const data = await res.json();
      const normalized = Array.isArray(data) ? data.map((item: unknown) => normalizeEntry(item)) : [];
      setEntries(normalized);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load entries.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  useEffect(() => {
    const lastSeenVersion = window.localStorage.getItem(LAST_SEEN_VERSION_KEY);

    if (!lastSeenVersion) {
      const updates = getUpdatesSince(null);
      if (updates.length > 0) {
        setPendingUpdates(updates);
        setShowChangelog(true);
      }
      return;
    }

    if (lastSeenVersion === APP_VERSION) {
      return;
    }

    const updates = getUpdatesSince(lastSeenVersion);
    if (updates.length > 0) {
      setPendingUpdates(updates);
      setShowChangelog(true);
      return;
    }

    window.localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
  }, []);

  const resetForm = () => {
    setFormState(defaultForm());
    setAttachmentDraft([]);
    setEditingId(null);
  };

  const openNewEntryForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const dismissChangelog = () => {
    window.localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
    setPendingUpdates([]);
    setShowChangelog(false);
  };

  const handleEdit = (entry: MoltEntry) => {
    setEditingId(entry.id);
    setFormState({
      entryType: entry.entryType ?? "molt",
      specimen: entry.specimen,
      species: entry.species ?? "",
      date: entry.date.slice(0, 10),
      stage: entry.stage ?? "Molt",
      oldSize: entry.oldSize?.toString() ?? "",
      newSize: entry.newSize?.toString() ?? "",
      humidity: entry.humidity?.toString() ?? "",
      temperature: entry.temperature?.toString() ?? "",
      notes: entry.notes ?? "",
      reminderDate: entry.reminderDate ? entry.reminderDate.slice(0, 10) : "",
      feedingPrey: entry.feedingPrey ?? "",
      feedingOutcome: entry.feedingOutcome ?? "",
      feedingAmount: entry.feedingAmount ?? ""
    });
    setAttachmentDraft(entry.attachments ?? []);
    setFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this entry? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/logs/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Failed to delete entry.");
      }
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete entry.");
    }
  };

  const handleAttachmentFiles = async (files: FileList | null) => {
    if (!files) return;
    const conversions = await Promise.all(Array.from(files).map((file) => fileToAttachment(file)));
    setAttachmentDraft((prev) => [...prev, ...conversions]);
  };

  const removeAttachment = (id: string) => {
    setAttachmentDraft((prev) => prev.filter((item) => item.id !== id));
  };

  const submitForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const isFeeding = formState.entryType === "feeding";
    const trimmedSpecimen = formState.specimen.trim();
    const trimmedSpecies = formState.species.trim();

    if (!isFeeding && trimmedSpecies.length === 0) {
      alert("Species is required for molt entries.");
      return;
    }

    const payload = {
      entryType: formState.entryType,
      specimen: trimmedSpecimen || undefined,
      species: trimmedSpecies || undefined,
      date: formState.date,
      stage: isFeeding ? undefined : formState.stage,
      oldSize: !isFeeding && formState.oldSize ? Number(formState.oldSize) : undefined,
      newSize: !isFeeding && formState.newSize ? Number(formState.newSize) : undefined,
      humidity: formState.humidity ? Number(formState.humidity) : undefined,
      temperature: formState.temperature ? Number(formState.temperature) : undefined,
      notes: formState.notes.trim() || undefined,
      reminderDate: formState.reminderDate || undefined,
      feedingPrey: isFeeding ? formState.feedingPrey.trim() || undefined : undefined,
      feedingOutcome: isFeeding && formState.feedingOutcome ? formState.feedingOutcome : undefined,
      feedingAmount: isFeeding ? formState.feedingAmount.trim() || undefined : undefined,
      attachments: attachmentDraft
    };

    try {
      const res = await fetch(editingId ? `/api/logs/${editingId}` : "/api/logs", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Unable to save entry.");
      }
      const raw = await res.json();
      const saved = normalizeEntry(raw);
      if (editingId) {
        setEntries((prev) => prev.map((entry) => (entry.id === saved.id ? saved : entry)));
      } else {
        setEntries((prev) => [saved, ...prev]);
      }
      setFormOpen(false);
      resetForm();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Unable to save entry.");
    }
  };

  const filteredEntries = useMemo(() => {
    const query = filters.search.toLowerCase();
    const stageFilter = filters.stage;
    const typeFilter = filters.type;
    const sorted = [...entries].filter((entry) => {
      const matchesSearch =
        entry.specimen.toLowerCase().includes(query) ||
        (entry.species && entry.species.toLowerCase().includes(query));
      const matchesType = typeFilter === "all" || entry.entryType === typeFilter;
      const matchesStage =
        typeFilter === "feeding"
          ? true
          : stageFilter === "all" ||
            (entry.entryType === "molt" && entry.stage === stageFilter);
      return matchesSearch && matchesType && matchesStage;
    });
    sorted.sort((a, b) => {
      if (filters.order === "asc") {
        return a.date.localeCompare(b.date);
      }
      return b.date.localeCompare(a.date);
    });
    return sorted;
  }, [entries, filters]);

  const stats = useMemo(() => {
    const uniqueSpecimens = new Set(entries.map((entry) => entry.specimen));
    const currentYear = new Date().getFullYear();
    const moltEntries = entries.filter((entry) => entry.entryType === "molt");
    const yearCount = moltEntries.filter((entry) => new Date(entry.date).getFullYear() === currentYear).length;
    const lastDate = moltEntries.reduce<string | null>((acc, entry) => {
      if (!acc || entry.date > acc) return entry.date;
      return acc;
    }, null);

    const reminders = entries
      .map((entry) => ({
        entry,
        diff: reminderDiff(entry.reminderDate)
      }))
      .filter((item) => item.diff !== null) as { entry: MoltEntry; diff: number }[];

    reminders.sort((a, b) => {
      if (a.diff === b.diff) return a.entry.specimen.localeCompare(b.entry.specimen);
      return a.diff - b.diff;
    });

    const nextReminder = reminders[0];

    return {
      total: uniqueSpecimens.size,
      yearCount,
      lastDate,
      nextReminder
    };
  }, [entries]);

  const reminders = useMemo(() => {
    return entries
      .map((entry) => ({
        entry,
        diff: reminderDiff(entry.reminderDate)
      }))
      .filter((item) => item.diff !== null)
      .sort((a, b) => {
        if (a.diff === b.diff) return a.entry.specimen.localeCompare(b.entry.specimen);
        return (a.diff ?? 0) - (b.diff ?? 0);
      }) as { entry: MoltEntry; diff: number }[];
  }, [entries]);

  const specimenDashboards = useMemo(() => {
    if (entries.length === 0) {
      return [];
    }

    const groups = new Map<string, { key: string; displayName: string; entries: MoltEntry[] }>();

    entries.forEach((entry) => {
      const normalizedName = entry.specimen.trim();
      const key = normalizedName.toLowerCase() || entry.specimen.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.entries.push(entry);
      } else {
        groups.set(key, {
          key,
          displayName: normalizedName || entry.specimen,
          entries: [entry]
        });
      }
    });

    const query = filters.search.trim().toLowerCase();
    const currentYear = new Date().getFullYear();

    const summaries = Array.from(groups.values()).map((group) => {
      const stageCounts: Record<Stage, number> = {
        "Pre-molt": 0,
        Molt: 0,
        "Post-molt": 0
      };

      const moltEntries = group.entries
        .filter((entry) => entry.entryType === "molt")
        .sort((a, b) => b.date.localeCompare(a.date));
      const feedingEntries = group.entries.filter((entry) => entry.entryType === "feeding");

      moltEntries.forEach((entry) => {
        if (entry.stage && stageCounts[entry.stage] !== undefined) {
          stageCounts[entry.stage] += 1;
        }
      });

      const sortedMoltsAsc = [...moltEntries].reverse();
      const sortedAllDesc = [...group.entries].sort((a, b) => b.date.localeCompare(a.date));
      const latestEntry = sortedAllDesc[0] ?? null;
      const latestMolt = moltEntries[0] ?? null;
      const firstMolt = sortedMoltsAsc[0] ?? null;

      let species: string | undefined;
      for (const entry of sortedAllDesc) {
        if (entry.species) {
          species = entry.species;
          break;
        }
      }

      const intervals: number[] = [];
      for (let index = 1; index < sortedMoltsAsc.length; index += 1) {
        const previous = sortedMoltsAsc[index - 1];
        const current = sortedMoltsAsc[index];
        const diff = differenceInDays(previous.date, current.date);
        if (diff !== null) {
          intervals.push(diff);
        }
      }

      const averageIntervalDays =
        intervals.length > 0
          ? Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length)
          : null;
      const lastIntervalDays = intervals.length > 0 ? intervals[intervals.length - 1] : null;

      const reminderCandidates = sortedAllDesc
        .map((entry) => {
          const diff = reminderDiff(entry.reminderDate);
          if (diff === null) {
            return null;
          }
          const descriptor = reminderDescriptor(entry.reminderDate);
          if (!descriptor) {
            return null;
          }
          return {
            tone: descriptor.tone,
            label: descriptor.label,
            diff,
            date: entry.reminderDate
          };
        })
        .filter(
          (item): item is { tone: string; label: string; diff: number; date: string | undefined } => item !== null
        )
        .sort((a, b) => a.diff - b.diff);

      const reminder = reminderCandidates[0] ?? null;

      const attachmentsCount = group.entries.reduce(
        (total, entry) => total + (entry.attachments?.length ?? 0),
        0
      );

      const yearMolts = moltEntries.filter(
        (entry) => new Date(entry.date).getFullYear() === currentYear
      ).length;

      return {
        key: group.key,
        specimen: latestEntry?.specimen ?? latestMolt?.specimen ?? group.displayName,
        species,
        totalMolts: moltEntries.length,
        totalFeedings: feedingEntries.length,
        stageCounts,
        lastMoltDate: latestMolt?.date ?? null,
        firstMoltDate: firstMolt?.date ?? null,
        averageIntervalDays,
        lastIntervalDays,
        yearMolts,
        attachmentsCount,
        reminder,
        recentEntries: moltEntries.slice(0, 5),
        latestEntry: latestEntry ?? null
      } as SpecimenDashboard;
    });

    const filteredSummaries = summaries.filter((summary) => {
      if (!query) {
        return true;
      }
      const nameMatch = summary.specimen.toLowerCase().includes(query);
      const speciesMatch = summary.species ? summary.species.toLowerCase().includes(query) : false;
      return nameMatch || speciesMatch;
    });

    filteredSummaries.sort((a, b) => {
      if (a.lastMoltDate && b.lastMoltDate) {
        return b.lastMoltDate.localeCompare(a.lastMoltDate);
      }
      if (a.lastMoltDate) return -1;
      if (b.lastMoltDate) return 1;
      return a.specimen.localeCompare(b.specimen);
    });

    return filteredSummaries;
  }, [entries, filters.search]);

  useEffect(() => {
    setExpandedSpecimenKeys((prev) => {
      if (specimenDashboards.length === 0) {
        return prev.length === 0 ? prev : [];
      }

      const allowedKeys = specimenDashboards.map((spec) => spec.key);
      const validKeys = prev.filter((key) => allowedKeys.includes(key));

      if (validKeys.length > 0) {
        return arraysEqual(validKeys, prev) ? prev : validKeys;
      }

      const defaultKeys =
        specimenDashboards.length <= 3 ? allowedKeys : [specimenDashboards[0].key];

      return arraysEqual(prev, defaultKeys) ? prev : defaultKeys;
    });
  }, [specimenDashboards]);

  const timelineBuckets = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const buckets: {
      label: string;
      key: string;
      count: number;
      stageCounts: Record<string, number>;
      date: Date;
    }[] = [];

    for (let i = 0; i < 12; i += 1) {
      const month = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = `${month.getFullYear()}-${month.getMonth()}`;
      buckets.push({
        label: month.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        key,
        count: 0,
        stageCounts: {},
        date: month
      });
    }

    const lookup = new Map(buckets.map((bucket) => [bucket.key, bucket]));

    entries.forEach((entry) => {
      if (entry.entryType !== "molt") return;
      const entryDate = new Date(entry.date);
      if (entryDate < start) return;
      const bucketKey = `${entryDate.getFullYear()}-${entryDate.getMonth()}`;
      const bucket = lookup.get(bucketKey);
      if (!bucket) return;
      bucket.count += 1;
      if (entry.stage) {
        bucket.stageCounts[entry.stage] = (bucket.stageCounts[entry.stage] ?? 0) + 1;
      }
    });

    return buckets;
  }, [entries]);

  const maxBucketCount = useMemo(
    () => Math.max(1, ...timelineBuckets.map((bucket) => bucket.count)),
    [timelineBuckets]
  );

  const timelineSummary = useMemo(() => {
    const hasMolts = entries.some((entry) => entry.entryType === "molt");
    if (!hasMolts) return "No molt history yet";
    const first = timelineBuckets[0];
    const last = timelineBuckets[timelineBuckets.length - 1];
    const total = timelineBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
    return `${first.date.toLocaleDateString(undefined, { month: "short", year: "numeric" })} – ${last.date.toLocaleDateString(undefined, { month: "short", year: "numeric" })} • ${total} molt${total === 1 ? "" : "s"}`;
  }, [entries, timelineBuckets]);

  const handleReminderAction = async (action: "complete" | "snooze", entry: MoltEntry) => {
    if (action === "complete") {
      await updateEntry(entry.id, { reminderDate: null });
    } else {
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + 7);
      await updateEntry(entry.id, { reminderDate: nextDate.toISOString().slice(0, 10) });
    }
  };

  const updateEntry = async (id: string, updates: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/logs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Unable to update entry.");
      }
      const raw = await res.json();
      const updated = normalizeEntry(raw);
      setEntries((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Unable to update entry.");
    }
  };

  return (
    <div className="app">
      {showChangelog && pendingUpdates.length > 0 && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="changelog-title">
          <div className="modal">
            <header className="modal__header">
              <div>
                <p className="modal__eyebrow">What&apos;s new</p>
                <h2 id="changelog-title">Moltly {pendingUpdates[0].version}</h2>
                {pendingUpdates.length > 1 ? (
                  <p className="modal__subtitle">
                    Catch up on everything since version {pendingUpdates[pendingUpdates.length - 1].version}.
                  </p>
                ) : (
                  <p className="modal__subtitle">Released {formatDate(pendingUpdates[0].date)}</p>
                )}
              </div>
              <button type="button" className="modal__close" onClick={dismissChangelog} aria-label="Close changelog">
                Close
              </button>
            </header>
            <div className="changelog">
              {pendingUpdates.map((entry) => (
                <article className="changelog-entry" key={entry.version}>
                  <header className="changelog-entry__header">
                    <h3>Version {entry.version}</h3>
                    <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                  </header>
                  <ul className="changelog-entry__list">
                    {entry.highlights.map((item, index) => (
                      <li key={`${entry.version}-${index}`}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <footer className="modal__footer">
              <button type="button" className="modal__confirm" onClick={dismissChangelog}>
                Thanks, got it
              </button>
            </footer>
          </div>
        </div>
      )}
      <header className="hero">
        <div className="hero__text">
          <div className="hero__title">
            <Image src="/moltly-logo.svg" alt="Moltly logo" width={60} height={60} className="hero__logo" priority />
            <h1>Moltly</h1>
          </div>
          <p>Track every molt, feeding, reminder, and enclosure tweak across moltly.xyz with confidence.</p>
        </div>
        <div className="hero__actions">
          <button type="button" className="hero__action" onClick={() => (formOpen ? setFormOpen(false) : openNewEntryForm())}>
            {formOpen ? "Close Form" : "New Entry"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign Out
          </button>
        </div>
      </header>
      <section className="stats" aria-live="polite">
        <div className="stat-card">
          <span className="stat-card__label">Active Tarantulas</span>
          <span className="stat-card__value">{stats.total}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Molts This Year</span>
          <span className="stat-card__value">{stats.yearCount}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Last Molt</span>
          <span className="stat-card__value">{formatDate(stats.lastDate ?? undefined)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Next Reminder</span>
          <span className="stat-card__value">
            {stats.nextReminder
              ? `${stats.nextReminder.entry.specimen} · ${stats.nextReminder.diff === 0 ? "Today" : `${stats.nextReminder.diff}d`}`
              : "—"}
          </span>
        </div>
      </section>

      <section className="reminders" aria-labelledby="reminders-title">
        <header className="section-header">
          <h2 id="reminders-title">Reminder Center</h2>
          <span className="section-subtitle">Track enclosure tweaks, feeding resumes, and check-ins.</span>
        </header>
        {reminders.length === 0 ? (
          <p className="reminders__empty">You’re all set—add reminders to see them here.</p>
        ) : (
          <ul className="reminders__list">
            {reminders.map(({ entry }) => {
              const descriptor = reminderDescriptor(entry.reminderDate);
              return (
                <li className="reminder-card" key={entry.id}>
                  <header>
                    <p className="reminder-card__name">{entry.specimen}</p>
                    {descriptor && (
                      <span className="reminder-card__due" data-tone={descriptor.tone}>
                        {descriptor.label} · {formatDate(entry.reminderDate)}
                      </span>
                    )}
                  </header>
                  <div className="reminder-card__meta">
                    <span>{entry.entryType === "molt" ? entry.stage ?? "Molt" : "Feeding"}</span>
                    {entry.species && <span>{entry.species}</span>}
                  </div>
                  <div className="reminder-card__actions">
                    <button type="button" data-reminder-action="complete" onClick={() => handleReminderAction("complete", entry)}>
                      Mark done
                    </button>
                    <button type="button" data-reminder-action="snooze" onClick={() => handleReminderAction("snooze", entry)}>
                      Snooze 7d
                    </button>
                    <button type="button" data-reminder-action="view" onClick={() => handleEdit(entry)}>
                      Open entry
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        className={`timeline${timelineCollapsed ? " is-collapsed" : ""}${
          entries.some((entry) => entry.entryType === "molt") ? "" : " is-empty"
        }`}
        aria-labelledby="timeline-title"
      >
        <header className="section-header timeline__header">
          <div>
            <h2 id="timeline-title">Molt Timeline</h2>
            <span className="section-subtitle" id="timeline-summary">
              {timelineSummary}
            </span>
          </div>
          <button
            className="timeline__toggle"
            id="toggle-timeline"
            type="button"
            aria-expanded={!timelineCollapsed}
            aria-controls="timeline"
            onClick={() => setTimelineCollapsed((prev) => !prev)}
          >
            {timelineCollapsed ? "Expand" : "Collapse"}
          </button>
        </header>
        <div className="timeline__scroll" id="timeline" role="list" aria-label="Molt timeline">
          {timelineBuckets.map((bucket) => (
            <div className="timeline__point" role="listitem" key={bucket.key}>
              <span className="timeline__month">{bucket.label}</span>
              <div className="timeline__bar">
                <div className="timeline__bar-fill" style={{ height: bucket.count ? `${Math.max(10, (bucket.count / maxBucketCount) * 100)}%` : "0%" }} />
              </div>
              <span className="timeline__count">{bucket.count}</span>
              <div className="timeline__stages">
                {bucket.count === 0
                  ? "—"
                  : Object.entries(bucket.stageCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([stage, count]) => `${stage.split(" ")[0]}×${count}`)
                      .join(" · ")}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="specimens" aria-labelledby="specimens-title">
        <header className="section-header">
          <h2 id="specimens-title">Specimen Dashboards</h2>
          <span className="section-subtitle">
            Keep tabs on each tarantula&apos;s pace, molt streak, feeding history, and reminders.
          </span>
        </header>
        {specimenDashboards.length > 1 && (
          <div className="specimens__controls" aria-label="Specimen dashboard controls">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setExpandedSpecimenKeys(specimenDashboards.map((spec) => spec.key))}
              disabled={expandedSpecimenKeys.length === specimenDashboards.length && specimenDashboards.length > 0}
            >
              Expand all
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setExpandedSpecimenKeys([])}
              disabled={expandedSpecimenKeys.length === 0}
            >
              Collapse all
            </button>
          </div>
        )}
        {specimenDashboards.length === 0 ? (
          <p className="specimens__empty">
            {entries.length === 0
              ? "Add log entries to unlock specimen dashboards and growth insights."
              : filters.search.trim()
              ? "No specimens match your current search."
              : "Add log entries to unlock specimen dashboards and growth insights."}
          </p>
        ) : (
          <ul className="specimens__list">
            {specimenDashboards.map((specimen) => {
              const isExpanded = expandedSpecimenKeys.includes(specimen.key);
              const safeIdSuffix = specimen.key.replace(/[^a-z0-9]+/gi, "-") || "specimen";
              const detailsId = `specimen-${safeIdSuffix}-details`;

              return (
                <li className={`specimen-card${isExpanded ? "" : " specimen-card--collapsed"}`} key={specimen.key}>
                  <header className="specimen-card__header">
                    <div>
                      <p className="specimen-card__name">{specimen.specimen}</p>
                      {specimen.species && <p className="specimen-card__species">{specimen.species}</p>}
                      {specimen.firstMoltDate && (
                        <p className="specimen-card__meta">Tracking since {formatDate(specimen.firstMoltDate)}</p>
                      )}
                    </div>
                    <div className="specimen-card__controls">
                      <div className="specimen-card__totals">
                        <span>
                          {specimen.totalMolts} molt{specimen.totalMolts === 1 ? "" : "s"}
                        </span>
                        <span>
                          {specimen.totalFeedings} feeding{specimen.totalFeedings === 1 ? "" : "s"}
                        </span>
                        <span>
                          {specimen.attachmentsCount} photo{specimen.attachmentsCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="specimen-card__toggle"
                        onClick={() => {
                          setExpandedSpecimenKeys((prev) => {
                            if (prev.includes(specimen.key)) {
                              return prev.filter((key) => key !== specimen.key);
                            }
                            return [...prev, specimen.key];
                          });
                        }}
                        aria-expanded={isExpanded}
                        aria-controls={detailsId}
                      >
                        {isExpanded ? "Collapse" : "Expand"}
                      </button>
                    </div>
                  </header>
                  <div className="specimen-card__details" id={detailsId} aria-hidden={!isExpanded}>
                    <div className="specimen-card__stats">
                      <div className="specimen-card__stat">
                        <span>Last molt</span>
                        <strong>{formatDate(specimen.lastMoltDate ?? undefined)}</strong>
                      </div>
                      <div className="specimen-card__stat">
                        <span>Avg interval</span>
                        <strong>
                          {specimen.averageIntervalDays !== null ? `${specimen.averageIntervalDays}d` : "—"}
                        </strong>
                      </div>
                      <div className="specimen-card__stat">
                        <span>Last gap</span>
                        <strong>{specimen.lastIntervalDays !== null ? `${specimen.lastIntervalDays}d` : "—"}</strong>
                      </div>
                      <div className="specimen-card__stat">
                        <span>Molts this year</span>
                        <strong>{specimen.yearMolts}</strong>
                      </div>
                      <div className="specimen-card__stat">
                        <span>Next reminder</span>
                        {specimen.reminder ? (
                          <strong data-tone={specimen.reminder.tone}>
                            {specimen.reminder.label}
                            {specimen.reminder.date ? ` · ${formatDate(specimen.reminder.date)}` : ""}
                          </strong>
                        ) : (
                          <strong>—</strong>
                        )}
                      </div>
                    </div>
                    {Object.values(specimen.stageCounts).some((count) => count > 0) && (
                      <div className="specimen-card__stages" aria-label="Stage breakdown">
                        {Object.entries(specimen.stageCounts)
                          .filter(([, count]) => count > 0)
                          .map(([stage, count]) => (
                            <span key={stage} className="specimen-card__stage">
                              {stage.split(" ")[0]}×{count}
                            </span>
                          ))}
                      </div>
                    )}
                    <ol className="specimen-card__timeline">
                      {specimen.recentEntries.map((entry, index) => {
                        const hasOldSize = entry.oldSize !== undefined && entry.oldSize !== null;
                        const hasNewSize = entry.newSize !== undefined && entry.newSize !== null;
                        const sizeLabel =
                          hasOldSize && hasNewSize
                            ? `${entry.oldSize} → ${entry.newSize}cm`
                            : hasNewSize
                            ? `${entry.newSize}cm`
                            : null;
                        const note =
                          entry.notes && entry.notes.length > 160
                            ? `${entry.notes.slice(0, 157)}…`
                            : entry.notes;
                        const attachmentsCount = entry.attachments?.length ?? 0;
                        const previous = specimen.recentEntries[index + 1];
                        const gapDays =
                          previous && entry.date ? differenceInDays(previous.date, entry.date) : null;
                        const gapLabel = gapDays !== null ? `${gapDays}d gap` : null;
                        return (
                          <li key={entry.id}>
                            <div className="specimen-card__timeline-header">
                              <span className="chip chip--stage">{entry.stage}</span>
                              <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                            </div>
                            <div className="specimen-card__timeline-meta">
                              {sizeLabel && <span>{sizeLabel}</span>}
                              {gapLabel && <span>{gapLabel}</span>}
                              {attachmentsCount > 0 && (
                                <span>
                                  {attachmentsCount} photo{attachmentsCount === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                            {note && <p className="specimen-card__timeline-notes">{note}</p>}
                          </li>
                        );
                      })}
                    </ol>
                    {specimen.totalMolts > specimen.recentEntries.length && (
                      <p className="specimen-card__footnote">
                        +{specimen.totalMolts - specimen.recentEntries.length} earlier molt
                        {specimen.totalMolts - specimen.recentEntries.length === 1 ? "" : "s"} logged
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="entry-panel" aria-hidden={!formOpen}>
        <h2>{editingId ? "Edit Entry" : "Add Log Entry"}</h2>
        <form onSubmit={submitForm}>
          <div className="field-row">
            <label className="field">
              <span>Spider/Tarantula Name</span>
              <input
                type="text"
                name="specimen"
                value={formState.specimen}
                onChange={(event) => setFormState((prev) => ({ ...prev, specimen: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Species{formState.entryType === "molt" ? " *" : ""}</span>
              <input
                type="text"
                name="species"
                required={formState.entryType === "molt"}
                value={formState.species}
                onChange={(event) => setFormState((prev) => ({ ...prev, species: event.target.value }))}
              />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Entry Type</span>
              <select
                name="entryType"
                value={formState.entryType}
                onChange={(event) => {
                  const nextType = event.target.value as EntryType;
                  setFormState((prev) => ({ ...prev, entryType: nextType }));
                }}
              >
                <option value="molt">Molt</option>
                <option value="feeding">Feeding</option>
              </select>
            </label>
            <label className="field">
              <span>Entry Date</span>
              <input
                type="date"
                name="date"
                required
                value={formState.date}
                onChange={(event) => setFormState((prev) => ({ ...prev, date: event.target.value }))}
              />
            </label>
          </div>

          {formState.entryType === "molt" ? (
            <>
              <div className="field-row">
                <label className="field">
                  <span>Molt Stage</span>
                  <select
                    name="stage"
                    value={formState.stage}
                    onChange={(event) => setFormState((prev) => ({ ...prev, stage: event.target.value as Stage }))}
                  >
                    <option value="Pre-molt">Pre-molt</option>
                    <option value="Molt">Molt</option>
                    <option value="Post-molt">Post-molt</option>
                  </select>
                </label>
                <label className="field">
                  <span>Last Size (cm)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={formState.oldSize}
                    onChange={(event) => setFormState((prev) => ({ ...prev, oldSize: event.target.value }))}
                  />
                </label>
              </div>
              <label className="field">
                <span>New Size (cm)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formState.newSize}
                  onChange={(event) => setFormState((prev) => ({ ...prev, newSize: event.target.value }))}
                />
              </label>
            </>
          ) : (
            <>
              <div className="field-row">
                <label className="field">
                  <span>Prey Offered</span>
                  <input
                    type="text"
                    value={formState.feedingPrey}
                    onChange={(event) => setFormState((prev) => ({ ...prev, feedingPrey: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Outcome</span>
                  <select
                    value={formState.feedingOutcome}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, feedingOutcome: event.target.value as "" | FeedingOutcome }))
                    }
                  >
                    <option value="">—</option>
                    <option value="Offered">Offered</option>
                    <option value="Ate">Ate</option>
                    <option value="Refused">Refused</option>
                    <option value="Not Observed">Not Observed</option>
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Quantity / Size</span>
                <input
                  type="text"
                  value={formState.feedingAmount}
                  onChange={(event) => setFormState((prev) => ({ ...prev, feedingAmount: event.target.value }))}
                />
              </label>
            </>
          )}

          <div className="field-row">
            <label className="field">
              <span>Humidity (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={formState.humidity}
                onChange={(event) => setFormState((prev) => ({ ...prev, humidity: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Temperature (°C)</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={formState.temperature}
                onChange={(event) => setFormState((prev) => ({ ...prev, temperature: event.target.value }))}
              />
            </label>
          </div>

          <label className="field">
            <span>Notes</span>
            <textarea
              name="notes"
              rows={3}
              value={formState.notes}
              onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Behavior changes, feeding notes, enclosure tweaks…"
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Next Reminder</span>
              <input
                type="date"
                name="reminderDate"
                value={formState.reminderDate}
                onChange={(event) => setFormState((prev) => ({ ...prev, reminderDate: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Photo Attachments</span>
              <input type="file" accept="image/*" multiple onChange={(event) => handleAttachmentFiles(event.target.files)} />
            </label>
          </div>

          {attachmentDraft.length > 0 && (
            <div className="existing-attachments">
              <p>Current photos</p>
              <div className="existing-attachments__list">
                {attachmentDraft.map((attachment) => (
                  <div className="existing-attachments__item" key={attachment.id}>
                    <Image
                      src={attachment.url}
                      alt={attachment.name}
                      width={48}
                      height={48}
                      className="existing-attachments__thumb"
                      unoptimized
                    />
                    <span>{attachment.name}</span>
                    <button
                      type="button"
                      className="existing-attachments__remove"
                      onClick={() => removeAttachment(attachment.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="panel-actions">
            <button type="submit" className="btn btn--primary">
              {editingId ? "Save Changes" : "Save Entry"}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>

      <section>
        <div className="toolbar">
          <input
            className="toolbar__search"
            type="search"
            placeholder="Search by name or species"
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            aria-label="Filter log entries"
          />
          <select
            className="toolbar__filter"
            value={filters.type}
            onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value as "all" | EntryType }))}
            aria-label="Filter by entry type"
          >
            <option value="all">All entries</option>
            <option value="molt">Molts</option>
            <option value="feeding">Feedings</option>
          </select>
          <select
            className="toolbar__filter"
            value={filters.stage}
            onChange={(event) => setFilters((prev) => ({ ...prev, stage: event.target.value as "all" | Stage }))}
            aria-label="Filter by molt stage"
            disabled={filters.type === "feeding"}
          >
            <option value="all">All stages</option>
            <option value="Pre-molt">Pre-molt</option>
            <option value="Molt">Molt</option>
            <option value="Post-molt">Post-molt</option>
          </select>
          <button
            className="toolbar__sort"
            type="button"
            onClick={() => setFilters((prev) => ({ ...prev, order: prev.order === "desc" ? "asc" : "desc" }))}
          >
            {filters.order === "desc" ? "Latest First" : "Oldest First"}
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading entries…</div>
        ) : error ? (
          <div className="empty-state">
            {error}
            <br />
            <button type="button" className="btn btn--ghost" onClick={fetchEntries} style={{ marginTop: 12 }}>
              Retry
            </button>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="empty-state">No entries yet. Add a molt or feeding to get started.</div>
        ) : (
          <ul className="log-list">
            {filteredEntries.map((entry) => {
              const diff = reminderDescriptor(entry.reminderDate);
              const attachments = entry.attachments ?? [];
              const previewAttachments = attachments.slice(0, 3);
              const remainingAttachments = attachments.length - previewAttachments.length;
              const isMolt = entry.entryType === "molt";
              const hasOldSize = typeof entry.oldSize === "number";
              const hasNewSize = typeof entry.newSize === "number";
              const sizeLabel =
                hasOldSize && hasNewSize
                  ? `${entry.oldSize} → ${entry.newSize}cm`
                  : hasNewSize
                  ? `${entry.newSize}cm`
                  : null;
              return (
                <li className="log-card" key={entry.id}>
                  <div className="log-card__inner">
                    <header>
                      <p className="log-card__specimen">{entry.specimen}</p>
                      <span className="log-card__date">{formatDate(entry.date)}</span>
                    </header>
                    {entry.species && <p className="log-card__species">{entry.species}</p>}
                    <div className="log-card__tags">
                      {isMolt ? (
                        <>
                          <span className="chip chip--stage">{entry.stage ?? "Molt"}</span>
                          <span className="chip chip--size">{sizeLabel ?? "Size n/a"}</span>
                        </>
                      ) : (
                        <>
                          <span className="chip chip--stage">Feeding</span>
                          {entry.feedingOutcome && (
                            <span className="chip chip--size">{entry.feedingOutcome}</span>
                          )}
                          {(entry.feedingPrey || entry.feedingAmount) && (
                            <span className="chip chip--size">
                              {entry.feedingPrey ?? "Prey n/a"}
                              {entry.feedingAmount ? ` · ${entry.feedingAmount}` : ""}
                            </span>
                          )}
                        </>
                      )}
                      {diff && (
                        <span className="chip chip--reminder" data-tone={diff.tone}>
                          {diff.label}
                        </span>
                      )}
                    </div>
                    {entry.notes && <p className="log-card__notes">{entry.notes}</p>}
                    {previewAttachments.length > 0 && (
                      <div className="log-card__attachments" aria-label="Entry photos">
                        {previewAttachments.map((attachment) => (
                          <a
                            key={attachment.id}
                            className="log-card__attachment"
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open ${attachment.name ?? "photo"} in a new tab`}
                          >
                            <Image
                              src={attachment.url}
                              alt={attachment.name || "Log attachment"}
                              width={96}
                              height={96}
                              unoptimized
                            />
                          </a>
                        ))}
                        {remainingAttachments > 0 && <span className="log-card__attachment-more">+{remainingAttachments}</span>}
                      </div>
                    )}
                    <div className="log-card__actions">
                      <button type="button" className="btn btn--ghost" onClick={() => handleEdit(entry)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn--ghost" onClick={() => handleDelete(entry.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ResearchNotebook />

      {!formOpen && (
        <button className="fab" type="button" aria-label="Add log entry" onClick={openNewEntryForm}>
          +
        </button>
      )}
      <footer className="support-footer" aria-label="Project links">
        <span>Like Moltly?</span>
        <a href="https://github.com/0xgingi/moltly" target="_blank" rel="noreferrer">
          GitHub
        </a>
        <span aria-hidden="true">•</span>
        <a href="https://ko-fi.com/0xgingi" target="_blank" rel="noreferrer">
          Ko-fi
        </a>
      </footer>
    </div>
  );
}
