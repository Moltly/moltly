"use client";

import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Info, Printer, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { cn } from "@/lib/utils";

type SpecimenForLabel = {
  specimen: string;
  species?: string;
};

type SpecimenQrModalProps = {
  isOpen: boolean;
  onClose: () => void;
  specimens: SpecimenForLabel[];
  ownerId?: string;
};

const applyTokens = (template: string, specimen: SpecimenForLabel, index: number) =>
  template
    .replace(/{{\s*specimen\s*}}/gi, specimen.specimen)
    .replace(/{{\s*species\s*}}/gi, specimen.species ?? "Unknown")
    .replace(/{{\s*index\s*}}/gi, String(index + 1));

export default function SpecimenQrModal({ isOpen, onClose, specimens, ownerId }: SpecimenQrModalProps) {
  const [search, setSearch] = useState("");
  const [labelSize, setLabelSize] = useState<"1" | "1.5">("1");
  const [includeSpecimenName, setIncludeSpecimenName] = useState(true);
  const [includeSpecies, setIncludeSpecies] = useState(true);
  const [includeMoltlyTag, setIncludeMoltlyTag] = useState(true);
  const [includePrintedText, setIncludePrintedText] = useState(true);
  const [collectionTag, setCollectionTag] = useState("");
  const [extraLines, setExtraLines] = useState("");
  const appOrigin = useMemo(() => {
    if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
    return "https://moltly.xyz";
  }, []);

  const uniqueSpecimens = useMemo(() => {
    const map = new Map<string, SpecimenForLabel>();
    specimens.forEach((s) => {
      const key = (s.specimen || "Unnamed").trim() || "Unnamed";
      const species = (s.species ?? "").trim();
      if (!map.has(key)) {
        map.set(key, { specimen: key, species: species || undefined });
      } else if (!map.get(key)!.species && species) {
        map.set(key, { specimen: key, species });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.specimen.localeCompare(b.specimen));
  }, [specimens]);

  const filteredSpecimens = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return uniqueSpecimens;
    return uniqueSpecimens.filter(
      (s) =>
        s.specimen.toLowerCase().includes(q) ||
        (s.species ? s.species.toLowerCase().includes(q) : false)
    );
  }, [uniqueSpecimens, search]);

  const buildLink = useCallback(
    (specimen: SpecimenForLabel, index: number) => {
      const url = new URL("/", appOrigin);
      url.searchParams.set("view", "specimens");
      url.searchParams.set("specimen", specimen.specimen);
      if (ownerId) url.searchParams.set("owner", ownerId);
      if (includeSpecies && specimen.species) url.searchParams.set("species", specimen.species);
      if (collectionTag.trim()) {
        url.searchParams.set("tag", applyTokens(collectionTag, specimen, index));
      }
      if (extraLines.trim()) {
        const note = extraLines
          .split("\n")
          .map((l) => applyTokens(l, specimen, index).trim())
          .filter(Boolean)
          .join(" | ")
          .slice(0, 240);
        if (note) url.searchParams.set("note", note);
      }
      return url.toString();
    },
    [appOrigin, collectionTag, extraLines, includeSpecies, ownerId]
  );

  const previewPayload =
    filteredSpecimens.length > 0
      ? buildLink(filteredSpecimens[0], 0)
      : "Nothing to print. Add specimens or loosen your filters.";

  const cssVars: CSSProperties = {
    ["--qr-label-size" as string]: labelSize === "1" ? "1in" : "1.5in",
    ["--qr-label-gap" as string]: labelSize === "1" ? "0.1in" : "0.12in",
    ["--qr-label-padding" as string]: labelSize === "1" ? "0.08in" : "0.12in",
    ["--qr-page-padding" as string]: labelSize === "1" ? "0.35in" : "0.3in",
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center px-3 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-labels-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl max-h-[90vh] bg-[rgb(var(--surface))] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] border border-[rgb(var(--border))] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[rgb(var(--border))]">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-[rgb(var(--text-subtle))]">Export</p>
            <h2 id="qr-labels-title" className="text-xl font-bold text-[rgb(var(--text))]">
              QR labels for specimens
            </h2>
            <p className="text-sm text-[rgb(var(--text-soft))]">
              One QR code per specimen. Each QR links back to Moltly with that specimen pre-selected; text below the code keeps stickers readable.
            </p>
            {ownerId && (
              <p className="text-xs text-[rgb(var(--text-subtle))]">
                Owner tag will be embedded as <code>owner={ownerId}</code> to avoid collisions.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-[var(--radius)] text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))]"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[320px,1fr] gap-4 flex-1 min-h-0">
          <div className="p-4 space-y-4 overflow-y-auto">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[rgb(var(--text))]">Filter specimens</label>
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by specimen or species"
              />
              <p className="text-xs text-[rgb(var(--text-subtle))]">
                Rendering {filteredSpecimens.length} of {uniqueSpecimens.length} specimens.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-[rgb(var(--text))]">Label size</label>
                <span className="text-xs text-[rgb(var(--text-subtle))]">
                  Matches common 1&quot; (Avery 5418) and 1.5&quot; sheets.
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["1", "1.5"] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setLabelSize(size)}
                    className={cn(
                      "w-full px-3 py-2 rounded-[var(--radius)] border text-sm font-medium transition-colors",
                      labelSize === size
                        ? "border-[rgb(var(--primary))] bg-[rgb(var(--primary-soft))] text-[rgb(var(--primary-strong))]"
                        : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))]"
                    )}
                  >
                    {size === "1" ? '1"' : '1.5"'} square
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-[rgb(var(--text))]">Sticker text & URL params</p>
              <div className="space-y-1.5 text-sm text-[rgb(var(--text))]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[rgb(var(--border))]"
                    checked={includeSpecimenName}
                    onChange={(e) => setIncludeSpecimenName(e.target.checked)}
                  />
                  <span>Show specimen name under QR</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[rgb(var(--border))]"
                    checked={includeSpecies}
                    onChange={(e) => setIncludeSpecies(e.target.checked)}
                  />
                  <span>Include species (URL + sticker)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[rgb(var(--border))]"
                    checked={includeMoltlyTag}
                    onChange={(e) => setIncludeMoltlyTag(e.target.checked)}
                  />
                  <span>Show “Moltly specimen” text under QR</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[rgb(var(--border))]"
                    checked={includePrintedText}
                    onChange={(e) => setIncludePrintedText(e.target.checked)}
                  />
                  <span>Show text under the QR on the sticker</span>
                </label>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-[rgb(var(--text))]">
                  Vendor/collection tag (optional)
                </label>
                <Input
                  type="text"
                  value={collectionTag}
                  onChange={(e) => setCollectionTag(e.target.value)}
                  placeholder="e.g. Rack A · Vendor lot 42 (supports {{specimen}}, {{species}}, {{index}})"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-[rgb(var(--text))]">
                  Extra lines in QR URL only (one per line)
                </label>
                <textarea
                  className="textarea text-sm"
                  rows={3}
                  value={extraLines}
                  onChange={(e) => setExtraLines(e.target.value)}
                  placeholder="Optional free-form note; supports {{specimen}}, {{species}}, {{index}} tokens."
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[rgb(var(--text-subtle))] flex items-center gap-1">
                  <Info className="w-4 h-4" />
                  QR link example (first label):
                </p>
                <pre className="text-xs bg-[rgb(var(--bg-muted))] border border-[rgb(var(--border))] rounded-[var(--radius)] p-3 whitespace-pre-wrap leading-snug text-[rgb(var(--text))]">
                  {previewPayload}
                </pre>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                size="sm"
                className="flex-1 min-w-[140px]"
                onClick={() => window.print()}
              >
                <Printer className="w-4 h-4" /> Print sheet
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="min-w-[120px]"
                onClick={onClose}
              >
                Close
              </Button>
            </div>
          </div>

          <div className="p-4 bg-[rgb(var(--bg-muted))] border-l border-[rgb(var(--border))] overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-[rgb(var(--text))]">Print preview</p>
                <p className="text-xs text-[rgb(var(--text-subtle))]">
                  {filteredSpecimens.length} labels • {labelSize === "1" ? '1"' : '1.5"'} squares • Page padding adjusts automatically.
                </p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => window.print()}>
                <Printer className="w-4 h-4" /> Print
              </Button>
            </div>

            <div
              className="qr-print-area"
              style={{
                ...cssVars,
                gridTemplateColumns: "repeat(auto-fit, minmax(var(--qr-label-size), var(--qr-label-size)))",
              }}
            >
              <div
                className="grid w-full"
                style={{
                  gridTemplateColumns: "repeat(auto-fit, minmax(var(--qr-label-size), var(--qr-label-size)))",
                  gap: "var(--qr-label-gap)",
                }}
              >
                {filteredSpecimens.length === 0 ? (
                  <div className="text-sm text-[rgb(var(--text-soft))]">
                    No specimens match this filter.
                  </div>
                ) : (
                  filteredSpecimens.map((specimen, idx) => {
                    const payload = buildLink(specimen, idx);
                    const printedLines = [
                      includeMoltlyTag ? "Moltly specimen" : null,
                      includeSpecimenName ? specimen.specimen : null,
                      includeSpecies ? specimen.species || "Unknown" : null,
                      collectionTag ? applyTokens(collectionTag, specimen, idx) : null,
                    ].filter(Boolean) as string[];
                    return (
                      <div
                        key={`${specimen.specimen}-${idx}`}
                        className="bg-white border border-[rgb(var(--border))] rounded-[var(--radius-sm)] shadow-[var(--shadow-sm)] flex flex-col items-center justify-between overflow-hidden"
                        style={{
                          width: "var(--qr-label-size)",
                          height: "var(--qr-label-size)",
                          padding: "var(--qr-label-padding)",
                          gap: "0.1in",
                        }}
                      >
                        <div className="flex items-center justify-center w-full" style={{ maxHeight: "calc(var(--qr-label-size) - 0.4in)" }}>
                          <QRCodeSVG
                            value={payload}
                            size={512}
                            includeMargin={false}
                            style={{ width: "100%", height: "100%", maxHeight: "100%" }}
                          />
                        </div>
                        {includePrintedText && (
                          <div className="w-full text-center leading-tight">
                            {printedLines.map((line, lineIdx) => (
                              <div
                                key={`${specimen.specimen}-line-${lineIdx}`}
                                className={cn(
                                  "truncate text-[10px] text-[rgb(var(--text))]",
                                  lineIdx === 0 ? "font-semibold" : "text-[rgb(var(--text-soft))]"
                                )}
                                title={line}
                              >
                                {line}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <style jsx global>{`
          @media print {
            body {
              background: white;
            }
            body * {
              visibility: hidden;
            }
            .qr-print-area,
            .qr-print-area * {
              visibility: visible;
            }
            .qr-print-area {
              position: absolute;
              inset: 0;
              margin: 0;
              padding: var(--qr-page-padding, 0.35in);
              background: white;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
