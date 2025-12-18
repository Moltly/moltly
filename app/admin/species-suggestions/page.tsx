import { requireAdminSession } from "@/lib/admin";
import { connectMongoose } from "@/lib/mongoose";
import SpeciesSuggestion from "@/models/SpeciesSuggestion";
import SpeciesSuggestionList from "@/components/admin/SpeciesSuggestionList";
import SuggestionTabs from "@/components/admin/SuggestionTabs";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function SpeciesSuggestionsPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined } | Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { ok } = await requireAdminSession();
  if (!ok) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-xl font-semibold mb-2">Unauthorized</h1>
        <p className="text-[rgb(var(--text-soft))]">You do not have access to this page.</p>
      </div>
    );
  }

  const sp = (await (searchParams as any)) ?? {};
  const modeRaw = typeof sp?.status === "string" ? sp.status : Array.isArray(sp?.status) ? sp.status?.[0] : undefined;
  const mode = (modeRaw || "pending").toLowerCase();
  const allowed: Array<"pending" | "approved" | "rejected" | "removed"> = ["pending", "approved", "rejected", "removed"];
  const status = (allowed as string[]).includes(mode) ? (mode as any) : "pending";

  await connectMongoose();
  const suggestions = await SpeciesSuggestion.find({ status })
    .sort({ submittedAt: -1 })
    .lean();

  const items = suggestions.map((s) => ({
    id: String(s._id),
    fullName: s.fullName,
    genus: s.genus,
    species: s.species,
    subspecies: s.subspecies,
    family: s.family ?? null,
    status: s.status,
    submittedAt: s.submittedAt ?? null,
    submittedBy: (s.submittedBy as any) ?? null,
    reviewedAt: s.reviewedAt ?? null,
    reviewedBy: (s.reviewedBy as any) ?? null,
    reason: s.reason ?? null,
  }));

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-hover))] transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Moltly
        </Link>
      </div>
      <h1 className="text-2xl font-semibold mb-4">Species Suggestions</h1>
      <SuggestionTabs />
      <p className="text-sm text-[rgb(var(--text-soft))] mb-4">
        Approve to add to autocomplete. In Approved, you can remove entries; this will also remove them from autocomplete.
      </p>
      <SpeciesSuggestionList key={status} initial={items} mode={status as any} />
    </div>
  );
}
export const dynamic = "force-dynamic";
export const revalidate = 0;
