"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";

type Stage = "Pre-molt" | "Molt" | "Post-molt";

type Attachment = {
  id: string;
  name: string;
  url: string;
  type: string;
  addedAt: string;
};

export type MoltEntry = {
  id: string;
  specimen: string;
  species?: string;
  date: string;
  stage: Stage;
  oldSize?: number;
  newSize?: number;
  humidity?: number;
  temperature?: number;
  notes?: string;
  reminderDate?: string;
  attachments?: Attachment[];
  createdAt: string;
  updatedAt: string;
};

type FormState = {
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
};

const defaultForm = (): FormState => ({
  specimen: "",
  species: "",
  date: new Date().toISOString().slice(0, 10),
  stage: "Molt",
  oldSize: "",
  newSize: "",
  humidity: "",
  temperature: "",
  notes: "",
  reminderDate: ""
});

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

export default function Dashboard() {
  const [entries, setEntries] = useState<MoltEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attachmentDraft, setAttachmentDraft] = useState<Attachment[]>([]);
  const [filters, setFilters] = useState({ search: "", stage: "all", order: "desc" as "asc" | "desc" });
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/logs", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to load molt entries.");
      }
      const data = await res.json();
      setEntries(data);
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

  const resetForm = () => {
    setFormState(defaultForm());
    setAttachmentDraft([]);
    setEditingId(null);
  };

  const openNewEntryForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const handleEdit = (entry: MoltEntry) => {
    setEditingId(entry.id);
    setFormState({
      specimen: entry.specimen,
      species: entry.species ?? "",
      date: entry.date.slice(0, 10),
      stage: entry.stage,
      oldSize: entry.oldSize?.toString() ?? "",
      newSize: entry.newSize?.toString() ?? "",
      humidity: entry.humidity?.toString() ?? "",
      temperature: entry.temperature?.toString() ?? "",
      notes: entry.notes ?? "",
      reminderDate: entry.reminderDate ? entry.reminderDate.slice(0, 10) : ""
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
    const payload = {
      specimen: formState.specimen.trim(),
      species: formState.species.trim() || undefined,
      date: formState.date,
      stage: formState.stage,
      oldSize: formState.oldSize ? Number(formState.oldSize) : undefined,
      newSize: formState.newSize ? Number(formState.newSize) : undefined,
      humidity: formState.humidity ? Number(formState.humidity) : undefined,
      temperature: formState.temperature ? Number(formState.temperature) : undefined,
      notes: formState.notes.trim() || undefined,
      reminderDate: formState.reminderDate || undefined,
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
      const saved = await res.json();
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
    const stage = filters.stage;
    const sorted = [...entries].filter((entry) => {
      const matchesSearch =
        entry.specimen.toLowerCase().includes(query) ||
        (entry.species && entry.species.toLowerCase().includes(query));
      const matchesStage = stage === "all" || entry.stage === stage;
      return matchesSearch && matchesStage;
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
    const yearCount = entries.filter((entry) => new Date(entry.date).getFullYear() === currentYear).length;
    const lastDate = entries.reduce<string | null>((acc, entry) => {
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
      const entryDate = new Date(entry.date);
      if (entryDate < start) return;
      const bucketKey = `${entryDate.getFullYear()}-${entryDate.getMonth()}`;
      const bucket = lookup.get(bucketKey);
      if (!bucket) return;
      bucket.count += 1;
      bucket.stageCounts[entry.stage] = (bucket.stageCounts[entry.stage] ?? 0) + 1;
    });

    return buckets;
  }, [entries]);

  const maxBucketCount = useMemo(
    () => Math.max(1, ...timelineBuckets.map((bucket) => bucket.count)),
    [timelineBuckets]
  );

  const timelineSummary = useMemo(() => {
    if (!entries.length) return "No molt history yet";
    const first = timelineBuckets[0];
    const last = timelineBuckets[timelineBuckets.length - 1];
    const total = timelineBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
    return `${first.date.toLocaleDateString(undefined, { month: "short", year: "numeric" })} – ${last.date.toLocaleDateString(undefined, { month: "short", year: "numeric" })} • ${total} molt${total === 1 ? "" : "s"}`;
  }, [entries.length, timelineBuckets]);

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
      const updated = await res.json();
      setEntries((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Unable to update entry.");
    }
  };

  return (
    <div className="app">
      <header className="hero">
        <div className="hero__text">
          <h1>Moltly</h1>
          <p>Track every molt, reminder, and enclosure tweak across moltly.xyz with confidence.</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
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
                    <span>{entry.stage}</span>
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

      <section className={`timeline${timelineCollapsed ? " is-collapsed" : ""}${entries.length === 0 ? " is-empty" : ""}`} aria-labelledby="timeline-title">
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

      <section className="entry-panel" aria-hidden={!formOpen}>
        <h2>{editingId ? "Edit Entry" : "Add Molt Entry"}</h2>
        <form onSubmit={submitForm}>
          <div className="field-row">
            <label className="field">
              <span>Spider/Tarantula Name</span>
              <input
                type="text"
                name="specimen"
                required
                value={formState.specimen}
                onChange={(event) => setFormState((prev) => ({ ...prev, specimen: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Species</span>
              <input
                type="text"
                name="species"
                value={formState.species}
                onChange={(event) => setFormState((prev) => ({ ...prev, species: event.target.value }))}
              />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Molt Date</span>
              <input
                type="date"
                name="date"
                required
                value={formState.date}
                onChange={(event) => setFormState((prev) => ({ ...prev, date: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Stage</span>
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
          </div>

          <div className="field-row">
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
          </div>

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
            aria-label="Filter molt entries"
          />
          <select
            className="toolbar__filter"
            value={filters.stage}
            onChange={(event) => setFilters((prev) => ({ ...prev, stage: event.target.value }))}
            aria-label="Filter by molt stage"
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
          <div className="empty-state">Loading molt entries…</div>
        ) : error ? (
          <div className="empty-state">
            {error}
            <br />
            <button type="button" className="btn btn--ghost" onClick={fetchEntries} style={{ marginTop: 12 }}>
              Retry
            </button>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="empty-state">No entries yet. Start your Moltly journey by adding the first molt record.</div>
        ) : (
          <ul className="log-list">
            {filteredEntries.map((entry) => {
              const diff = reminderDescriptor(entry.reminderDate);
              const attachments = entry.attachments ?? [];
              const previewAttachments = attachments.slice(0, 3);
              const remainingAttachments = attachments.length - previewAttachments.length;
              return (
                <li className="log-card" key={entry.id}>
                  <div className="log-card__inner">
                    <header>
                      <p className="log-card__specimen">{entry.specimen}</p>
                      <span className="log-card__date">{formatDate(entry.date)}</span>
                    </header>
                    {entry.species && <p className="log-card__species">{entry.species}</p>}
                    <div className="log-card__tags">
                      <span className="chip chip--stage">{entry.stage}</span>
                      <span className="chip chip--size">
                        {entry.oldSize && entry.newSize
                          ? `${entry.oldSize} → ${entry.newSize}cm`
                          : entry.newSize
                          ? `${entry.newSize}cm`
                          : "Size n/a"}
                      </span>
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
                              alt={attachment.name || "Molt attachment"}
                              width={96}
                              height={96}
                              unoptimized
                            />
                          </a>
                        ))}
                        {remainingAttachments > 0 && <span className="log-card__attachment-more">+{remainingAttachments}</span>}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
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

      {!formOpen && (
        <button className="fab" type="button" aria-label="Add molt entry" onClick={openNewEntryForm}>
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
