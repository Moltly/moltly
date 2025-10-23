"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResearchNote, ResearchStack } from "../types/research";
import { readLocalResearchStacks, writeLocalResearchStacks } from "../lib/local-research";

type StackFilter = {
  search: string;
  category: "all" | string;
};

type StackDraftFields = Pick<ResearchStack, "name" | "species" | "category" | "description" | "tags" | "notes">;

type DataMode = "sync" | "local";

const defaultFilter: StackFilter = {
  search: "",
  category: "all"
};

const defaultCreateForm = {
  name: "",
  species: "",
  category: "",
  description: ""
};

const COLLAPSE_STORAGE_KEY = "research-notebook-collapsed";

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 12);
}

function formatTimestamp(iso: string) {
  if (!iso) return "";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  return value.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatSummaryDate(iso: string) {
  if (!iso) return "—";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "—";
  return value.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function uniqueTitle(base: string, existing: string[]) {
  const trimmed = base.trim() || "Note";
  if (!existing.includes(trimmed)) {
    return trimmed;
  }
  let index = 2;
  let candidate = `${trimmed} (${index})`;
  while (existing.includes(candidate)) {
    index += 1;
    candidate = `${trimmed} (${index})`;
  }
  return candidate;
}

function incrementLabel(label: string | undefined, existing: string[]) {
  if (!label) return undefined;
  const trimmed = label.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/^(.*?)(\d+)\s*$/);
  const lowerExisting = new Set(existing.map((value) => value.toLowerCase()));

  if (match) {
    const base = match[1].trim() ? `${match[1].trim()} ` : "";
    let numeric = Number.parseInt(match[2], 10) + 1;
    let candidate = `${base}${numeric}`;
    while (lowerExisting.has(candidate.toLowerCase())) {
      numeric += 1;
      candidate = `${base}${numeric}`;
    }
    return candidate;
  }

  let numeric = 2;
  let candidate = `${trimmed} ${numeric}`;
  while (lowerExisting.has(candidate.toLowerCase())) {
    numeric += 1;
    candidate = `${trimmed} ${numeric}`;
  }
  return candidate;
}

function tagsToInput(tags: string[]) {
  return tags.join(", ");
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag, index, array) => tag.length > 0 && array.indexOf(tag) === index);
}

function createBlankNote(existingTitles: string[]): ResearchNote {
  const now = new Date().toISOString();
  const title = uniqueTitle("New note", existingTitles);
  return {
    id: generateId(),
    title,
    content: "",
    tags: [],
    createdAt: now,
    updatedAt: now
  };
}

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const errorMessage = typeof body.error === "string" ? body.error : "Request failed.";
    throw new Error(errorMessage);
  }
  return response.json();
}

