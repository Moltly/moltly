"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import SpeciesAutosuggest from "@/components/ui/SpeciesAutosuggest";
import type { SpecimenSex } from "@/types/molt";

interface NewSpecimenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; species?: string; sex?: SpecimenSex; notes?: string }) => Promise<void>;
}

export default function NewSpecimenModal({ isOpen, onClose, onSave }: NewSpecimenModalProps) {
  const formId = "new-specimen-form";
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");
  const [sex, setSex] = useState<SpecimenSex | "">("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName("");
      setSpecies("");
      setSex("");
      setNotes("");
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Specimen name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: trimmedName,
        species: species.trim() || undefined,
        sex: sex || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create specimen.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-[rgb(var(--surface))] rounded-t-2xl sm:rounded-2xl border border-[rgb(var(--border))] shadow-[var(--shadow-lg)] max-h-[85dvh] flex flex-col animate-slide-up sm:animate-fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgb(var(--border))]">
          <h2 className="text-lg font-semibold text-[rgb(var(--text))]">New Specimen</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-[rgb(var(--bg-muted))]">
            <X className="w-5 h-5 text-[rgb(var(--text-soft))]" />
          </button>
        </div>

        <form id={formId} onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-[var(--radius)] bg-[rgb(var(--danger-soft))] text-[rgb(var(--danger))] text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
              Name <span className="text-[rgb(var(--danger))]">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rosie"
              maxLength={160}
              autoFocus
              enterKeyHint="done"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">Species</label>
            <SpeciesAutosuggest
              value={species}
              onChange={setSpecies}
              placeholder="e.g. Brachypelma hamorii"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">Sex</label>
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value as SpecimenSex | "")}
              className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]"
            >
              <option value="">Not specified</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Unknown">Unknown</option>
              <option value="Unsexed">Unsexed</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this specimen..."
              maxLength={2000}
              rows={3}
              className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] resize-none"
            />
          </div>

        </form>

        <div className="border-t border-[rgb(var(--border))] p-4 bg-[rgb(var(--surface))]">
          <div className="flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button form={formId} type="submit" variant="primary" className="flex-1" disabled={saving || !name.trim()}>
              {saving ? "Creating..." : "Create Specimen"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
