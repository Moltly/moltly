"use client";


import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { X, Info, ExternalLink, Copy } from "lucide-react";

type SpeciesInfo = {
  species: {
    fullName: string;
    genus?: string;
    species?: string;
    subspecies?: string;
    family?: string;
    author?: string;
    year?: string | number;
    parentheses?: string | number;
    distribution?: string;
    speciesId?: number | string;
    species_lsid?: string;
    wscSearchUrl?: string;
    lsidUrl?: string;
  };
  user?: {
    totalMolts: number;
    totalFeedings: number;
    stageCounts: Record<string, number>;
    firstMoltDate: string | null;
    lastMoltDate: string | null;
    yearMolts: number;
    attachmentsCount: number;
    recent: Array<{ entryType: string; stage: string | null; date: string }>;
  } | null;
  wscTaxon?: Record<string, any> | null;
};

function getWscSearchUrl(species?: SpeciesInfo["species"] | null) {
  const name = species?.fullName?.trim();
  if (!name) return null;
  return `https://wsc.nmbe.ch/search?q=${encodeURIComponent(name)}`;
}

interface SpeciesQuickLookProps {
  open: boolean;
  name: string;
  onClose: () => void;
}

export default function SpeciesQuickLook({ open, name, onClose }: SpeciesQuickLookProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SpeciesInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let canceled = false;
    setLoading(true);
    setError(null);
    setData(null);
    (async () => {
      try {
        const res = await fetch(`/api/species/info?name=${encodeURIComponent(name)}`, { credentials: "include" });
        const json = await res.json();
        if (canceled) return;
        if (!res.ok) {
          setError(json?.error || "Failed to load species info.");
          return;
        }
        setData(json as SpeciesInfo);
      } catch (e) {
        if (!canceled) setError("Failed to load species info.");
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [open, name]);

  const quickFacts = useMemo(() => {
    if (!data?.species) return "";
    const s = data.species;
    const wscSearchUrl = getWscSearchUrl(s);
    const lines = [
      s.family ? `Family: ${s.family}` : null,
      s.author || s.year ? `Authority: ${[s.author, s.year].filter(Boolean).join(" ")}` : null,
      s.distribution ? `Distribution: ${s.distribution}` : null,
      s.species_lsid ? `LSID: ${s.species_lsid}` : null,
      wscSearchUrl ? `WSC: ${wscSearchUrl}` : null,
    ].filter(Boolean) as string[];
    return lines.join("\n");
  }, [data]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setSaveMsg("Copied to clipboard.");
      setTimeout(() => setSaveMsg(null), 1200);
    } catch {}
  }

  async function handleSaveToNotebook() {
    if (!data?.species) return;
    setSaving(true);
    setSaveMsg(null);
    const s = data.species;
    const noteTitle = `WSC Quick Facts — ${s.fullName}`;
    const noteBody = `${s.fullName}\n\n${quickFacts}`;
    const payload = {
      name: `${s.fullName} Research`,
      species: s.fullName,
      description: s.distribution ? `Distribution: ${s.distribution}` : undefined,
      tags: [],
      notes: [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: noteTitle,
          content: noteBody,
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          externalSource: "moltly",
          entryType: "text",
        },
      ],
    };
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        let message = "Unable to save. Sign in to use Notebook.";
        try {
          const json = JSON.parse(txt);
          if (json?.error) message = json.error;
        } catch {}
        setSaveMsg(message);
        return;
      }
      setSaveMsg("Saved to Notebook.");
      setTimeout(() => setSaveMsg(null), 1500);
    } catch {
      setSaveMsg("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const species = data?.species || null;
  const wscSearchUrl = species ? getWscSearchUrl(species) : null;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-end md:items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true">
      <Card className="w-full max-w-2xl rounded-[var(--radius)] overflow-hidden animate-slide-down">
        <div className="flex items-center justify-between p-3 border-b border-[rgb(var(--border))]">
          <div className="flex items-center gap-2 text-[rgb(var(--text))]">
            <Info className="w-4 h-4" />
            <span className="font-semibold truncate max-w-[70vw] md:max-w-none">{data?.species?.fullName || name}</span>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-[rgb(var(--soft))] rounded" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {loading && <div className="text-sm text-[rgb(var(--text-soft))]">Loading…</div>}
          {error && <div className="text-sm text-[rgb(var(--danger-strong))]">{error}</div>}

          {species && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                {species.family && <Badge variant="neutral">{species.family}</Badge>}
                {species.genus && <Badge variant="primary">{species.genus}</Badge>}
                {species.author || species.year ? (
                  <span className="text-sm text-[rgb(var(--text-soft))]">
                    {species.author} {species.year}
                  </span>
                ) : null}
              </div>
              {species.distribution && (
                <div className="text-sm text-[rgb(var(--text))]">
                  <span className="font-medium">Distribution:</span> {species.distribution}
                </div>
              )}
              {species.species_lsid && (
                <div className="text-sm text-[rgb(var(--text))] break-all">
                  <span className="font-medium">LSID:</span> {species.species_lsid}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {(species as any).wscUrl && (
                  <a
                    href={(species as any).wscUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius)] border border-[rgb(var(--border))] hover:bg-[rgb(var(--bg-muted))] text-sm"
                  >
                    <ExternalLink className="w-4 h-4" /> Open WSC
                  </a>
                )}
                {!(species as any).wscUrl && wscSearchUrl && (
                  <a
                    href={wscSearchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius)] border border-[rgb(var(--border))] hover:bg-[rgb(var(--bg-muted))] text-sm"
                  >
                    <ExternalLink className="w-4 h-4" /> Open WSC
                  </a>
                )}
                <a
                  href={`https://www.gbif.org/species/search?q=${encodeURIComponent(species.fullName)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius)] border border-[rgb(var(--border))] hover:bg-[rgb(var(--bg-muted))] text-sm"
                >
                  <ExternalLink className="w-4 h-4" /> GBIF
                </a>
                <a
                  href={`https://www.inaturalist.org/observations?taxon_name=${encodeURIComponent(species.fullName)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius)] border border-[rgb(var(--border))] hover:bg-[rgb(var(--bg-muted))] text-sm"
                >
                  <ExternalLink className="w-4 h-4" /> iNat
                </a>
                <button
                  type="button"
                  onClick={() => copy(species.fullName)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius)] border border-[rgb(var(--border))] hover:bg-[rgb(var(--bg-muted))] text-sm"
                >
                  <Copy className="w-4 h-4" /> Copy name
                </button>
                {species.species_lsid && (
                  <button
                    type="button"
                    onClick={() => copy(species.species_lsid!)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius)] border border-[rgb(var(--border))] hover:bg-[rgb(var(--bg-muted))] text-sm"
                  >
                    <Copy className="w-4 h-4" /> Copy LSID
                  </button>
                )}
                <a
                  href={`/species/${encodeURIComponent(species.fullName)}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius)] border border-[rgb(var(--border))] hover:bg-[rgb(var(--bg-muted))] text-sm"
                >
                  Open profile
                </a>
                <button
                  type="button"
                  onClick={() => void handleSaveToNotebook()}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius)] border border-[rgb(var(--border))] hover:bg-[rgb(var(--bg-muted))] text-sm"
                >
                  {saving ? "Saving…" : "Save to Notebook"}
                </button>
              </div>
            </div>
          )}

          {data?.wscTaxon && (
            <div className="pt-2 border-t border-[rgb(var(--border))] text-xs text-[rgb(var(--text))] space-y-1">
              <div className="text-sm font-semibold text-[rgb(var(--text))]">World Spider Catalog</div>
              <div>Status: <span className="font-medium">{data.wscTaxon.status || "—"}</span></div>
              {data.wscTaxon.taxonRank && <div>Rank: <span className="font-medium">{data.wscTaxon.taxonRank}</span></div>}
              {data.wscTaxon.referenceObject?.reference && (
                <div className="text-[rgb(var(--text-soft))] italic">
                  {data.wscTaxon.referenceObject.reference}
                  {data.wscTaxon.referenceObject?.pageDescription ? ` (p. ${data.wscTaxon.referenceObject.pageDescription})` : ""}
                </div>
              )}
            </div>
          )}

          {/* No iNaturalist/GBIF API usage — WSC only */}

          {data?.user && (
            <div className="pt-2 border-t border-[rgb(var(--border))]">
              <div className="text-sm font-semibold mb-2 text-[rgb(var(--text))]">Your history</div>
              <div className="text-sm text-[rgb(var(--text))] flex flex-wrap gap-x-6 gap-y-1">
                <div>Molts: <span className="font-medium">{data.user.totalMolts}</span></div>
                <div>Feedings: <span className="font-medium">{data.user.totalFeedings}</span></div>
                <div>Attachments: <span className="font-medium">{data.user.attachmentsCount}</span></div>
                {data.user.firstMoltDate && (
                  <div>First molt: <span className="font-medium">{new Date(data.user.firstMoltDate).toLocaleDateString()}</span></div>
                )}
                {data.user.lastMoltDate && (
                  <div>Last molt: <span className="font-medium">{new Date(data.user.lastMoltDate).toLocaleDateString()}</span></div>
                )}
              </div>
              {data.user.recent?.length > 0 && (
                <div className="mt-2 text-xs text-[rgb(var(--text-soft))]">
                  Recent activity:
                  <ul className="list-disc ml-5 mt-1 space-y-0.5">
                    {data.user.recent.map((r, i) => (
                      <li key={i}>{r.entryType}{r.stage ? ` • ${r.stage}` : ""} — {new Date(r.date).toLocaleDateString()}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {saveMsg && <div className="text-xs text-[rgb(var(--text-soft))]">{saveMsg}</div>}
        </div>
      </Card>
    </div>
  );
}
