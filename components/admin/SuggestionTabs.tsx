"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function SuggestionTabs() {
  const sp = useSearchParams();
  const status = (sp.get("status") || "pending").toLowerCase();

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 rounded-[var(--radius)] border ` +
    (active
      ? "bg-[rgb(var(--primary-soft))] border-[rgb(var(--primary))] text-[rgb(var(--primary-strong))]"
      : "border-[rgb(var(--border))] text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))]");

  return (
    <div className="flex items-center gap-2 mb-3 text-sm">
      <Link href="/admin/species-suggestions?status=pending" className={tabClass(status === "pending")}>Pending</Link>
      <Link href="/admin/species-suggestions?status=approved" className={tabClass(status === "approved")}>Approved</Link>
      <Link href="/admin/species-suggestions?status=rejected" className={tabClass(status === "rejected")}>Rejected</Link>
      <Link href="/admin/species-suggestions?status=removed" className={tabClass(status === "removed")}>Removed</Link>
    </div>
  );
}

