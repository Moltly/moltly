"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Input from "@/components/ui/Input";

type Suggestion = {
  fullName: string;
  genus?: string;
  species?: string;
  subspecies?: string;
  family?: string;
  speciesId?: number;
  species_lsid?: string;
};

interface SpeciesAutosuggestProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  required?: boolean;
}

export default function SpeciesAutosuggest({ value, onChange, placeholder, required }: SpeciesAutosuggestProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const q = useMemo(() => value.trim(), [value]);

  useEffect(() => {
    if (!q || q.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/species/suggest?q=${encodeURIComponent(q)}&limit=8`, { credentials: "include" });
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setItems(Array.isArray(data.suggestions) ? data.suggestions : []);
        setOpen((Array.isArray(data.suggestions) ? data.suggestions.length : 0) > 0);
        setHighlight(0);
      } catch {
        setItems([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const apply = (s: Suggestion) => {
    onChange(s.fullName);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      apply(items[highlight] ?? items[0]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <Input
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (items.length > 0) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="species-suggest-list"
      />
      {open && items.length > 0 && (
        <div
          id="species-suggest-list"
          className="absolute z-50 mt-1 w-full rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-[var(--shadow-lg)] max-h-64 overflow-auto"
          role="listbox"
        >
          {items.map((s, idx) => (
            <button
              key={`${s.fullName}-${idx}`}
              type="button"
              role="option"
              aria-selected={idx === highlight}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => apply(s)}
              className={`w-full text-left px-3 py-2 text-sm ${
                idx === highlight ? "bg-[rgb(var(--primary-soft))] text-[rgb(var(--primary-strong))]" : "hover:bg-[rgb(var(--soft))]"
              }`}
            >
              <div className="font-medium truncate">{s.fullName}</div>
              {(s.family || s.genus) && (
                <div className="text-[rgb(var(--text-soft))] truncate">
                  {s.family ? `${s.family} • ` : ""}
                  {s.genus}
                </div>
              )}
            </button>
          ))}
          {loading && (
            <div className="px-3 py-2 text-sm text-[rgb(var(--text-soft))]">Searching…</div>
          )}
        </div>
      )}
    </div>
  );
}

