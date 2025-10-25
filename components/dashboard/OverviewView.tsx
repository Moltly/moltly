"use client";

import { useMemo } from "react";
import { Activity, Calendar, TrendingUp, AlertCircle } from "lucide-react";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import StatCard from "./StatCard";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { MoltEntry, ViewKey } from "@/types/molt";
import { formatDate, formatRelativeDate, getReminderStatus } from "@/lib/utils";

interface OverviewViewProps {
  entries: MoltEntry[];
  onViewChange: (view: ViewKey) => void;
}

export default function OverviewView({ entries, onViewChange }: OverviewViewProps) {
  const stats = useMemo(() => {
    const uniqueSpecimens = new Set(entries.map((e) => e.specimen ?? "Unnamed")).size;

    const molts = entries.filter((e) => e.entryType === "molt");
    const currentYear = new Date().getFullYear();
    const yearMolts = molts.filter(
      (e) => new Date(e.date).getFullYear() === currentYear
    ).length;

    const lastMolt = molts.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )[0];

    const upcomingReminders = entries
      .filter((e) => e.reminderDate)
      .sort((a, b) =>
        new Date(a.reminderDate!).getTime() - new Date(b.reminderDate!).getTime()
      );

    const nextReminder = upcomingReminders[0];

    return {
      uniqueSpecimens,
      yearMolts,
      lastMolt,
      nextReminder,
      upcomingReminders: upcomingReminders.slice(0, 4),
      recentActivity: [...entries]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 3),
    };
  }, [entries]);

  const getVariantForReminderStatus = (status: ReturnType<typeof getReminderStatus>) => {
    switch (status) {
      case "overdue":
      case "due":
        return "danger";
      case "soon":
        return "warning";
      default:
        return "neutral";
    }
  };

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-[rgb(var(--primary-soft))] flex items-center justify-center mb-4">
          <Activity className="w-10 h-10 text-[rgb(var(--primary))]" />
        </div>
        <h2 className="text-2xl font-bold text-[rgb(var(--text))] mb-2">
          Welcome to Moltly
        </h2>
        <p className="text-[rgb(var(--text-soft))] max-w-md mb-6">
          Start tracking your tarantula&apos;s molts, feedings, and growth. Click &quot;New Entry&quot; above to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Stats */}
      <Card className="p-6 bg-gradient-to-br from-[rgb(var(--primary-soft))] to-transparent">
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-medium text-[rgb(var(--text-soft))] mb-1">
              Active Specimens
            </h2>
            <p className="text-4xl font-bold text-[rgb(var(--text))]">
              {stats.uniqueSpecimens}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[rgb(var(--border))]">
            <div>
              <p className="text-xs text-[rgb(var(--text-soft))] mb-0.5">
                Molts This Year
              </p>
              <p className="text-2xl font-bold text-[rgb(var(--text))]">
                {stats.yearMolts}
              </p>
            </div>
            <div>
              <p className="text-xs text-[rgb(var(--text-soft))] mb-0.5">
                Last Molt
              </p>
              <p className="text-2xl font-bold text-[rgb(var(--text))]">
                {stats.lastMolt ? formatRelativeDate(stats.lastMolt.date) : "—"}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          title="Total Entries"
          value={entries.length}
          icon={Activity}
          color="primary"
        />
        <StatCard
          title="Specimens"
          value={stats.uniqueSpecimens}
          icon={TrendingUp}
          color="success"
        />
      </div>

      {/* Next Reminder */}
      {stats.nextReminder && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-[rgb(var(--primary))]" />
              Next Reminder
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="font-semibold text-[rgb(var(--text))] mb-1">
                {stats.nextReminder.specimen || "Unnamed"}
              </p>
              {stats.nextReminder.species && (
                <p className="text-sm text-[rgb(var(--text-soft))] mb-2">
                  {stats.nextReminder.species}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Badge variant={getVariantForReminderStatus(getReminderStatus(stats.nextReminder.reminderDate))}>
                  {formatDate(stats.nextReminder.reminderDate!)}
                </Badge>
                <span className="text-xs text-[rgb(var(--text-subtle))]">
                  {formatRelativeDate(stats.nextReminder.reminderDate!)}
                </span>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onViewChange("reminders")}
              className="w-full"
            >
              View All Reminders
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Reminders */}
      {stats.upcomingReminders.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Upcoming Reminders</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewChange("reminders")}
              >
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.upcomingReminders.map((entry) => {
                const status = getReminderStatus(entry.reminderDate);
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 rounded-[var(--radius)] bg-[rgb(var(--bg-muted))] hover:bg-[rgb(var(--border))] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-[rgb(var(--text))] truncate">
                        {entry.specimen || "Unnamed"}
                      </p>
                      <p className="text-xs text-[rgb(var(--text-subtle))]">
                        {formatDate(entry.reminderDate!)}
                      </p>
                    </div>
                    <Badge variant={getVariantForReminderStatus(status)}>
                      {formatRelativeDate(entry.reminderDate!)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewChange("activity")}
            >
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stats.recentActivity.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 p-3 rounded-[var(--radius)] bg-[rgb(var(--bg-muted))] hover:bg-[rgb(var(--border))] transition-colors"
              >
                <div className={`p-2 rounded-[var(--radius-sm)] ${
                  entry.entryType === "molt"
                    ? "bg-[rgb(var(--primary-soft))] text-[rgb(var(--primary))]"
                    : "bg-[rgb(var(--success-soft))] text-[rgb(var(--success))]"
                }`}>
                  {entry.entryType === "molt" ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <Activity className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-sm text-[rgb(var(--text))] truncate">
                      {entry.specimen || "Unnamed"}
                      </p>
                    <Badge variant={entry.entryType === "molt" ? "primary" : "success"}>
                      {entry.entryType}
                    </Badge>
                  </div>
                  {entry.species && (
                    <p className="text-xs text-[rgb(var(--text-subtle))] mb-1">
                      {entry.species}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-[rgb(var(--text-soft))]">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(entry.date)}</span>
                    <span>•</span>
                    <span>{formatRelativeDate(entry.createdAt)}</span>
                  </div>
                  {entry.stage && (
                    <Badge variant="neutral" className="mt-2">
                      {entry.stage}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
