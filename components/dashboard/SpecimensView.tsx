"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp, Activity, Calendar, Bell, Droplets, HeartPulse, Egg, QrCode, Search, Edit2, X, Archive, ArchiveRestore, Upload, ImagePlus, Trash2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import CachedImage from "@/components/ui/CachedImage";
import { MoltEntry, SpecimenDashboard, SizeUnit, Specimen } from "@/types/molt";
import type { HealthEntry } from "@/types/health";
import type { BreedingEntry } from "@/types/breeding";
import { formatDate, getReminderStatus, cn, cmToInches } from "@/lib/utils";
import SpecimenQrModal from "@/components/dashboard/SpecimenQrModal";
import { ActionButton, useActionButtons } from "@/hooks/useActionButtons";
import ActionButtonsEditor from "./ActionButtonsEditor";
import MarkdownRenderer from "@/components/ui/MarkdownRenderer";

interface SpecimensViewProps {
  entries: MoltEntry[];
  specimens?: Specimen[];
  covers?: Record<string, string>;
  healthEntries?: HealthEntry[];
  breedingEntries?: BreedingEntry[];
  onQuickAction?: (specimenId: string | undefined, specimen: string, species: string | undefined, action: string) => void;
  onEdit?: (entry: MoltEntry) => void;
  onArchive?: (specimenId: string, archived: boolean, reason?: string) => Promise<void>;
  onUpdateCover?: (specimenId: string, imageUrl: string | null) => Promise<void>;
  initialFocusSpecimen?: string;
  readOnly?: boolean;
  ownerId?: string;
  sizeUnit: SizeUnit;
}

type LinkedBreedingEntry = {
  entry: BreedingEntry;
  role: "Female" | "Male";
  partner?: string;
};

type SpecimenCardDashboard = SpecimenDashboard & {
  _healthCount: number;
  _breedingCount: number;
  _latestHealthEntry: HealthEntry | null;
  _recentHealthEntries: HealthEntry[];
  _recentBreedingEntries: LinkedBreedingEntry[];
  _duplicateNameCount: number;
  _duplicateNameIndex: number;
  _sex?: Specimen["sex"];
  _notes?: string;
  _createdAt?: string;
};

function getHealthConditionVariant(condition?: HealthEntry["condition"]): "success" | "warning" | "danger" | "neutral" {
  switch (condition) {
    case "Stable":
      return "success";
    case "Observation":
      return "warning";
    case "Critical":
      return "danger";
    default:
      return "neutral";
  }
}

function getBreedingStatusVariant(status?: BreedingEntry["status"]): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "Successful":
      return "success";
    case "Observation":
      return "warning";
    case "Failed":
      return "danger";
    default:
      return "neutral";
  }
}