export default function ResearchNotebook() {
  const [stacks, setStacks] = useState<ResearchStack[]>([]);
  const [selectedStackId, setSelectedStackId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StackFilter>(defaultFilter);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirtyStacks, setDirtyStacks] = useState<Record<string, boolean>>({});
  const [savingStacks, setSavingStacks] = useState<Record<string, boolean>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [creatingStack, setCreatingStack] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const contentId = "research-notebook-content";
  const { data: session, status: sessionStatus } = useSession();
  const mode: DataMode | null =
    sessionStatus === "loading" ? null : session?.user?.id ? "sync" : "local";
  const isGuestMode = mode === "local";
  const persistGuestStacks = useCallback(
    (list: ResearchStack[]) => {
      if (!isGuestMode) {
        return;
      }
      writeLocalResearchStacks(list);
    },
    [isGuestMode]
  );

  useEffect(() => {
    if (!mode) {
      return;
    }

    if (mode === "local") {
      const localStacks = readLocalResearchStacks();
      setStacks(localStacks);
      setSelectedStackId((prev) => prev ?? (localStacks[0]?.id ?? null));
      setDirtyStacks({});
      setSavingStacks({});
      setLoading(false);
      setError(null);
      return;
    }

    const loadStacks = async () => {
      try {
        setLoading(true);
        const data = await fetchJson("/api/research", { credentials: "include" });
        if (Array.isArray(data)) {
          setStacks(data as ResearchStack[]);
          if (data.length > 0) {
            setSelectedStackId((prev) => prev ?? (data[0] as ResearchStack).id);
          }
        } else {
          setStacks([]);
        }
        setError(null);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Unable to load research stacks.");
      } finally {
        setLoading(false);
      }
    };

    void loadStacks();
  }, [mode]);

  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (stored === "true") {
      setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "true" : "false");
  }, [collapsed]);

  useEffect(() => {
    if (collapsed) {
      setCreateOpen(false);
    }
  }, [collapsed]);

  const categories = useMemo(() => {
    const values = new Set<string>();
    stacks.forEach((stack) => {
      if (stack.category) {
        values.add(stack.category);
      }
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [stacks]);

  const totalNotes = useMemo(
    () => stacks.reduce((sum, stack) => sum + stack.notes.length, 0),
    [stacks]
  );

  const distinctIndividuals = useMemo(() => {
    const values = new Set<string>();
    stacks.forEach((stack) => {
      stack.notes.forEach((note) => {
        if (note.individualLabel && note.individualLabel.trim().length > 0) {
          values.add(note.individualLabel.trim().toLowerCase());
        }
      });
    });
    return values.size;
  }, [stacks]);

  const recentStacks = useMemo(() => stacks.slice(0, 3), [stacks]);

  const filteredStacks = useMemo(() => {
    const search = filter.search.trim().toLowerCase();
    return stacks.filter((stack) => {
      const matchesCategory =
        filter.category === "all" || (stack.category ?? "uncategorized") === filter.category;

      if (!matchesCategory) {
        return false;
      }

      if (!search) {
        return true;
      }

      const haystack = [
        stack.name,
        stack.species ?? "",
        stack.category ?? "",
        stack.description ?? "",
        stack.tags.join(" "),
        stack.notes.map((note) => `${note.title} ${note.individualLabel ?? ""} ${note.content}`).join(" ")
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [stacks, filter]);

  useEffect(() => {
    if (filteredStacks.length === 0) {
      setSelectedStackId(null);
      return;
    }
    if (!selectedStackId || !filteredStacks.some((stack) => stack.id === selectedStackId)) {
      setSelectedStackId(filteredStacks[0].id);
    }
  }, [filteredStacks, selectedStackId]);

  const selectedStack = selectedStackId
    ? stacks.find((stack) => stack.id === selectedStackId) ?? null
    : null;

  const totalStacks = stacks.length;
  const baseSubtitle =
    "Organize field notes, individual quirk logs, and duplicate templates without cluttering your molt entries.";
  const individualsLabel =
    distinctIndividuals > 0
      ? ` • ${distinctIndividuals} individual${distinctIndividuals === 1 ? "" : "s"} tracked`
      : "";
  const statsSubtitle =
    totalStacks > 0
      ? `${totalStacks} stack${totalStacks === 1 ? "" : "s"} • ${totalNotes} note${totalNotes === 1 ? "" : "s"}${individualsLabel}`
      : baseSubtitle;
  const subtitleHint = totalStacks > 0 ? baseSubtitle : null;

  const markDirty = (stackId: string) => {
    setDirtyStacks((prev) => ({ ...prev, [stackId]: true }));
  };

  const clearDirty = (stackId: string) => {
    setDirtyStacks((prev) => {
      if (!prev[stackId]) return prev;
      const next = { ...prev };
      delete next[stackId];
      return next;
    });
  };

  const setSaving = (stackId: string, isSaving: boolean) => {
    setSavingStacks((prev) => {
      if (isSaving) {
        return { ...prev, [stackId]: true };
      }
      if (!prev[stackId]) return prev;
      const next = { ...prev };
      delete next[stackId];
      return next;
    });
  };

  const handleToggleCreate = () => {
    if (collapsed) {
      setCollapsed(false);
    }
    setCreateOpen((prev) => !prev);
    setError(null);
  };

  const handleCollapseToggle = () => {
    setCollapsed((prev) => !prev);
  };

  const handleSummarySelect = (stackId: string) => {
    setFilter({ ...defaultFilter });
    setSelectedStackId(stackId);
    setCollapsed(false);
  };

  const updateStackFields = (stackId: string, updates: Partial<StackDraftFields>) => {
    setStacks((prev) =>
      prev.map((stack) => {
        if (stack.id !== stackId) return stack;
        return {
          ...stack,
          ...updates,
          updatedAt: new Date().toISOString()
        };
      })
    );
    markDirty(stackId);
  };

  const updateNote = (stackId: string, noteId: string, patch: Partial<ResearchNote>) => {
    setStacks((prev) =>
      prev.map((stack) => {
        if (stack.id !== stackId) return stack;
        const nextNotes = stack.notes.map((note) => {
          if (note.id !== noteId) return note;
          return {
            ...note,
            ...patch,
            updatedAt: new Date().toISOString()
          };
        });
        return {
          ...stack,
          notes: nextNotes,
          updatedAt: new Date().toISOString()
        };
      })
    );
    markDirty(stackId);
  };

  const handleAddNote = (stackId: string) => {
    const stack = stacks.find((item) => item.id === stackId);
    if (!stack) return;
    const titles = stack.notes.map((note) => note.title);
    const newNote = createBlankNote(titles);
    setStacks((prev) =>
      prev.map((item) => {
        if (item.id !== stackId) return item;
        return {
          ...item,
          notes: [newNote, ...item.notes],
          updatedAt: new Date().toISOString()
        };
      })
    );
    markDirty(stackId);
  };

  const handleDuplicateNote = (stackId: string, noteId: string) => {
    setStacks((prev) =>
      prev.map((stack) => {
        if (stack.id !== stackId) return stack;
        const original = stack.notes.find((note) => note.id === noteId);
        if (!original) return stack;

        const titles = stack.notes.map((note) => note.title);
        const labels = stack.notes
          .map((note) => note.individualLabel)
          .filter((value): value is string => Boolean(value));

        const now = new Date().toISOString();
        const duplicate: ResearchNote = {
          ...original,
          id: generateId(),
          title: uniqueTitle(original.title, titles),
          individualLabel: incrementLabel(original.individualLabel, labels),
          createdAt: now,
          updatedAt: now
        };

        return {
          ...stack,
          notes: [duplicate, ...stack.notes],
          updatedAt: now
        };
      })
    );
    markDirty(stackId);
  };

  const handleRemoveNote = (stackId: string, noteId: string) => {
    if (!confirm("Remove this note from the stack?")) return;
    setStacks((prev) =>
      prev.map((stack) => {
        if (stack.id !== stackId) return stack;
        return {
          ...stack,
          notes: stack.notes.filter((note) => note.id !== noteId),
          updatedAt: new Date().toISOString()
        };
      })
    );
    markDirty(stackId);
  };

  const handleSaveStack = async (stackId: string) => {
    const stack = stacks.find((item) => item.id === stackId);
    if (!stack) return;
    if (isGuestMode) {
      setStacks((prev) => {
        const now = new Date().toISOString();
        const next = prev.map((item) =>
          item.id === stackId ? { ...item, updatedAt: now } : item
        );
        persistGuestStacks(next);
        return next;
      });
      clearDirty(stackId);
      setError(null);
      return;
    }
    try {
      setSaving(stackId, true);
      const payload: StackDraftFields = {
        name: stack.name,
        species: stack.species,
        category: stack.category,
        description: stack.description,
        tags: stack.tags,
        notes: stack.notes
      };
      const updated = (await fetchJson(`/api/research/${stackId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })) as ResearchStack | null;

      if (!updated) {
        throw new Error("Unexpected empty response.");
      }

      setStacks((prev) => prev.map((item) => (item.id === stackId ? updated : item)));
      clearDirty(stackId);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to save stack.");
    } finally {
      setSaving(stackId, false);
    }
  };

  const handleDeleteStack = async (stackId: string) => {
    const stack = stacks.find((item) => item.id === stackId);
    const label = stack?.name ?? "this stack";
    if (!confirm(`Delete “${label}”? This removes all attached notes.`)) return;
    if (isGuestMode) {
      setStacks((prev) => {
        const next = prev.filter((item) => item.id !== stackId);
        persistGuestStacks(next);
        return next;
      });
      clearDirty(stackId);
      setError(null);
      return;
    }
    try {
      await fetchJson(`/api/research/${stackId}`, { method: "DELETE" });
      setStacks((prev) => prev.filter((item) => item.id !== stackId));
      clearDirty(stackId);
      setSaving(stackId, false);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to delete stack.");
    }
  };

  const handleCreateStack = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = createForm.name.trim();
    if (!trimmedName) {
      setError("Stack name is required.");
      return;
    }
    if (isGuestMode) {
      setCreatingStack(true);
      try {
        const now = new Date().toISOString();
        const newStack: ResearchStack = {
          id: generateId(),
          name: trimmedName,
          species: createForm.species.trim() || undefined,
          category: createForm.category.trim() || undefined,
          description: createForm.description.trim() || undefined,
          tags: [],
          notes: [],
          createdAt: now,
          updatedAt: now
        };
        setStacks((prev) => {
          const next = [newStack, ...prev];
          persistGuestStacks(next);
          return next;
        });
        setSelectedStackId(newStack.id);
        clearDirty(newStack.id);
        setCreateForm(defaultCreateForm);
        setCreateOpen(false);
        setError(null);
      } finally {
        setCreatingStack(false);
      }
      return;
    }

    try {
      setCreatingStack(true);
      const payload = {
        name: trimmedName,
        species: createForm.species.trim() || undefined,
        category: createForm.category.trim() || undefined,
        description: createForm.description.trim() || undefined
      };
      const created = (await fetchJson("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })) as ResearchStack | null;

      if (!created) {
        throw new Error("Unexpected empty response.");
      }

      setStacks((prev) => [created, ...prev]);
      setSelectedStackId(created.id);
      clearDirty(created.id);
      setCreateForm(defaultCreateForm);
      setCreateOpen(false);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to create stack.");
    } finally {
      setCreatingStack(false);
    }
  };

  const handleFilterReset = () => {
    setFilter(defaultFilter);
  };

  return (
    <section className={`research-notebook${collapsed ? " is-collapsed" : ""}`} aria-labelledby="research-title">
      <header className="section-header research-header">
        <div>
          <h2 id="research-title">Research Notebook</h2>
          <span className="section-subtitle">
            {statsSubtitle}
            {subtitleHint && <span className="section-subtitle__hint">{subtitleHint}</span>}
          </span>
        </div>
        <div className="section-actions">
          <button
            type="button"
            className="btn btn--icon"
            onClick={handleCollapseToggle}
            aria-expanded={!collapsed}
            aria-controls={contentId}
          >
            <span className="btn__icon" aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
            <span>{collapsed ? "Expand" : "Collapse"}</span>
          </button>
          <button type="button" className="btn btn--primary" onClick={handleToggleCreate}>
            {createOpen ? "Close Form" : "New Stack"}
          </button>
        </div>
      </header>

      {error && <p className="research__error" role="alert">{error}</p>}

      {collapsed ? (
        <div className="research-summary" id={contentId} aria-hidden={collapsed}>
          <div className="research-summary__stats">
            <div className="research-summary__stat">
              <span className="research-summary__value">{totalStacks}</span>
              <span className="research-summary__label">Stacks</span>
            </div>
            <div className="research-summary__stat">
              <span className="research-summary__value">{totalNotes}</span>
              <span className="research-summary__label">Notes</span>
            </div>
            <div className="research-summary__stat">
              <span className="research-summary__value">{distinctIndividuals}</span>
              <span className="research-summary__label">Individuals</span>
            </div>
          </div>
          {loading ? (
            <p className="research__empty">Loading stacks…</p>
          ) : recentStacks.length === 0 ? (
            <p className="research__empty">No stacks yet. Expand to add your first research set.</p>
          ) : (
            <div className="research-summary__list">
              {recentStacks.map((stack) => {
                const isActive = stack.id === selectedStackId;
                return (
                  <button
                    type="button"
                    key={stack.id}
                    className={`research-summary__item${isActive ? " is-active" : ""}`}
                    onClick={() => handleSummarySelect(stack.id)}
                  >
                    <span className="research-summary__item-title">{stack.name}</span>
                    <span className="research-summary__item-meta">
                      {stack.species ?? "Unlabeled"}
                      <span aria-hidden="true"> · </span>
                      {stack.notes.length} note{stack.notes.length === 1 ? "" : "s"}
                      <span aria-hidden="true"> · </span>
                      Updated {formatSummaryDate(stack.updatedAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="research-body" id={contentId}>
          {createOpen && (
            <form className="research-create" onSubmit={handleCreateStack}>
              <div className="field-row">
                <label className="field">
                  <span>Stack name</span>
                  <input
                    type="text"
                    name="stack-name"
                    required
                    value={createForm.name}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Species</span>
                  <input
                    type="text"
                    name="stack-species"
                    value={createForm.species}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, species: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Category</span>
                  <input
                    type="text"
                    name="stack-category"
                    value={createForm.category}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, category: event.target.value }))}
                    placeholder="Species, Individual, Research…"
                  />
                </label>
              </div>
              <label className="field">
                <span>Description</span>
                <textarea
                  rows={2}
                  name="stack-description"
                  value={createForm.description}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Optional overview or instructions for this stack."
                />
              </label>
              <div className="research-create__actions">
                <button type="submit" className="btn btn--primary" disabled={creatingStack}>
                  {creatingStack ? "Creating…" : "Create stack"}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setCreateOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <p className="research__empty">Loading stacks…</p>
          ) : stacks.length === 0 ? (
            <p className="research__empty">
              Start a stack for a species, project, or specific keeper. You can add reusable notes for each individual and duplicate them in seconds.
            </p>
          ) : (
            <div className="research-layout">
              <aside className="research-sidebar">
                <div className="research-sidebar__filters">
                  <label className="field">
                    <span className="sr-only">Search research stacks</span>
                    <input
                      type="search"
                      placeholder="Search species, tags, notes…"
                      value={filter.search}
                      onChange={(event) => setFilter((prev) => ({ ...prev, search: event.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span className="sr-only">Filter by category</span>
                    <select
                      value={filter.category}
                      onChange={(event) =>
                        setFilter((prev) => ({ ...prev, category: event.target.value as StackFilter["category"] }))
                      }
                    >
                      <option value="all">All categories</option>
                      {categories.map((category) => (
                        <option value={category} key={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="btn btn--ghost" onClick={handleFilterReset}>
                    Reset
                  </button>
                </div>

                {filteredStacks.length === 0 ? (
                  <p className="research-sidebar__empty">No stacks match those filters.</p>
                ) : (
                  <ul className="research-stack-list">
                    {filteredStacks.map((stack) => {
                      const isActive = stack.id === selectedStackId;
                      const unsaved = dirtyStacks[stack.id];
                      const saving = savingStacks[stack.id];
                      return (
                        <li key={stack.id}>
                          <button
                            type="button"
                            className={`research-stack${isActive ? " is-active" : ""}`}
                            onClick={() => setSelectedStackId(stack.id)}
                          >
                            <div>
                              <p className="research-stack__name">{stack.name}</p>
                              <p className="research-stack__meta">
                                {[stack.species, stack.category].filter(Boolean).join(" • ") || "No category"}
                              </p>
                            </div>
                            <div className="research-stack__status">
                              <span>
                                {stack.notes.length} note{stack.notes.length === 1 ? "" : "s"}
                              </span>
                              {saving ? (
                                <span className="research-stack__chip">Saving…</span>
                              ) : unsaved ? (
                                <span className="research-stack__chip">Unsaved</span>
                              ) : null}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </aside>

              <div className="research-content" aria-live="polite">
                {!selectedStack ? (
                  <p className="research__empty">Pick a stack to see its notes.</p>
                ) : (
                  <div className="research-detail">
                    <div className="research-detail__header">
                      <div className="field-row">
                        <label className="field">
                          <span>Stack name</span>
                          <input
                            type="text"
                            value={selectedStack.name}
                            onChange={(event) => updateStackFields(selectedStack.id, { name: event.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Species</span>
                          <input
                            type="text"
                            value={selectedStack.species ?? ""}
                            onChange={(event) => updateStackFields(selectedStack.id, { species: event.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Category</span>
                          <input
                            type="text"
                            value={selectedStack.category ?? ""}
                            onChange={(event) => updateStackFields(selectedStack.id, { category: event.target.value })}
                          />
                        </label>
                      </div>
                      <label className="field">
                        <span>Tags</span>
                        <input
                          type="text"
                          value={tagsToInput(selectedStack.tags)}
                          onChange={(event) =>
                            updateStackFields(selectedStack.id, { tags: parseTags(event.target.value) })
                          }
                          placeholder="comma separated: communal, humidity, temperament"
                        />
                      </label>
                      <label className="field">
                        <span>Description</span>
                        <textarea
                          rows={3}
                          value={selectedStack.description ?? ""}
                          onChange={(event) => updateStackFields(selectedStack.id, { description: event.target.value })}
                        />
                      </label>
                      <div className="research-detail__actions">
                        <button
                          type="button"
                          className="btn btn--primary"
                          onClick={() => handleSaveStack(selectedStack.id)}
                          disabled={savingStacks[selectedStack.id] === true || !dirtyStacks[selectedStack.id]}
                        >
                          {savingStacks[selectedStack.id] ? "Saving…" : dirtyStacks[selectedStack.id] ? "Save changes" : "Saved"}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => handleDeleteStack(selectedStack.id)}
                        >
                          Delete stack
                        </button>
                      </div>
                      <div className="research-detail__meta">
                        <span>Last updated {formatTimestamp(selectedStack.updatedAt)}</span>
                        <span>Created {formatTimestamp(selectedStack.createdAt)}</span>
                      </div>
                    </div>

                    <div className="research-notes">
                      <header className="research-notes__header">
                        <h3>Notes</h3>
                        <button type="button" className="btn btn--primary" onClick={() => handleAddNote(selectedStack.id)}>
                          Add note
                        </button>
                      </header>

                      {selectedStack.notes.length === 0 ? (
                        <p className="research__empty">
                          No notes yet. Add individuals, husbandry research, or templates you can reuse for this group.
                        </p>
                      ) : (
                        <ol className="research-note-list">
                          {selectedStack.notes.map((note) => (
                            <li key={note.id} className="research-note">
                              <header className="research-note__header">
                                <input
                                  type="text"
                                  placeholder="Note title"
                                  value={note.title}
                                  onChange={(event) =>
                                    updateNote(selectedStack.id, note.id, { title: event.target.value })
                                  }
                                />
                                <div className="research-note__actions">
                                  <button
                                    type="button"
                                    className="btn btn--subtle"
                                    onClick={() => handleDuplicateNote(selectedStack.id, note.id)}
                                  >
                                    Duplicate
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn--subtle"
                                    onClick={() => handleRemoveNote(selectedStack.id, note.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </header>
                              <div className="research-note__meta">
                                <span>Updated {formatTimestamp(note.updatedAt) || "—"}</span>
                                <span>Created {formatTimestamp(note.createdAt) || "—"}</span>
                              </div>
                              <div className="research-note__grid">
                                <label className="field">
                                  <span>Individual label</span>
                                  <input
                                    type="text"
                                    value={note.individualLabel ?? ""}
                                    onChange={(event) =>
                                      updateNote(selectedStack.id, note.id, {
                                        individualLabel: event.target.value || undefined
                                      })
                                    }
                                    placeholder="Name #1, Male A, Sling γ…"
                                  />
                                </label>
                                <label className="field">
                                  <span>Tags</span>
                                  <input
                                    type="text"
                                    value={tagsToInput(note.tags)}
                                    onChange={(event) =>
                                      updateNote(selectedStack.id, note.id, { tags: parseTags(event.target.value) })
                                    }
                                    placeholder="example: feeding, temperament"
                                  />
                                </label>
                              </div>
                              <label className="field">
                                <span className="sr-only">Notes</span>
                                <textarea
                                  rows={4}
                                  value={note.content}
                                  onChange={(event) =>
                                    updateNote(selectedStack.id, note.id, { content: event.target.value })
                                  }
                                  placeholder="Care adjustments, molt prep research, lineage, venom studies…"
                                />
                              </label>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
