"use client";

import { useMemo } from "react";
import { Activity, BarChart3, TrendingUp } from "lucide-react";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { MoltEntry } from "@/types/molt";
import { computeSpecimenAnalytics } from "@/lib/molt-analytics";
import type { SpecimenAnalytics } from "@/lib/molt-analytics";
import { formatDate } from "@/lib/utils";

interface AnalyticsViewProps {
  entries: MoltEntry[];
}

export default function AnalyticsView({ entries }: AnalyticsViewProps) {
  const analytics = useMemo<SpecimenAnalytics[]>(() => computeSpecimenAnalytics(entries), [entries]);

  if (analytics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-[rgb(var(--primary-soft))] flex items-center justify-center mb-4">
          <BarChart3 className="w-10 h-10 text-[rgb(var(--primary))]" />
        </div>
        <h2 className="text-2xl font-bold text-[rgb(var(--text))] mb-2">No molt data yet</h2>
        <p className="text-[rgb(var(--text-soft))] max-w-md">
          Log molts to unlock growth analytics and interval predictions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4" /> Molt Interval Trends
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {analytics.map((entry) => {
            const years = Object.keys(entry.yearlyMolts)
              .map(Number)
              .sort((a, b) => b - a);
            const lastMoltDate = entries
              .filter((e) => (e.specimen ?? "Unnamed") === entry.specimen && e.entryType === "molt")
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date;

            return (
              <Card key={entry.specimen} className="border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-semibold text-[rgb(var(--text))]">{entry.specimen}</h3>
                      {entry.species && (
                        <p className="text-sm text-[rgb(var(--text-soft))]">{entry.species}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {entry.moltIntervals.lastDays !== null && (
                        <Badge variant="primary">Last {entry.moltIntervals.lastDays}d</Badge>
                      )}
                      {entry.moltIntervals.averageDays !== null && (
                        <Badge variant="neutral">Avg {entry.moltIntervals.averageDays}d</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {entry.moltIntervals.intervals.length === 0 ? (
                    <p className="text-sm text-[rgb(var(--text-soft))]">
                      Only one molt recorded so far. Log more molts to calculate intervals.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {entry.moltIntervals.intervals.slice(0, 4).map((days, index) => (
                        <div key={`${entry.specimen}-interval-${index}`} className="p-3 rounded-[var(--radius)] bg-[rgb(var(--bg-muted))]">
                          <p className="text-xs text-[rgb(var(--text-subtle))] mb-1">Interval #{index + 1}</p>
                          <p className="text-sm font-semibold text-[rgb(var(--text))]">{days} days</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {years.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[rgb(var(--text-subtle))] mb-2">Molts per year</p>
                      <div className="flex flex-wrap gap-2">
                        {years.map((year) => (
                          <Badge key={`${entry.specimen}-${year}`} variant="primary">
                            {year}: {entry.yearlyMolts[year]}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {lastMoltDate && (
                    <p className="text-xs text-[rgb(var(--text-soft))]">
                      Last recorded molt: {formatDate(lastMoltDate)}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4" /> Quick Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-[rgb(var(--text-soft))]">
          <p>
            • Average interval is computed from all recorded molts per specimen. Log molts consistently to improve predictions.
          </p>
          <p>
            • The latest four intervals are highlighted per specimen so you can spot trends or stalled growth.
          </p>
          <p>
            • Molts-per-year counters help you benchmark each tarantula’s long-term rhythm.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
