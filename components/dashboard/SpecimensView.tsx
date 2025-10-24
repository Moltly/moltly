"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp, Activity, Calendar, Bell } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { MoltEntry, SpecimenDashboard } from "@/types/molt";
import { formatDate, getReminderStatus } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface SpecimensViewProps {
  entries: MoltEntry[];
}

export default function SpecimensView({ entries }: SpecimensViewProps) {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const specimenDashboards = useMemo(() => {
    const dashboardMap = new Map<string, SpecimenDashboard>();

    entries.forEach((entry) => {
      const key = entry.specimen;
      if (!dashboardMap.has(key)) {
        dashboardMap.set(key, {
          key,
          specimen: entry.specimen,
          species: entry.species,
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
    });

    return Array.from(dashboardMap.values()).sort((a, b) =>
      a.specimen.localeCompare(b.specimen)
    );
  }, [entries]);

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
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[rgb(var(--text-soft))]">
          {specimenDashboards.length} {specimenDashboards.length === 1 ? "specimen" : "specimens"}
        </p>
        <div className="flex gap-2">
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
            <Card key={dashboard.key} className="overflow-hidden">
              {/* Card Header - Always Visible */}
              <button
                onClick={() => toggleExpand(dashboard.key)}
                className="w-full p-4 text-left hover:bg-[rgb(var(--bg-muted))] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
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
                        {dashboard.species}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="primary">
                        {dashboard.totalMolts} {dashboard.totalMolts === 1 ? "molt" : "molts"}
                      </Badge>
                      <Badge variant="success">
                        {dashboard.totalFeedings}{" "}
                        {dashboard.totalFeedings === 1 ? "feeding" : "feedings"}
                      </Badge>
                      {dashboard.attachmentsCount > 0 && (
                        <Badge variant="neutral">
                          {dashboard.attachmentsCount}{" "}
                          {dashboard.attachmentsCount === 1 ? "photo" : "photos"}
                        </Badge>
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
                              : "bg-[rgb(var(--success-soft))] text-[rgb(var(--success))]"
                          )}>
                            {entry.entryType === "molt" ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <Activity className="w-3 h-3" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-[rgb(var(--text))]">
                                {entry.entryType === "molt" ? "Molt" : "Feeding"}
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
                          </div>
                          {entry.oldSize && entry.newSize && (
                            <span className="text-xs text-[rgb(var(--text-soft))] whitespace-nowrap">
                              {entry.oldSize} → {entry.newSize} cm
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
  );
}
