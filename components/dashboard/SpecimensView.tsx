"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp, Activity, Calendar, Bell, Droplets, HeartPulse, Egg, QrCode } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import CachedImage from "@/components/ui/CachedImage";
import { MoltEntry, SpecimenDashboard, SizeUnit } from "@/types/molt";
import { formatDate, getReminderStatus, cn, cmToInches } from "@/lib/utils";
import SpecimenQrModal from "@/components/dashboard/SpecimenQrModal";

interface SpecimensViewProps {
  entries: MoltEntry[];
  covers?: Record<string, string>;
  healthEntries?: Array<{ specimen?: string; species?: string }>;
  breedingEntries?: Array<{ femaleSpecimen?: string; maleSpecimen?: string }>;
  onQuickAction?: (specimen: string, species: string | undefined, action: string) => void;
  initialFocusSpecimen?: string;
  readOnly?: boolean;
  ownerId?: string;
  sizeUnit: SizeUnit;
}

export default function SpecimensView({ entries, covers, healthEntries = [], breedingEntries = [], onQuickAction, initialFocusSpecimen, readOnly, ownerId, sizeUnit }: SpecimensViewProps) {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [showQrModal, setShowQrModal] = useState(false);
  const hasFocusedRef = useRef(false);

  const formatSize = (value?: number) => {
    if (value === undefined || value === null) return "?";
    const converted = sizeUnit === "in" ? cmToInches(value) : value;
    return Number((Math.round(converted * 100) / 100).toFixed(2)).toString();
  };

  const specimenDashboards = useMemo(() => {
    // Pre-compute per-specimen health and breeding counts
    const healthCounts = new Map<string, number>();
    const breedingCounts = new Map<string, number>();
    for (const h of healthEntries) {
      const key = (h.specimen ?? "").trim();
      const species = (h.species ?? "").trim();
      if (key) healthCounts.set(key, (healthCounts.get(key) ?? 0) + 1);
      // If no specimen but species exists, tally by species (best-effort match)
      if (!key && species) healthCounts.set(species, (healthCounts.get(species) ?? 0) + 1);
    }
    for (const b of breedingEntries) {
      const f = (b.femaleSpecimen ?? "").trim();
      const m = (b.maleSpecimen ?? "").trim();
      if (f) breedingCounts.set(f, (breedingCounts.get(f) ?? 0) + 1);
      if (m) breedingCounts.set(m, (breedingCounts.get(m) ?? 0) + 1);
    }
    const dashboardMap = new Map<string, SpecimenDashboard>();
    // Track the most-recent attachment timestamp per specimen to pick a cover image
    const imageTs = new Map<string, number>();

    entries.forEach((entry) => {
      const key = entry.specimen ?? "Unnamed";
      if (!dashboardMap.has(key)) {
        dashboardMap.set(key, {
          key,
          specimen: key,
          species: entry.species,
          imageUrl: undefined,
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
          // Inject external counts lazily by key match
          // We'll read from these maps at render time
        });
      }

      const dashboard = dashboardMap.get(key)!;

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
        // Attempt to pick an image attachment as the specimen cover image
        const att = entry.attachments.find((a) => !!a.url && (!a.type || a.type.startsWith("image/")));
        if (att && att.url) {
          const ts = new Date(entry.createdAt).getTime();
          const prevTs = imageTs.get(key) ?? -Infinity;
          if (!dashboard.imageUrl || ts > prevTs) {
            dashboard.imageUrl = att.url;
            imageTs.set(key, ts);
          }
        }
      }

      if (entry.reminderDate) {
        const status = getReminderStatus(entry.reminderDate);
        if (
          !dashboard.reminder ||
          new Date(entry.reminderDate) < new Date(dashboard.reminder.date!)
        ) {
          dashboard.reminder = {
            tone: status || "upcoming",
            label: formatDate(entry.reminderDate),
            date: entry.reminderDate,
          };
        }
      }

      dashboard.recentEntries.push(entry);

      if (
        !dashboard.latestEntry ||
        new Date(entry.createdAt) > new Date(dashboard.latestEntry.createdAt)
      ) {
        dashboard.latestEntry = entry;
      }
    });

    // Calculate intervals
    dashboardMap.forEach((dashboard) => {
      dashboard.recentEntries.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      const moltDates = dashboard.recentEntries
        .filter((e) => e.entryType === "molt")
        .map((e) => new Date(e.date).getTime())
        .sort((a, b) => b - a);

      if (moltDates.length >= 2) {
        const intervals: number[] = [];
        for (let i = 0; i < moltDates.length - 1; i++) {
          intervals.push((moltDates[i] - moltDates[i + 1]) / (1000 * 60 * 60 * 24));
        }

        dashboard.lastIntervalDays = Math.round(intervals[0]);
        dashboard.averageIntervalDays = Math.round(
          intervals.reduce((a, b) => a + b, 0) / intervals.length
        );
      }

      // Keep only 5 most recent
      dashboard.recentEntries = dashboard.recentEntries.slice(0, 5);

      // Override with pinned cover if available
      if (covers && covers[dashboard.key]) {
        dashboard.imageUrl = covers[dashboard.key]!;
      }
    });

    const dashboards = Array.from(dashboardMap.values()).sort((a, b) =>
      a.specimen.localeCompare(b.specimen)
    );
    // Attach helper properties on the fly for rendering
    return dashboards.map((d) => ({
      ...d,
      _healthCount: healthCounts.get(d.key) ?? healthCounts.get(d.species ?? "") ?? 0,
      _breedingCount: breedingCounts.get(d.key) ?? 0,
    })) as Array<typeof dashboards[number] & { _healthCount: number; _breedingCount: number }>;
  }, [entries, covers, healthEntries, breedingEntries]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const expandAll = () => {
    setExpandedKeys(specimenDashboards.map((d) => d.key));
  };

  const collapseAll = () => {
    setExpandedKeys([]);
  };

  useEffect(() => {
    if (!initialFocusSpecimen || hasFocusedRef.current) return;
    const match = specimenDashboards.find((d) => d.key === initialFocusSpecimen);
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
        <p className="text-[rgb(var(--text-soft))] max-w-md">
          Add your first entry to start tracking specimen profiles.
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
        {/* Header Actions */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-[rgb(var(--text-soft))]">
            {specimenDashboards.length} {specimenDashboards.length === 1 ? "specimen" : "specimens"}
          </p>
          <div className="flex flex-wrap gap-2">
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
          {specimenDashboards.map((dashboard) => {
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
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-[rgb(var(--text-soft))] shrink-0" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-[rgb(var(--text-soft))] shrink-0" />
                        )}
                      </div>
                      {dashboard.species && (
                        <p className="text-sm text-[rgb(var(--text-soft))] italic mb-2">
                          <a href={`/species/${encodeURIComponent(dashboard.species)}`} className="hover:underline">
                            {dashboard.species}
                          </a>
                        </p>
                      )}
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
                        {onQuickAction && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="px-2 py-1 text-xs"
                            onClick={(e) => { e.stopPropagation(); onQuickAction(dashboard.specimen, dashboard.species, ""); }}
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
                      <div>
                        <p className="text-sm font-medium text-[rgb(var(--text))] mb-2">Quick log</p>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            "watered",
                            "seen",
                            "hidden",
                            "threat posed",
                            "stress response",
                            "webbed increase",
                            "burrowed",
                          ].map((label) => (
                            <Button
                              key={label}
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="px-2 py-1 text-xs"
                              onClick={() => onQuickAction(dashboard.specimen, dashboard.species, label)}
                            >
                              {label}
                            </Button>
                          ))}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="px-2 py-1 text-xs"
                            onClick={() => {
                              const val = typeof window !== "undefined" ? window.prompt("Custom action") : null;
                              if (val && val.trim()) onQuickAction(dashboard.specimen, dashboard.species, val.trim());
                            }}
                          >
                            custom…
                          </Button>
                        </div>
                      </div>
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
                            className="flex items-center gap-3 p-2 rounded-[var(--radius)] bg-[rgb(var(--bg-muted))]"
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
                                  {entry.entryType === "molt" ? "Molt" : entry.entryType === "feeding" ? "Feeding" : "Water"}
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
                                <div className="text-xs text-[rgb(var(--text))] truncate">{entry.notes}</div>
                              )}
                            </div>
                            {entry.oldSize && entry.newSize && (
                              <span className="text-xs text-[rgb(var(--text-soft))] whitespace-nowrap">
                                {formatSize(entry.oldSize)} → {formatSize(entry.newSize)} {sizeUnit}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
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
        specimens={specimenDashboards.map((d) => ({ specimen: d.specimen, species: d.species }))}
        ownerId={ownerId}
      />
    </>
  );
}
