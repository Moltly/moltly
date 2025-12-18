"use client";

import Button from "@/components/ui/Button";
import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";

type Item = {
  id: string;
  fullName: string;
  genus?: string;
  species?: string;
  subspecies?: string;
  family?: string | null;
  status?: Mode;
  submittedAt?: string | Date | null;
  submittedBy?: string | null;
  reviewedAt?: string | Date | null;
  reviewedBy?: string | null;
  reason?: string | null;
};

type Mode = "pending" | "approved" | "rejected" | "removed";

type EditForm = {
  fullName: string;
  genus: string;
  species: string;
  subspecies: string;
  family: string;
};

export default function SpeciesSuggestionList({ initial, mode }: { initial: Item[]; mode: Mode }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [isPending, startTransition] = useTransition();
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ fullName: "", genus: "", species: "", subspecies: "", family: "" });
  const [isSaving, setIsSaving] = useState(false);

  // Reset items when server-provided initial data or mode changes
  useEffect(() => {
    startTransition(() => setItems(initial));
  }, [initial, mode, startTransition]);

  async function act(id: string, action: "approve" | "reject" | "remove") {
    try {
      const res = await fetch(`/api/species/suggestions/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        console.error("Action failed", await res.text());
        return;
      }
      startTransition(() => {
        setItems((prev) => prev.filter((x) => x.id !== id));
      });
    } catch (err) {
      console.error(err);
    }
  }

  function openEdit(item: Item) {
    setEditForm({
      fullName: item.fullName || "",
      genus: item.genus || "",
      species: item.species || "",
      subspecies: item.subspecies || "",
      family: item.family || "",
    });
    setEditingItem(item);
  }

  function closeEdit() {
    setEditingItem(null);
    setEditForm({ fullName: "", genus: "", species: "", subspecies: "", family: "" });
  }

  async function saveEdit() {
    if (!editingItem) return;
    if (!editForm.fullName.trim()) {
      alert("Full name is required");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/species/suggestions/${editingItem.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          fullName: editForm.fullName.trim(),
          genus: editForm.genus.trim() || undefined,
          species: editForm.species.trim() || undefined,
          subspecies: editForm.subspecies.trim() || undefined,
          family: editForm.family.trim() || undefined,
        }),
      });
      if (!res.ok) {
        console.error("Edit failed", await res.text());
        setIsSaving(false);
        return;
      }
      // Update local state
      startTransition(() => {
        setItems((prev) =>
          prev.map((x) =>
            x.id === editingItem.id
              ? {
                ...x,
                fullName: editForm.fullName.trim(),
                genus: editForm.genus.trim() || undefined,
                species: editForm.species.trim() || undefined,
                subspecies: editForm.subspecies.trim() || undefined,
                family: editForm.family.trim() || null,
              }
              : x
          )
        );
      });
      closeEdit();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }

  if (items.length === 0) {
    return <div className="text-[rgb(var(--text-soft))]">No entries.</div>;
  }

  return (
    <>
      <div className="space-y-3">
        {items.map((s) => (
          <div key={s.id} className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] rounded-[var(--radius)] p-3 flex items-center justify-between gap-3 opacity-100">
            <div>
              <div className="font-medium">{s.fullName}</div>
              <div className="text-xs text-[rgb(var(--text-soft))]">
                {s.genus || "?"} {s.species || ""} {s.subspecies || ""} {s.family ? `• ${s.family}` : ""}
              </div>
              <MetaLines item={s} />
            </div>
            {mode === "pending" && (
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={() => openEdit(s)}>
                  Edit
                </Button>
                <Button type="button" variant="primary" size="sm" disabled={isPending} onClick={() => act(s.id, "approve")}>
                  Approve
                </Button>
                <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={() => act(s.id, "reject")}>
                  Reject
                </Button>
              </div>
            )}
            {mode === "approved" && (
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={() => openEdit(s)}>
                  Edit
                </Button>
                <Button type="button" variant="danger" size="sm" disabled={isPending} onClick={() => act(s.id, "remove")}>
                  Remove
                </Button>
              </div>
            )}
            {(mode === "rejected" || mode === "removed") && (
              <div className="flex items-center gap-2">
                <Button type="button" variant="primary" size="sm" disabled={isPending} onClick={() => act(s.id, "approve")}>
                  Approve
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeEdit}>
          <div
            className="bg-[rgb(var(--background))] border border-[rgb(var(--border))] rounded-[var(--radius)] p-4 w-full max-w-md shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Edit Species Suggestion</h2>
              <button onClick={closeEdit} className="text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))]">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] focus:outline-none focus:border-[rgb(var(--primary))]"
                  placeholder="e.g. Brachypelma hamorii"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Genus</label>
                  <input
                    type="text"
                    value={editForm.genus}
                    onChange={(e) => setEditForm((f) => ({ ...f, genus: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] focus:outline-none focus:border-[rgb(var(--primary))]"
                    placeholder="Brachypelma"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Species</label>
                  <input
                    type="text"
                    value={editForm.species}
                    onChange={(e) => setEditForm((f) => ({ ...f, species: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] focus:outline-none focus:border-[rgb(var(--primary))]"
                    placeholder="hamorii"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Subspecies</label>
                  <input
                    type="text"
                    value={editForm.subspecies}
                    onChange={(e) => setEditForm((f) => ({ ...f, subspecies: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] focus:outline-none focus:border-[rgb(var(--primary))]"
                    placeholder="(optional)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Family</label>
                  <input
                    type="text"
                    value={editForm.family}
                    onChange={(e) => setEditForm((f) => ({ ...f, family: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] focus:outline-none focus:border-[rgb(var(--primary))]"
                    placeholder="Theraphosidae"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button type="button" variant="secondary" onClick={closeEdit} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={saveEdit} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MetaLines({ item }: { item: Item }) {
  const submittedAt = item.submittedAt ? new Date(item.submittedAt) : null;
  const reviewedAt = item.reviewedAt ? new Date(item.reviewedAt) : null;
  return (
    <div className="mt-1 space-y-0.5 text-[11px] text-[rgb(var(--text-subtle))]">
      {submittedAt && (
        <div>
          Submitted: {isNaN(submittedAt.getTime()) ? String(item.submittedAt) : submittedAt.toLocaleString()} {item.submittedBy ? `• by ${truncate(String(item.submittedBy), 28)}` : ""}
        </div>
      )}
      {reviewedAt && (
        <div>
          Reviewed: {isNaN(reviewedAt.getTime()) ? String(item.reviewedAt) : reviewedAt.toLocaleString()} {item.reviewedBy ? `• by ${truncate(String(item.reviewedBy), 28)}` : ""}
        </div>
      )}
      {item.reason && <div>Reason: {truncate(item.reason, 120)}</div>}
    </div>
  );
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

