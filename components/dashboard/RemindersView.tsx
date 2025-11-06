"use client";

import { useMemo } from "react";
import { Bell, BellOff, Clock, CheckCircle2, Calendar } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { MoltEntry } from "@/types/molt";
import { formatDate, getReminderStatus, getDaysUntil } from "@/lib/utils";
import CachedImage from "@/components/ui/CachedImage";

interface RemindersViewProps {
  entries: MoltEntry[];
  onMarkDone: (id: string) => void;
  onSnooze: (id: string, days: number) => void;
  onEdit: (entry: MoltEntry) => void;
  covers?: Record<string, string>;
}

export default function RemindersView({
  entries,
  onMarkDone,
  onSnooze,
  onEdit,
  covers,
}: RemindersViewProps) {
  const reminders = useMemo(() => {
    const withReminders = entries
      .filter((e) => e.reminderDate)
      .map((e) => ({
        ...e,
        status: getReminderStatus(e.reminderDate),
        daysUntil: getDaysUntil(e.reminderDate!),
      }))
      .sort((a, b) => {
        const aTime = new Date(a.reminderDate!).getTime();
        const bTime = new Date(b.reminderDate!).getTime();
        return aTime - bTime;
      });

    return withReminders;
  }, [entries]);

  const getVariantForStatus = (
    status: ReturnType<typeof getReminderStatus>
  ): "danger" | "warning" | "neutral" => {
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

  const getIconForStatus = (status: ReturnType<typeof getReminderStatus>) => {
    switch (status) {
      case "overdue":
      case "due":
        return Bell;
      case "soon":
        return Clock;
      default:
        return Calendar;
    }
  };

  const getStatusLabel = (daysUntil: number) => {
    if (daysUntil < 0) return `Overdue by ${Math.abs(daysUntil)}d`;
    if (daysUntil === 0) return "Due today";
    if (daysUntil === 1) return "Due tomorrow";
    return `Due in ${daysUntil}d`;
  };

  if (reminders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-[rgb(var(--primary-soft))] flex items-center justify-center mb-4">
          <BellOff className="w-10 h-10 text-[rgb(var(--primary))]" />
        </div>
        <h2 className="text-2xl font-bold text-[rgb(var(--text))] mb-2">
          No reminders set
        </h2>
        <p className="text-[rgb(var(--text-soft))] max-w-md">
          Set reminder dates on your entries to track upcoming care tasks.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[rgb(var(--text-soft))]">
          {reminders.length} {reminders.length === 1 ? "reminder" : "reminders"}
        </p>
      </div>

      {/* Reminder Cards */}
      <div className="space-y-3">
        {reminders.map((reminder) => {
          const Icon = getIconForStatus(reminder.status);
          const variant = getVariantForStatus(reminder.status);

          return (
            <Card
              key={reminder.id}
              className="p-4 hover:shadow-[var(--shadow-md)] transition-all"
            >
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2.5 rounded-[var(--radius)] shrink-0 ${
                      variant === "danger"
                        ? "bg-[rgb(var(--danger-soft))] text-[rgb(var(--danger))]"
                        : variant === "warning"
                        ? "bg-[rgb(var(--warning-soft))] text-[rgb(var(--warning))]"
                        : "bg-[rgb(var(--bg-muted))] text-[rgb(var(--text-soft))]"
                    }`}
                  >
                    <Icon className="w-5 h-5" strokeWidth={2.5} />
                  </div>
                  {(() => {
                    const key = reminder.specimen || "Unnamed";
                    const coverUrl = covers?.[key];
                    if (!coverUrl) return null;
                    return (
                      <div className="w-10 h-10 rounded overflow-hidden bg-[rgb(var(--bg-muted))] shrink-0">
                        <CachedImage src={coverUrl} alt={`${key} photo`} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    );
                  })()}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[rgb(var(--text))] mb-1 truncate">
                      {reminder.specimen || "Unnamed"}
                    </h3>
                    {reminder.species && (
                      <p className="text-sm text-[rgb(var(--text-soft))] mb-2 italic">
                        {reminder.species}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={variant}>
                        {getStatusLabel(reminder.daysUntil)}
                      </Badge>
                      <Badge variant={reminder.entryType === "molt" ? "primary" : reminder.entryType === "feeding" ? "success" : "neutral"}>
                        {reminder.entryType === "water" ? "water" : reminder.entryType}
                      </Badge>
                      {reminder.stage && (
                        <Badge variant="neutral">{reminder.stage}</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Reminder Details */}
                <div className="pt-3 border-t border-[rgb(var(--border))]">
                  <div className="flex items-center gap-2 text-sm text-[rgb(var(--text-soft))] mb-3">
                    <Calendar className="w-4 h-4" />
                    <span>Set for {formatDate(reminder.reminderDate!)}</span>
                  </div>

                  {reminder.notes && (
                    <p className="text-sm text-[rgb(var(--text))] mb-3 line-clamp-2">
                      {reminder.notes}
                    </p>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onMarkDone(reminder.id)}
                      className="gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Mark Done
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onSnooze(reminder.id, 7)}
                      className="gap-1.5"
                    >
                      <Clock className="w-4 h-4" />
                      Snooze 7d
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(reminder)}
                    >
                      Edit Entry
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