export default function SpecimensView({ entries, specimens = [], covers, healthEntries = [], breedingEntries = [], onQuickAction, onEdit, onArchive, onUpdateCover, initialFocusSpecimen, readOnly, ownerId, sizeUnit }: SpecimensViewProps) {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [showQrModal, setShowQrModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const { sortedButtons, buttons, addCustomButton, removeButton, toggleButton, trackUsage } = useActionButtons();
  const [editorOpen, setEditorOpen] = useState(false);
  const [uploadingCoverId, setUploadingCoverId] = useState<string | null>(null);
  const hasFocusedRef = useRef(false);

  // Handle cover image upload for a specimen
  const handleCoverUpload = async (specimenId: string, files: FileList | null) => {
    if (!files || files.length === 0 || !onUpdateCover) return;

    setUploadingCoverId(specimenId);
    try {
      const form = new FormData();
      form.append("file", files[0]);

      const res = await fetch("/api/upload", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        throw new Error(`Upload failed: ${errorBody || res.status}`);
      }

      const payload = (await res.json()) as { attachments: Array<{ url: string }> };
      const imageUrl = payload.attachments?.[0]?.url;

      if (imageUrl) {
        await onUpdateCover(specimenId, imageUrl);
      }
    } catch (error) {
      console.error("Cover upload failed:", error);
      alert("Failed to upload cover image. Please try again.");
    } finally {
      setUploadingCoverId(null);
    }
  };



  const formatSize = (value?: number) => {
    if (value === undefined || value === null) return "?";
    const converted = sizeUnit === "in" ? cmToInches(value) : value;
    return Number((Math.round(converted * 100) / 100).toFixed(2)).toString();
  };

  const specimenDashboards = useMemo(() => {
    const specimenDataById = new Map<string, Specimen>();
    const specimenIdsByName = new Map<string, string[]>();
    const specimenIdsByNameSpecies = new Map<string, string[]>();
    const duplicateNameCountById = new Map<string, number>();
    const duplicateNameIndexById = new Map<string, number>();

    for (const spec of specimens) {
      specimenDataById.set(spec.id, spec);
      const byName = specimenIdsByName.get(spec.name) ?? [];
      byName.push(spec.id);
      specimenIdsByName.set(spec.name, byName);

      const speciesKey = `${spec.name}::${spec.species ?? ""}`;
      const byNameSpecies = specimenIdsByNameSpecies.get(speciesKey) ?? [];
      byNameSpecies.push(spec.id);
      specimenIdsByNameSpecies.set(speciesKey, byNameSpecies);
    }

    for (const [name, ids] of specimenIdsByName.entries()) {
      const ordered = [...ids].sort((a, b) => {
        const aDate = specimenDataById.get(a)?.createdAt ?? "";
        const bDate = specimenDataById.get(b)?.createdAt ?? "";
        return aDate.localeCompare(bDate);
      });
      ordered.forEach((id, index) => {
        duplicateNameCountById.set(id, ordered.length);
        duplicateNameIndexById.set(id, index + 1);
      });
    }

    const resolveExplicitCover = (key: string, specimenName: string, specimenId?: string) => {
      const specimenCover = specimenId ? specimenDataById.get(specimenId)?.imageUrl : undefined;
      return specimenCover ?? covers?.[specimenName] ?? covers?.[key];
    };

    const resolveDashboardKey = (specimenId?: string, specimenName?: string, species?: string) => {
      if (specimenId) {
        return specimenDataById.has(specimenId) ? specimenId : `missing:${specimenId}`;
      }

      const trimmedName = (specimenName ?? "").trim();
      if (!trimmedName) return undefined;

      const exactIds = specimenIdsByNameSpecies.get(`${trimmedName}::${species ?? ""}`) ?? [];
      if (exactIds.length === 1) return exactIds[0];

      const sameNameIds = specimenIdsByName.get(trimmedName) ?? [];
      if (sameNameIds.length === 1) return sameNameIds[0];
      if (sameNameIds.length === 0) return trimmedName;
      return undefined;
    };

    const buildLegacyDashboardKey = (prefix: string, specimenName?: string, species?: string) => {
      const trimmedName = specimenName?.trim() || "Unnamed";
      return `${prefix}:${trimmedName}::${species ?? ""}`;
    };

    const dashboardMap = new Map<string, SpecimenCardDashboard>();
    const previewSpecimen = readOnly && specimens.length === 1 ? specimens[0] : undefined;
    const normalizedPreviewIdentity = initialFocusSpecimen?.trim().toLowerCase();

    const ensureDashboard = (
      key: string,
      specimenName: string,
      species?: string,
      linkedSpecimen?: Specimen,
      specimenId?: string
    ) => {
      if (!dashboardMap.has(key)) {
        dashboardMap.set(key, {
          key,
          specimenId: linkedSpecimen?.id ?? specimenId,
          specimen: linkedSpecimen?.name ?? specimenName,
          species: linkedSpecimen?.species ?? species,
          imageUrl: resolveExplicitCover(key, linkedSpecimen?.name ?? specimenName, linkedSpecimen?.id ?? specimenId),
          totalMolts: 0,
          totalFeedings: 0,
          stageCounts: { "Pre-molt": 0, Molt: 0, "Post-molt": 0 },
          lastMoltDate: null,
          firstMoltDate: null,
          averageIntervalDays: null,
          lastIntervalDays: null,
          yearMolts: 0,
          attachmentsCount: 0,
          reminder: null,
          recentEntries: [],
          latestEntry: null,
          archived: linkedSpecimen?.archived ?? false,
          archivedAt: linkedSpecimen?.archivedAt,
          archivedReason: linkedSpecimen?.archivedReason,
          _healthCount: 0,
          _breedingCount: 0,
          _latestHealthEntry: null,
          _recentHealthEntries: [],
          _recentBreedingEntries: [],
          _duplicateNameCount: linkedSpecimen ? duplicateNameCountById.get(linkedSpecimen.id) ?? 1 : 1,
          _duplicateNameIndex: linkedSpecimen ? duplicateNameIndexById.get(linkedSpecimen.id) ?? 1 : 1,
          _sex: linkedSpecimen?.sex,
          _notes: linkedSpecimen?.notes,
          _createdAt: linkedSpecimen?.createdAt,
        });
      }

      return dashboardMap.get(key)!;
    };

    for (const spec of specimens) {
      ensureDashboard(spec.id, spec.name, spec.species, spec, spec.id);
    }

    for (const entry of entries) {
      const key = resolveDashboardKey(entry.specimenId, entry.specimen, entry.species) ?? entry.specimen ?? "Unnamed";
      const linkedSpecimen = entry.specimenId ? specimenDataById.get(entry.specimenId) : undefined;
      const specimenName = linkedSpecimen?.name ?? entry.specimen ?? "Unnamed";

      const dashboard = ensureDashboard(key, specimenName, entry.species, linkedSpecimen, entry.specimenId);

      if (entry.entryType === "molt") {
        dashboard.totalMolts++;
        if (entry.stage) {
          dashboard.stageCounts[entry.stage]++;
        }

        const entryDate = new Date(entry.date);
        const currentYear = new Date().getFullYear();
        if (entryDate.getFullYear() === currentYear) {
          dashboard.yearMolts++;
        }

        if (!dashboard.lastMoltDate || new Date(entry.date) > new Date(dashboard.lastMoltDate)) {
          dashboard.lastMoltDate = entry.date;
        }

        if (!dashboard.firstMoltDate || new Date(entry.date) < new Date(dashboard.firstMoltDate)) {
          dashboard.firstMoltDate = entry.date;
        }
      }

      if (entry.entryType === "feeding") {
        dashboard.totalFeedings++;
      }

      if (entry.attachments) {
        dashboard.attachmentsCount += entry.attachments.length;
      }

      if (entry.reminderDate) {
        const status = getReminderStatus(entry.reminderDate);
        if (!dashboard.reminder || new Date(entry.reminderDate) < new Date(dashboard.reminder.date!)) {
          dashboard.reminder = {
            tone: status || "upcoming",
            label: formatDate(entry.reminderDate),
            date: entry.reminderDate,
          };
        }
      }

      dashboard.recentEntries.push(entry);
      if (!dashboard.latestEntry || new Date(entry.createdAt) > new Date(dashboard.latestEntry.createdAt)) {
        dashboard.latestEntry = entry;
      }
    }

    for (const entry of healthEntries) {
      if (!entry.specimenId && entry.manualSpecimen && !entry.detachedSpecimen) {
        continue;
      }
      const linkedSpecimen = entry.specimenId ? specimenDataById.get(entry.specimenId) : undefined;
      const specimenName = entry.specimen?.trim();
      const resolvedKey = entry.detachedSpecimen
        ? (entry.specimenId ? resolveDashboardKey(entry.specimenId, entry.specimen, entry.species) : undefined)
        : resolveDashboardKey(entry.specimenId, entry.specimen, entry.species);
      const key =
        resolvedKey ??
        (entry.specimenId ? `missing:${entry.specimenId}` : buildLegacyDashboardKey("health", specimenName, entry.species));
      const dashboard = ensureDashboard(
        key,
        linkedSpecimen?.name ?? specimenName ?? "Unnamed",
        entry.species,
        linkedSpecimen,
        entry.specimenId
      );
      dashboard._healthCount += 1;
      dashboard._recentHealthEntries.push(entry);
      if (!dashboard._latestHealthEntry || new Date(entry.date) > new Date(dashboard._latestHealthEntry.date)) {
        dashboard._latestHealthEntry = entry;
      }
    }

    const attachBreedingEntry = (
      resolvedKey: string | undefined,
      specimenName: string | undefined,
      specimenId: string | undefined,
      role: "Female" | "Male",
      partner: string | undefined,
      entry: BreedingEntry
    ) => {
      const fallbackName = specimenName?.trim();
      const linkedSpecimen = specimenId ? specimenDataById.get(specimenId) : undefined;
      if (previewSpecimen) {
        const isVisibleLinkedSpecimen = Boolean(linkedSpecimen && linkedSpecimen.id === previewSpecimen.id);
        const matchesPreviewByName =
          !specimenId &&
          fallbackName?.toLowerCase() === previewSpecimen.name.toLowerCase() &&
          (!entry.species || !previewSpecimen.species || entry.species === previewSpecimen.species);
        if (!isVisibleLinkedSpecimen && !matchesPreviewByName) {
          return;
        }
      } else if (readOnly && normalizedPreviewIdentity) {
        const matchesPreviewIdentity =
          (specimenId && specimenId.toLowerCase() === normalizedPreviewIdentity) ||
          (fallbackName && fallbackName.toLowerCase() === normalizedPreviewIdentity);
        if (!matchesPreviewIdentity) {
          return;
        }
      }
      if (!resolvedKey && !fallbackName) {
        return;
      }
      const key =
        resolvedKey ??
        (specimenId ? `missing:${specimenId}` : buildLegacyDashboardKey(`breeding-${role.toLowerCase()}`, fallbackName, entry.species));
      const dashboard = ensureDashboard(
        key,
        linkedSpecimen?.name ?? fallbackName ?? "Unnamed",
        entry.species,
        linkedSpecimen,
        specimenId
      );
      dashboard._breedingCount += 1;
      dashboard._recentBreedingEntries.push({ entry, role, partner });
    };

    for (const entry of breedingEntries) {
      if (
        (!entry.femaleSpecimenId && entry.manualFemaleSpecimen && !entry.detachedFemaleSpecimen) &&
        (!entry.maleSpecimenId && entry.manualMaleSpecimen && !entry.detachedMaleSpecimen)
      ) {
        continue;
      }
      if (entry.femaleSpecimenId || !entry.manualFemaleSpecimen || entry.detachedFemaleSpecimen) {
        attachBreedingEntry(
          entry.detachedFemaleSpecimen
            ? (entry.femaleSpecimenId ? resolveDashboardKey(entry.femaleSpecimenId, entry.femaleSpecimen, entry.species) : undefined)
            : resolveDashboardKey(entry.femaleSpecimenId, entry.femaleSpecimen, entry.species),
          entry.femaleSpecimen,
          entry.femaleSpecimenId,
          "Female",
          entry.maleSpecimen,
          entry
        );
      }
      if (entry.maleSpecimenId || !entry.manualMaleSpecimen || entry.detachedMaleSpecimen) {
        attachBreedingEntry(
          entry.detachedMaleSpecimen
            ? (entry.maleSpecimenId ? resolveDashboardKey(entry.maleSpecimenId, entry.maleSpecimen, entry.species) : undefined)
            : resolveDashboardKey(entry.maleSpecimenId, entry.maleSpecimen, entry.species),
          entry.maleSpecimen,
          entry.maleSpecimenId,
          "Male",
          entry.femaleSpecimen,
          entry
        );
      }
    }

    dashboardMap.forEach((dashboard) => {
      dashboard.recentEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const moltDates = dashboard.recentEntries
        .filter((entry) => entry.entryType === "molt")
        .map((entry) => new Date(entry.date).getTime())
        .sort((a, b) => b - a);

      if (moltDates.length >= 2) {
        const intervals: number[] = [];
        for (let index = 0; index < moltDates.length - 1; index += 1) {
          intervals.push((moltDates[index] - moltDates[index + 1]) / (1000 * 60 * 60 * 24));
        }

        dashboard.lastIntervalDays = Math.round(intervals[0]);
        dashboard.averageIntervalDays = Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length);
      }

      dashboard.recentEntries = dashboard.recentEntries.slice(0, 5);
      dashboard._recentHealthEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      dashboard._recentHealthEntries = dashboard._recentHealthEntries.slice(0, 3);
      dashboard._recentBreedingEntries.sort(
        (a, b) => new Date(b.entry.pairingDate).getTime() - new Date(a.entry.pairingDate).getTime()
      );
      dashboard._recentBreedingEntries = dashboard._recentBreedingEntries.slice(0, 3);
      dashboard.imageUrl = resolveExplicitCover(dashboard.key, dashboard.specimen, dashboard.specimenId);
    });

    return Array.from(dashboardMap.values()).sort((a, b) => a.specimen.localeCompare(b.specimen)) as SpecimenCardDashboard[];
  }, [entries, specimens, covers, healthEntries, breedingEntries, readOnly, initialFocusSpecimen]);

  // Filter specimens by search query and archive status
  const filteredDashboards = useMemo(() => {
    let result = specimenDashboards;

    // Filter by archive status
    if (!showArchived) {
      result = result.filter((d) => !d.archived);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.specimen.toLowerCase().includes(q) ||
          (d.species && d.species.toLowerCase().includes(q))
      );
    }

    return result;
  }, [specimenDashboards, searchQuery, showArchived]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const expandAll = () => {
    setExpandedKeys(filteredDashboards.map((d) => d.key));
  };

  const collapseAll = () => {
    setExpandedKeys([]);
  };

  useEffect(() => {
    if (!initialFocusSpecimen || hasFocusedRef.current) return;
    const normalizedInitialFocus = initialFocusSpecimen.trim().toLowerCase();
    const match = specimenDashboards.find((d) => {
      const keyMatches = d.key.trim().toLowerCase() === normalizedInitialFocus;
      const nameMatches = d.specimen.trim().toLowerCase() === normalizedInitialFocus;
      return keyMatches || nameMatches;
    });
    if (match) {
      hasFocusedRef.current = true;
      queueMicrotask(() => {
        setExpandedKeys((prev) => (prev.includes(match.key) ? prev : [...prev, match.key]));
      });
      requestAnimationFrame(() => {
        const el = document.getElementById(`specimen-${encodeURIComponent(match.key)}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [initialFocusSpecimen, specimenDashboards]);

  if (specimenDashboards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-[rgb(var(--primary-soft))] flex items-center justify-center mb-4">
          <TrendingUp className="w-10 h-10 text-[rgb(var(--primary))]" />
        </div>
        <h2 className="text-2xl font-bold text-[rgb(var(--text))] mb-2">
          No specimens yet
        </h2>
        <p className="text-[rgb(var(--text-soft))] max-w-md mb-4">
          Add your first specimen to start tracking profiles.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {readOnly && (
          <div className="p-3 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--bg-muted))] text-sm text-[rgb(var(--text))]">
            Read-only preview. Sign in as the owner to edit or log care for this specimen.
          </div>
        )}
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-subtle))]" />
          <Input
            placeholder="Search by specimen or species..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {/* Header Actions */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <p className="text-sm text-[rgb(var(--text-soft))]">
              {filteredDashboards.length} {filteredDashboards.length === 1 ? "specimen" : "specimens"}
            </p>
            {searchQuery && filteredDashboards.length !== specimenDashboards.length && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-xs text-[rgb(var(--primary))] hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <label className="flex items-center gap-1.5 text-sm text-[rgb(var(--text-soft))] cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="w-4 h-4 rounded border-[rgb(var(--border))] text-[rgb(var(--primary))] focus:ring-[rgb(var(--primary))] focus:ring-offset-0"
              />
              <Archive className="w-3.5 h-3.5" />
              Show archived
            </label>
            <Button variant="secondary" size="sm" onClick={() => setShowQrModal(true)} className="whitespace-nowrap">
              <QrCode className="w-4 h-4" /> QR labels
            </Button>
            <Button variant="ghost" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>
              Collapse All
            </Button>
          </div>
        </div>

        {/* Specimen Cards */}
        <div className="space-y-3 pb-4">
          {filteredDashboards.map((dashboard) => {
            const isExpanded = expandedKeys.includes(dashboard.key);

            return (
              <Card key={dashboard.key} id={`specimen-${encodeURIComponent(dashboard.key)}`} className="overflow-hidden">
                {/* Card Header - Always Visible */}
                <button
                  onClick={() => toggleExpand(dashboard.key)}
                  className="w-full p-4 text-left hover:bg-[rgb(var(--bg-muted))] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    {dashboard.imageUrl && (
                      <div className="w-12 h-12 rounded overflow-hidden bg-[rgb(var(--bg-muted))] shrink-0">
                        <CachedImage
                          src={dashboard.imageUrl}
                          alt={`${dashboard.specimen} photo`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg text-[rgb(var(--text))] truncate">
                          {dashboard.specimen}
                        </h3>
                        {dashboard._duplicateNameCount > 1 && (
                          <Badge variant="warning" className="shrink-0">
                            {dashboard._duplicateNameIndex} of {dashboard._duplicateNameCount}
                          </Badge>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-[rgb(var(--text-soft))] shrink-0" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-[rgb(var(--text-soft))] shrink-0" />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {dashboard.species && (
                          <p className="text-sm text-[rgb(var(--text-soft))] italic">
                            <a href={`/species/${encodeURIComponent(dashboard.species)}`} className="hover:underline">
                              {dashboard.species}
                            </a>
                          </p>
                        )}
                        {dashboard._sex && dashboard._sex !== "Unknown" && (
                          <span className="text-xs text-[rgb(var(--text-subtle))]">
                            {dashboard._sex}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <Badge variant="primary">
                          {dashboard.totalMolts} {dashboard.totalMolts === 1 ? "molt" : "molts"}
                        </Badge>
                        <Badge variant="success">
                          {dashboard.totalFeedings}{" "}
                          {dashboard.totalFeedings === 1 ? "feeding" : "feedings"}
                        </Badge>
                        {dashboard._healthCount > 0 && (
                          <Badge variant="warning">
                            <HeartPulse className="w-3 h-3" /> {dashboard._healthCount} health
                          </Badge>
                        )}
                        {dashboard._breedingCount > 0 && (
                          <Badge variant="neutral">
                            <Egg className="w-3 h-3" /> {dashboard._breedingCount} breeding
                          </Badge>
                        )}
                        {dashboard.attachmentsCount > 0 && (
                          <Badge variant="neutral">
                            {dashboard.attachmentsCount}{" "}
                            {dashboard.attachmentsCount === 1 ? "photo" : "photos"}
                          </Badge>
                        )}
                        {dashboard.archived && (
                          <Badge variant="warning">
                            <Archive className="w-3 h-3" /> Archived
                            {dashboard.archivedReason && ` (${dashboard.archivedReason})`}
                          </Badge>
                        )}
                        {onQuickAction && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="px-2 py-1 text-xs"
                            onClick={(e) => { e.stopPropagation(); onQuickAction(dashboard.specimenId, dashboard.specimen, dashboard.species, ""); }}
                            title="Log a quick note"
                          >
                            log action
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-[rgb(var(--border))] p-4 space-y-4 animate-slide-down">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-[var(--radius)] bg-[rgb(var(--bg-muted))]">
                        <p className="text-xs text-[rgb(var(--text-soft))] mb-1">
                          This Year
                        </p>
                        <p className="text-xl font-bold text-[rgb(var(--text))]">
                          {dashboard.yearMolts}
                        </p>
                        <p className="text-xs text-[rgb(var(--text-subtle))]">molts</p>
                      </div>
                      <div className="p-3 rounded-[var(--radius)] bg-[rgb(var(--bg-muted))]">
                        <p className="text-xs text-[rgb(var(--text-soft))] mb-1">
                          Avg. Interval
                        </p>
                        <p className="text-xl font-bold text-[rgb(var(--text))]">
                          {dashboard.averageIntervalDays ?? "—"}
                        </p>
                        <p className="text-xs text-[rgb(var(--text-subtle))]">days</p>
                      </div>
                      <div className="p-3 rounded-[var(--radius)] bg-[rgb(var(--bg-muted))]">
                        <p className="text-xs text-[rgb(var(--text-soft))] mb-1">
                          Last Interval
                        </p>
                        <p className="text-xl font-bold text-[rgb(var(--text))]">
                          {dashboard.lastIntervalDays ?? "—"}
                        </p>
                        <p className="text-xs text-[rgb(var(--text-subtle))]">days</p>
                      </div>
                      <div className="p-3 rounded-[var(--radius)] bg-[rgb(var(--bg-muted))]">
                        <p className="text-xs text-[rgb(var(--text-soft))] mb-1">
                          Last Molt
                        </p>
                        <p className="text-lg font-bold text-[rgb(var(--text))]">
                          {dashboard.lastMoltDate ? formatDate(dashboard.lastMoltDate) : "—"}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="p-3 rounded-[var(--radius)] bg-[rgb(var(--bg-muted))]">
                        <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--text-subtle))]">
                          Profile
                        </p>
                        <div className="mt-2 space-y-2 text-sm text-[rgb(var(--text))]">
                          {dashboard._duplicateNameCount > 1 && (
                            <p>
                              This is specimen {dashboard._duplicateNameIndex} of {dashboard._duplicateNameCount} named {dashboard.specimen}.
                            </p>
                          )}
                          {dashboard._createdAt && (
                            <p className="text-[rgb(var(--text-soft))]">
                              Created {formatDate(dashboard._createdAt)}
                            </p>
                          )}
                          {dashboard._notes ? (
                            <div className="text-sm leading-relaxed text-[rgb(var(--text-soft))]">
                              <MarkdownRenderer>{dashboard._notes}</MarkdownRenderer>
                            </div>
                          ) : (
                            <p className="text-[rgb(var(--text-soft))]">
                              Use health and breeding logs to build a fuller specimen profile here.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="p-3 rounded-[var(--radius)] bg-[rgb(var(--bg-muted))]">
                        <div className="flex items-center gap-2">
                          <HeartPulse className="w-4 h-4 text-[rgb(var(--warning))]" />
                          <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--text-subtle))]">
                            Health Snapshot
                          </p>
                        </div>
                        {dashboard._latestHealthEntry ? (
                          <div className="mt-2 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={getHealthConditionVariant(dashboard._latestHealthEntry.condition)}>
                                {dashboard._latestHealthEntry.condition}
                              </Badge>
                              <span className="text-xs text-[rgb(var(--text-subtle))]">
                                {formatDate(dashboard._latestHealthEntry.date)}
                              </span>
                            </div>
                            {dashboard._latestHealthEntry.healthIssues && (
                              <p className="text-sm text-[rgb(var(--text))]">{dashboard._latestHealthEntry.healthIssues}</p>
                            )}
                            {dashboard._latestHealthEntry.treatment && (
                              <p className="text-xs text-[rgb(var(--text-soft))]">
                                Treatment: {dashboard._latestHealthEntry.treatment}
                              </p>
                            )}
                            {dashboard._latestHealthEntry.followUpDate && (
                              <p className="text-xs text-[rgb(var(--text-soft))]">
                                Follow-up {formatDate(dashboard._latestHealthEntry.followUpDate)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-[rgb(var(--text-soft))]">
                            No linked health logs yet.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Stage Breakdown */}
                    <div>
                      <p className="text-sm font-medium text-[rgb(var(--text))] mb-2">
                        Stage Breakdown
                      </p>
                      <div className="flex gap-2">
                        <Badge variant="neutral">
                          Pre: {dashboard.stageCounts["Pre-molt"]}
                        </Badge>
                        <Badge variant="primary">
                          Molt: {dashboard.stageCounts.Molt}
                        </Badge>
                        <Badge variant="success">
                          Post: {dashboard.stageCounts["Post-molt"]}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <HeartPulse className="w-4 h-4 text-[rgb(var(--warning))]" />
                          <p className="text-sm font-medium text-[rgb(var(--text))]">
                            Recent Health Notes
                          </p>
                        </div>
                        {dashboard._recentHealthEntries.length > 0 ? (
                          <div className="space-y-2">
                            {dashboard._recentHealthEntries.map((entry) => (
                              <div key={entry.id} className="rounded-[var(--radius)] bg-[rgb(var(--bg-muted))] p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={getHealthConditionVariant(entry.condition)}>{entry.condition}</Badge>
                                  <span className="text-xs text-[rgb(var(--text-subtle))]">{formatDate(entry.date)}</span>
                                </div>
                                {entry.healthIssues && (
                                  <p className="mt-2 text-sm text-[rgb(var(--text))]">{entry.healthIssues}</p>
                                )}
                                {entry.behavior && (
                                  <p className="mt-1 text-xs text-[rgb(var(--text-soft))]">Behavior: {entry.behavior}</p>
                                )}
                                {entry.notes && (
                                  <div className="mt-2 text-xs text-[rgb(var(--text-soft))]">
                                    <MarkdownRenderer>{entry.notes}</MarkdownRenderer>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-[rgb(var(--text-soft))]">
                            Health tracking linked to this specimen will appear here.
                          </p>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Egg className="w-4 h-4 text-[rgb(var(--text-soft))]" />
                          <p className="text-sm font-medium text-[rgb(var(--text))]">
                            Breeding Context
                          </p>
                        </div>
                        {dashboard._recentBreedingEntries.length > 0 ? (
                          <div className="space-y-2">
                            {dashboard._recentBreedingEntries.map(({ entry, role, partner }) => (
                              <div key={`${dashboard.key}-${entry.id}-${role}`} className="rounded-[var(--radius)] bg-[rgb(var(--bg-muted))] p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={getBreedingStatusVariant(entry.status)}>{entry.status}</Badge>
                                  <Badge variant="neutral">{role}</Badge>
                                  <span className="text-xs text-[rgb(var(--text-subtle))]">
                                    {formatDate(entry.pairingDate)}
                                  </span>
                                </div>
                                {partner && (
                                  <p className="mt-2 text-sm text-[rgb(var(--text))]">
                                    Paired with {partner}
                                  </p>
                                )}
                                <div className="mt-1 flex flex-wrap gap-2 text-xs text-[rgb(var(--text-soft))]">
                                  {entry.eggSacStatus && <span>Egg sac: {entry.eggSacStatus}</span>}
                                  {typeof entry.slingCount === "number" && <span>Slings: {entry.slingCount}</span>}
                                  {entry.followUpDate && <span>Follow-up {formatDate(entry.followUpDate)}</span>}
                                </div>
                                {(entry.pairingNotes || entry.notes) && (
                                  <div className="mt-2 text-xs text-[rgb(var(--text-soft))]">
                                    <MarkdownRenderer>{entry.pairingNotes || entry.notes || ""}</MarkdownRenderer>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-[rgb(var(--text-soft))]">
                            Linked breeding pairings will appear here.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Reminder */}
                    {dashboard.reminder && (
                      <div className="p-3 rounded-[var(--radius)] bg-[rgb(var(--bg-muted))] flex items-center gap-2">
                        <Bell className="w-4 h-4 text-[rgb(var(--primary))]" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-[rgb(var(--text))]">
                            Reminder Set
                          </p>
                          <p className="text-xs text-[rgb(var(--text-soft))]">
                            {dashboard.reminder.label}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Quick Actions (care notes) */}
                    {onQuickAction && (
                      <ActionButtons
                        specimenId={dashboard.specimenId}
                        specimen={dashboard.specimen}
                        species={dashboard.species}
                        onQuickAction={onQuickAction}
                        buttons={sortedButtons}
                        onTrackUsage={trackUsage}
                        onOpenEditor={() => setEditorOpen(true)}
                      />
                    )}

                    {/* Recent Activity */}
                    <div>
                      <p className="text-sm font-medium text-[rgb(var(--text))] mb-2">
                        Recent Activity
                      </p>
                      <div className="space-y-2">
                        {dashboard.recentEntries.map((entry) => (
                          <div
                            key={entry.id}
                            className={cn(
                              "flex items-center gap-3 p-2 rounded-[var(--radius)] bg-[rgb(var(--bg-muted))]",
                              onEdit && !readOnly && "cursor-pointer hover:bg-[rgb(var(--bg-muted))]/80 transition-colors"
                            )}
                            onClick={onEdit && !readOnly ? () => onEdit(entry) : undefined}
                            role={onEdit && !readOnly ? "button" : undefined}
                            tabIndex={onEdit && !readOnly ? 0 : undefined}
                            onKeyDown={onEdit && !readOnly ? (e) => { if (e.key === "Enter" || e.key === " ") onEdit(entry); } : undefined}
                          >
                            <div className={cn(
                              "p-1.5 rounded-[var(--radius-sm)]",
                              entry.entryType === "molt"
                                ? "bg-[rgb(var(--primary-soft))] text-[rgb(var(--primary))]"
                                : entry.entryType === "feeding"
                                  ? "bg-[rgb(var(--success-soft))] text-[rgb(var(--success))]"
                                  : "bg-[rgb(var(--bg-muted))] text-[rgb(var(--text-soft))]"
                            )}>
                              {entry.entryType === "molt" ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : entry.entryType === "feeding" ? (
                                <Activity className="w-3 h-3" />
                              ) : (
                                <Droplets className="w-3 h-3" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-[rgb(var(--text))]">
                                  {entry.entryType === "molt" ? "Molt" : entry.entryType === "feeding" ? "Feeding" : entry.entryType === "water" ? "Water" : entry.entryType}
                                </span>
                                {entry.stage && (
                                  <Badge variant="neutral" className="text-xs">
                                    {entry.stage}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-[rgb(var(--text-subtle))]">
                                <Calendar className="w-3 h-3" />
                                <span>{formatDate(entry.date)}</span>
                              </div>
                              {entry.entryType === "water" && entry.notes && (
                                <div className="text-xs text-[rgb(var(--text))] truncate"><MarkdownRenderer>{entry.notes}</MarkdownRenderer></div>
                              )}
                            </div>
                            {entry.oldSize && entry.newSize && (
                              <span className="text-xs text-[rgb(var(--text-soft))] whitespace-nowrap">
                                {formatSize(entry.oldSize)} → {formatSize(entry.newSize)} {sizeUnit}
                              </span>
                            )}
                            {onEdit && !readOnly && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={(e) => { e.stopPropagation(); onEdit(entry); }}
                                title="Edit entry"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Cover Image Management */}
                    {onUpdateCover && dashboard.specimenId && !readOnly && (
                      <div>
                        <p className="text-sm font-medium text-[rgb(var(--text))] mb-2">
                          Cover Image
                        </p>
                        <div className="flex items-start gap-4">
                          {dashboard.imageUrl ? (
                            <div className="relative group w-24 h-24 rounded-[var(--radius)] overflow-hidden bg-[rgb(var(--bg-muted))] flex-shrink-0">
                              <CachedImage
                                src={dashboard.imageUrl}
                                alt="Cover"
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                <label className="cursor-pointer p-1.5 rounded bg-[rgb(var(--surface))] hover:bg-[rgb(var(--primary-soft))] text-[rgb(var(--text))] transition-colors" title="Change cover">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleCoverUpload(dashboard.specimenId!, e.target.files)}
                                    disabled={uploadingCoverId === dashboard.specimenId}
                                  />
                                  <Upload className="w-4 h-4" />
                                </label>
                                <button
                                  type="button"
                                  className="p-1.5 rounded bg-[rgb(var(--surface))] hover:bg-[rgb(var(--danger-soft))] text-[rgb(var(--danger))] transition-colors"
                                  onClick={() => onUpdateCover(dashboard.specimenId!, null)}
                                  title="Remove cover"
                                  disabled={uploadingCoverId === dashboard.specimenId}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              {uploadingCoverId === dashboard.specimenId && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                </div>
                              )}
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center w-24 h-24 rounded-[var(--radius)] border-2 border-dashed border-[rgb(var(--border))] hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--primary-soft))]/20 cursor-pointer transition-colors group">
                              {uploadingCoverId === dashboard.specimenId ? (
                                <div className="w-6 h-6 border-2 border-[rgb(var(--primary-soft))] border-t-[rgb(var(--primary))] rounded-full animate-spin" />
                              ) : (
                                <>
                                  <ImagePlus className="w-6 h-6 text-[rgb(var(--text-soft))] group-hover:text-[rgb(var(--primary))] mb-1" />
                                  <span className="text-[10px] text-[rgb(var(--text-soft))] group-hover:text-[rgb(var(--primary))] font-medium">Upload</span>
                                </>
                              )}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleCoverUpload(dashboard.specimenId!, e.target.files)}
                                disabled={uploadingCoverId === dashboard.specimenId}
                              />
                            </label>
                          )}
                          <div className="flex-1 text-xs text-[rgb(var(--text-soft))] pt-1">
                            <p>
                              Set a cover image to identify this specimen. Valid formats: JPG, PNG, WEBP.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Archive Management */}
                    {onArchive && dashboard.specimenId && !readOnly && (
                      <div className="pt-2 border-t border-[rgb(var(--border))]">
                        {dashboard.archived ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            disabled={archivingId === dashboard.specimenId}
                            onClick={async () => {
                              if (!dashboard.specimenId) return;
                              setArchivingId(dashboard.specimenId);
                              try {
                                await onArchive(dashboard.specimenId, false);
                              } finally {
                                setArchivingId(null);
                              }
                            }}
                          >
                            <ArchiveRestore className="w-3.5 h-3.5" />
                            {archivingId === dashboard.specimenId ? "Restoring..." : "Restore from Archive"}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-xs text-[rgb(var(--text-soft))]"
                            disabled={archivingId === dashboard.specimenId}
                            onClick={async () => {
                              if (!dashboard.specimenId) return;
                              const reason = window.prompt("Archive reason (optional):", "");
                              if (reason === null) return; // User cancelled
                              setArchivingId(dashboard.specimenId);
                              try {
                                await onArchive(dashboard.specimenId, true, reason || undefined);
                              } finally {
                                setArchivingId(null);
                              }
                            }}
                          >
                            <Archive className="w-3.5 h-3.5" />
                            {archivingId === dashboard.specimenId ? "Archiving..." : "Archive Specimen"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <SpecimenQrModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        specimens={specimenDashboards.map((d) => ({ specimenId: d.specimenId, specimen: d.specimen, species: d.species }))}
        ownerId={ownerId}
      />

      {editorOpen && (
        <ActionButtonsEditor
          buttons={buttons}
          onAdd={addCustomButton}
          onRemove={removeButton}
          onToggle={toggleButton}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </>
  );
}

// Added ActionButtons helper component
function ActionButtons({
  specimenId,
  specimen,
  species,
  onQuickAction,
  buttons,
  onTrackUsage,
  onOpenEditor
}: {
  specimenId?: string;
  specimen: string;
  species?: string;
  onQuickAction: (specimenId: string | undefined, specimen: string, species: string | undefined, action: string) => void;
  buttons: ActionButton[];
  onTrackUsage: (id: string) => void;
  onOpenEditor: () => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-[rgb(var(--text))] mb-2">Quick log</p>
      <div className="flex flex-wrap gap-1.5">
        {buttons.filter(b => b.enabled).map((btn) => (
          <Button
            key={btn.id}
            type="button"
            size="sm"
            variant="outline"
            className="px-2 py-1 text-xs"
            onClick={() => {
              onTrackUsage(btn.id);
              onQuickAction(specimenId, specimen, species, btn.label);
            }}
          >
            {btn.label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="px-2 py-1 text-xs text-[rgb(var(--text-soft))]"
          onClick={onOpenEditor}
          title="Configure actions"
        >
          +
        </Button>
      </div>
    </div>
  );
}
