"use client";

import Button from "@/components/ui/Button";
import { useEffect, useState, useTransition } from "react";

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

export default function SpeciesSuggestionList({ initial, mode }: { initial: Item[]; mode: Mode }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [isPending, startTransition] = useTransition();

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

  if (items.length === 0) {
    return <div className="text-[rgb(var(--text-soft))]">No entries.</div>;
  }

  return (
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
