"use client";


import { startTransition, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { ExternalLink, ArrowLeft } from "lucide-react";
import CachedImage from "@/components/ui/CachedImage";
import ImageGallery, { type GalleryImage } from "@/components/ui/ImageGallery";

type Entry = { id: string; entryType: string; stage?: "Pre-molt" | "Molt" | "Post-molt"; date: string; attachments?: Array<{ id: string; url: string; name?: string }> };
type Stack = { id: string; name: string; species?: string; description?: string; notes: Array<{ id: string }>; updatedAt: string };
type SpeciesInfo = {
  species: {
    fullName: string;
    genus?: string;
    family?: string;
    author?: string;
    year?: string | number;
    distribution?: string;
    wscUrl?: string;
    wscSearchUrl?: string;
    gbifSpeciesSearchUrl?: string;
    inatObservationsUrl?: string;
  };
  wscTaxon?: Record<string, any> | null;
};

export default function SpeciesProfile({ name }: { name: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<SpeciesInfo | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [tab, setTab] = useState<"history" | "research">("history");
  const [moreGenus, setMoreGenus] = useState<Array<{ fullName: string }>>([]);
  const [moreFamily, setMoreFamily] = useState<Array<{ fullName: string }>>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    let canceled = false;
    startTransition(() => {
      setLoading(true);
      setError(null);
    });
    Promise.all([
      fetch(`/api/species/info?name=${encodeURIComponent(name)}`, { credentials: "include" }).then((r) => r.json().then((j) => ({ ok: r.ok, j })).catch(() => ({ ok: false, j: { error: "Failed" } }))),
      fetch(`/api/logs?species=${encodeURIComponent(name)}`, { credentials: "include" }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/research?species=${encodeURIComponent(name)}`, { credentials: "include" }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([infoRes, entriesRes, stacksRes]: any) => {
      if (canceled) return;
      if (!infoRes.ok) {
        setError(infoRes.j?.error || "Unable to load species.");
      } else {
        setInfo(infoRes.j as SpeciesInfo);
        const genus = (infoRes.j?.species?.genus || "").trim();
        const family = (infoRes.j?.species?.family || "").trim();
        if (genus) {
          fetch(`/api/species/by-genus?genus=${encodeURIComponent(genus)}&limit=50`).then((r) => (r.ok ? r.json() : { items: [] })).then((d) => setMoreGenus((d?.items || []).filter((s: any) => s.fullName !== name))).catch(() => setMoreGenus([]));
        }
        if (family) {
          fetch(`/api/species/by-family?family=${encodeURIComponent(family)}&limit=50`).then((r) => (r.ok ? r.json() : { items: [] })).then((d) => setMoreFamily((d?.items || []).slice(0, 50))).catch(() => setMoreFamily([]));
        }
      }
      setEntries(Array.isArray(entriesRes) ? entriesRes : []);
      setStacks(Array.isArray(stacksRes) ? stacksRes : []);
      setLoading(false);
    });
    return () => {
      canceled = true;
    };
  }, [name]);

  const counts = useMemo(() => {
    let molts = 0;
    let feedings = 0;
    const stages: Record<string, number> = { "Pre-molt": 0, Molt: 0, "Post-molt": 0 };
    entries.forEach((e) => {
      if (e.entryType === "molt") {
        molts += 1;
        if (e.stage && e.stage in stages) stages[e.stage] += 1;
      } else if (e.entryType === "feeding") feedings += 1;
    });
    return { molts, feedings, stages };
  }, [entries]);

  const species = info?.species;
  const wscTaxon = info?.wscTaxon;
  

  return (
    <div className="space-y-4 p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Link href="/" className="px-3 py-2 border border-[rgb(var(--border))] rounded-[var(--radius)] text-sm inline-flex items-center gap-1 hover:bg-[rgb(var(--bg-muted))] shrink-0">
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[rgb(var(--text))] truncate">{species?.fullName || name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {species?.family && <Badge variant="neutral">{species.family}</Badge>}
              {species?.genus && <Badge variant="primary">{species.genus}</Badge>}
              {(species?.author || species?.year) && (<span className="text-sm text-[rgb(var(--text-soft))]">{species?.author} {species?.year}</span>)}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap w-full md:w-auto md:justify-end">
          {species?.wscUrl && (
            <a href={species.wscUrl} target="_blank" rel="noreferrer" className="px-3 py-2 border border-[rgb(var(--border))] rounded-[var(--radius)] text-sm inline-flex items-center gap-1 hover:bg-[rgb(var(--bg-muted))]">
              <ExternalLink className="w-4 h-4" /> Open WSC
            </a>
          )}
          {!species?.wscUrl && species?.wscSearchUrl && (
            <a href={species.wscSearchUrl} target="_blank" rel="noreferrer" className="px-3 py-2 border border-[rgb(var(--border))] rounded-[var(--radius)] text-sm inline-flex items-center gap-1 hover:bg-[rgb(var(--bg-muted))]">
              <ExternalLink className="w-4 h-4" /> Open WSC
            </a>
          )}
          {species?.fullName && (
            <a
              href={`https://www.gbif.org/species/search?q=${encodeURIComponent(species.fullName)}`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 border border-[rgb(var(--border))] rounded-[var(--radius)] text-sm inline-flex items-center gap-1 hover:bg-[rgb(var(--bg-muted))]"
            >
              <ExternalLink className="w-4 h-4" /> GBIF
            </a>
          )}
          {species?.fullName && (
            <a
              href={`https://www.inaturalist.org/observations?taxon_name=${encodeURIComponent(species.fullName)}`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 border border-[rgb(var(--border))] rounded-[var(--radius)] text-sm inline-flex items-center gap-1 hover:bg-[rgb(var(--bg-muted))]"
            >
              <ExternalLink className="w-4 h-4" /> iNat
            </a>
          )}
        </div>
      </div>

      {species?.distribution && (
        <Card className="p-3">
          <div className="text-sm"><span className="font-medium">Distribution:</span> {species.distribution}</div>
        </Card>
      )}

      {wscTaxon && (
        <div className="grid gap-3">
          <Card className="p-3 space-y-2">
              <div>
                <div className="text-sm font-semibold text-[rgb(var(--text))]">World Spider Catalog</div>
                <div className="text-xs text-[rgb(var(--text-soft))]">
                  {wscTaxon.taxonRank ? `${wscTaxon.taxonRank}` : "Taxon"}{wscTaxon.status ? ` • ${wscTaxon.status}` : ""}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div>
                  <div className="text-[rgb(var(--text-soft))] text-xs uppercase">Genus</div>
                  <div className="font-medium">{wscTaxon.genus || "—"}</div>
                </div>
                <div>
                  <div className="text-[rgb(var(--text-soft))] text-xs uppercase">Family</div>
                  <div className="font-medium">{wscTaxon.family || "—"}</div>
                </div>
                {wscTaxon.typeSpecies && (
                  <div className="col-span-2">
                    <div className="text-[rgb(var(--text-soft))] text-xs uppercase">Type species</div>
                    <div className="font-medium">{wscTaxon.typeSpecies}</div>
                  </div>
                )}
                {wscTaxon.remarks && (
                  <div className="col-span-2 text-xs text-[rgb(var(--text-soft))] border-t border-[rgb(var(--border))] pt-2">
                    {wscTaxon.remarks}
                  </div>
                )}
              </div>
              {wscTaxon.referenceObject?.reference && (
                <div className="text-xs text-[rgb(var(--text-soft))] border-t border-[rgb(var(--border))] pt-2 space-y-1">
                  <div className="font-semibold text-[rgb(var(--text))]">Reference</div>
                  <div className="italic">{wscTaxon.referenceObject.reference}</div>
                  {wscTaxon.referenceObject.pageDescription && (
                    <div>Pages: {wscTaxon.referenceObject.pageDescription}</div>
                  )}
                  {wscTaxon.referenceObject.doi && (
                    <a
                      href={wscTaxon.referenceObject.doi.startsWith("http") ? wscTaxon.referenceObject.doi : `https://doi.org/${wscTaxon.referenceObject.doi.replace(/^doi:/i, "").trim()}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[rgb(var(--primary))]"
                    >
                      View DOI
                    </a>
                  )}
                </div>
              )}
          </Card>
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-[rgb(var(--border))]">
        <button className={`px-3 py-2 text-sm ${tab === "history" ? "border-b-2 border-[rgb(var(--primary))] text-[rgb(var(--text))]" : "text-[rgb(var(--text-soft))]"}`} onClick={() => setTab("history")}>
          History
        </button>
        <button className={`px-3 py-2 text-sm ${tab === "research" ? "border-b-2 border-[rgb(var(--primary))] text-[rgb(var(--text))]" : "text-[rgb(var(--text-soft))]"}`} onClick={() => setTab("research")}>
          Research
        </button>
      </div>

      {loading && <div className="text-sm text-[rgb(var(--text-soft))]">Loading…</div>}
      {error && <div className="text-sm text-[rgb(var(--danger-strong))]">{error}</div>}

      {!loading && !error && tab === "history" && (
        <div className="space-y-3">
          <Card className="p-3">
            <div className="text-sm text-[rgb(var(--text))] flex flex-wrap gap-x-6 gap-y-1">
              <div>Molts: <span className="font-medium">{counts.molts}</span></div>
              <div>Feedings: <span className="font-medium">{counts.feedings}</span></div>
              <div>Pre: {counts.stages["Pre-molt"]}</div>
              <div>Molt: {counts.stages.Molt}</div>
              <div>Post: {counts.stages["Post-molt"]}</div>
            </div>
          </Card>

          {entries.some((e: any) => Array.isArray(e.attachments) && e.attachments.length > 0) && (
            <Card className="p-3">
              <div className="text-sm font-semibold mb-2">Photos</div>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {entries.flatMap((e: any) => (e.attachments || []).map((a: any, idx: number) => ({ att: a, key: `${e.id}-${a.id}-${idx}` }))).slice(0, 20).map(({ att, key }, i) => (
                  <button key={key} type="button" className="w-full aspect-square rounded overflow-hidden bg-[rgb(var(--bg-muted))] hover:opacity-90" onClick={() => {
                    const imgs: GalleryImage[] = entries.flatMap((en: any) => (en.attachments || []).map((a: any) => ({ id: a.id, url: a.url, name: a.name })));
                    setGalleryImages(imgs);
                    setGalleryIndex(i);
                    setGalleryOpen(true);
                  }}>
                    <CachedImage src={att.url} alt={att.name || "Attachment"} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-3">
            <div className="text-sm font-semibold mb-2">Timeline</div>
            {entries.length === 0 ? (
              <div className="text-sm text-[rgb(var(--text-soft))]">No entries for this species yet.</div>
            ) : (
              <ul className="space-y-1 text-sm">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between">
                    <span>{e.entryType}{e.stage ? ` • ${e.stage}` : ""}</span>
                    <span className="text-[rgb(var(--text-soft))]">{new Date(e.date).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {(moreGenus.length > 0 || moreFamily.length > 0) && (
            <div className="grid md:grid-cols-2 gap-3">
              {moreGenus.length > 0 && (
                <Card className="p-3">
                  <div className="text-sm font-semibold mb-2">More in genus</div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {moreGenus.slice(0, 20).map((s) => (
                      <Link key={s.fullName} href={`/species/${encodeURIComponent(s.fullName)}`} className="px-2 py-1 rounded bg-[rgb(var(--bg-muted))] hover:bg-[rgb(var(--soft))]">
                        {s.fullName}
                      </Link>
                    ))}
                  </div>
                </Card>
              )}
              {moreFamily.length > 0 && (
                <Card className="p-3">
                  <div className="text-sm font-semibold mb-2">More in family</div>
                  <div className="flex flex-wrap gap-2 text-sm max-h-44 overflow-auto pr-1">
                    {moreFamily.slice(0, 100).map((s) => (
                      <Link key={s.fullName} href={`/species/${encodeURIComponent(s.fullName)}`} className="px-2 py-1 rounded bg-[rgb(var(--bg-muted))] hover:bg-[rgb(var(--soft))]">
                        {s.fullName}
                      </Link>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {!loading && !error && tab === "research" && (
        <div className="space-y-3">
          {stacks.length === 0 ? (
            <Card className="p-3"><div className="text-sm text-[rgb(var(--text-soft))]">No research stacks for this species yet.</div></Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {stacks.map((s) => (
                <Card key={s.id} className="p-3">
                  <div className="font-semibold text-[rgb(var(--text))] truncate">{s.name}</div>
                  {s.description && (<div className="text-sm text-[rgb(var(--text-soft))] mt-1 line-clamp-3">{s.description}</div>)}
                  <div className="text-xs text-[rgb(var(--text-subtle))] mt-2">{s.notes?.length || 0} note{s.notes?.length === 1 ? "" : "s"} • Updated {new Date(s.updatedAt).toLocaleDateString()}</div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <ImageGallery open={galleryOpen} images={galleryImages} index={galleryIndex} onClose={() => setGalleryOpen(false)} onIndexChange={setGalleryIndex} />
    </div>
  );
}
