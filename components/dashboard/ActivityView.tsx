"use client";

import { useMemo, useState } from "react";
import { Search, Filter, Edit2, Trash2, Calendar, TrendingUp, Thermometer, Droplets, Image as ImageIcon } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { MoltEntry, Filters } from "@/types/molt";
import { formatDate, getReminderStatus } from "@/lib/utils";

interface ActivityViewProps {
  entries: MoltEntry[];
  onEdit: (entry: MoltEntry) => void;
  onDelete: (id: string) => void;
}

export default function ActivityView({ entries, onEdit, onDelete }: ActivityViewProps) {
  const [filters, setFilters] = useState<Filters>({
    search: "",
    stage: "all",
    type: "all",
    order: "desc",
  });

  const [showFilters, setShowFilters] = useState(false);

  const filteredEntries = useMemo(() => {
    let filtered = [...entries];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.specimen?.toLowerCase().includes(searchLower) ||
          e.species?.toLowerCase().includes(searchLower)
      );
    }

    // Type filter
    if (filters.type !== "all") {
      filtered = filtered.filter((e) => e.entryType === filters.type);
    }

    // Stage filter
    if (filters.stage !== "all") {
      filtered = filtered.filter((e) => e.stage === filters.stage);
    }

    // Sort
    filtered.sort((a, b) => {
      const aTime = new Date(a.date).getTime();
      const bTime = new Date(b.date).getTime();
      return filters.order === "desc" ? bTime - aTime : aTime - bTime;
    });

    return filtered;
  }, [entries, filters]);

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
          <TrendingUp className="w-10 h-10 text-[rgb(var(--primary))]" />
        </div>
        <h2 className="text-2xl font-bold text-[rgb(var(--text))] mb-2">
          No activity yet
        </h2>
        <p className="text-[rgb(var(--text-soft))] max-w-md">
          Start logging molts and feedings to see your activity history here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-subtle))]" />
            <Input
              placeholder="Search by specimen or species..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-10"
            />
          </div>
          <Button
            variant={showFilters ? "primary" : "secondary"}
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4" />
          </Button>
        </div>

        {showFilters && (
          <Card className="p-4 animate-slide-down">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-2 block">
                  Entry Type
                </label>
                <div className="flex gap-2">
                  {["all", "molt", "feeding"].map((type) => (
                    <Button
                      key={type}
                      variant={filters.type === type ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => setFilters({ ...filters, type: type as Filters["type"] })}
                      className="flex-1 capitalize"
                    >
                      {type}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-2 block">
                  Molt Stage
                </label>
                <div className="flex gap-2">
                  {["all", "Pre-molt", "Molt", "Post-molt"].map((stage) => (
                    <Button
                      key={stage}
                      variant={filters.stage === stage ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => setFilters({ ...filters, stage: stage as Filters["stage"] })}
                      className="flex-1 text-xs"
                    >
                      {stage}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-2 block">
                  Sort Order
                </label>
                <div className="flex gap-2">
                  <Button
                    variant={filters.order === "desc" ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setFilters({ ...filters, order: "desc" })}
                    className="flex-1"
                  >
                    Newest First
                  </Button>
                  <Button
                    variant={filters.order === "asc" ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setFilters({ ...filters, order: "asc" })}
                    className="flex-1"
                  >
                    Oldest First
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-sm text-[rgb(var(--text-soft))]">
        <span>
          {filteredEntries.length} {filteredEntries.length === 1 ? "entry" : "entries"}
        </span>
        {filters.search || filters.type !== "all" || filters.stage !== "all" ? (
          <button
            onClick={() =>
              setFilters({ search: "", stage: "all", type: "all", order: filters.order })
            }
            className="text-[rgb(var(--primary))] hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {/* Entry Cards */}
      <div className="space-y-3 pb-4">
        {filteredEntries.map((entry) => {
          const reminderStatus = getReminderStatus(entry.reminderDate);

          return (
            <Card key={entry.id} className="p-4 hover:shadow-[var(--shadow-md)] transition-all">
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-[rgb(var(--text))] truncate">
                        {entry.specimen || "Unnamed"}
                      </h3>
                      <Badge variant={entry.entryType === "molt" ? "primary" : "success"}>
                        {entry.entryType}
                      </Badge>
                    </div>
                    {entry.species && (
                      <p className="text-sm text-[rgb(var(--text-soft))] mb-2">
                        {entry.species}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-[rgb(var(--text-subtle))]">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(entry.date)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(entry)}
                      className="h-8 w-8"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(entry.id)}
                      className="h-8 w-8 text-[rgb(var(--danger))] hover:bg-[rgb(var(--danger-soft))]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Molt Details */}
                {entry.entryType === "molt" && (
                  <div className="space-y-2">
                    {entry.stage && (
                      <Badge variant="neutral">{entry.stage}</Badge>
                    )}
                    {(entry.oldSize || entry.newSize) && (
                      <div className="flex items-center gap-2 text-sm">
                        <TrendingUp className="w-4 h-4 text-[rgb(var(--primary))]" />
                        <span className="text-[rgb(var(--text))]">
                          {entry.oldSize || "?"} cm → {entry.newSize || "?"} cm
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Feeding Details */}
                {entry.entryType === "feeding" && (
                  <div className="space-y-2">
                    {entry.feedingPrey && (
                      <div className="text-sm text-[rgb(var(--text))]">
                        <span className="text-[rgb(var(--text-soft))]">Prey:</span>{" "}
                        {entry.feedingPrey}
                      </div>
                    )}
                    {entry.feedingOutcome && (
                      <Badge variant={entry.feedingOutcome === "Ate" ? "success" : "neutral"}>
                        {entry.feedingOutcome}
                      </Badge>
                    )}
                    {entry.feedingAmount && (
                      <div className="text-sm text-[rgb(var(--text-soft))]">
                        Amount: {entry.feedingAmount}
                      </div>
                    )}
                  </div>
                )}

                {/* Environmental Data */}
                {(entry.humidity || entry.temperature) && (
                  <div className="flex gap-4 pt-2 border-t border-[rgb(var(--border))]">
                    {entry.humidity && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Droplets className="w-4 h-4 text-[rgb(var(--primary))]" />
                        <span className="text-[rgb(var(--text))]">{entry.humidity}%</span>
                      </div>
                    )}
                    {entry.temperature && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Thermometer className="w-4 h-4 text-[rgb(var(--danger))]" />
                        <span className="text-[rgb(var(--text))]">{entry.temperature}°C</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                {entry.notes && (
                  <p className="text-sm text-[rgb(var(--text-soft))] pt-2 border-t border-[rgb(var(--border))]">
                    {entry.notes}
                  </p>
                )}

                {/* Attachments */}
                {entry.attachments && entry.attachments.length > 0 && (
                  <div className="flex items-center gap-2 pt-2 border-t border-[rgb(var(--border))]">
                    <ImageIcon className="w-4 h-4 text-[rgb(var(--text-subtle))]" />
                    <span className="text-sm text-[rgb(var(--text-soft))]">
                      {entry.attachments.length} {entry.attachments.length === 1 ? "photo" : "photos"}
                    </span>
                  </div>
                )}

                {/* Reminder */}
                {entry.reminderDate && (
                  <div className="pt-2 border-t border-[rgb(var(--border))]">
                    <Badge variant={getVariantForReminderStatus(reminderStatus)}>
                      Reminder: {formatDate(entry.reminderDate)}
                    </Badge>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {filteredEntries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <p className="text-[rgb(var(--text-soft))] mb-2">No entries match your filters</p>
          <button
            onClick={() =>
              setFilters({ search: "", stage: "all", type: "all", order: filters.order })
            }
            className="text-sm text-[rgb(var(--primary))] hover:underline"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
