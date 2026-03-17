"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { Activity, Calendar, TrendingUp, AlertCircle, Droplets, Heart, Star, Trash2, ExternalLink } from "lucide-react";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import StatCard from "./StatCard";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { MoltEntry, ViewKey, Specimen } from "@/types/molt";
import { formatDate, formatRelativeDate, getReminderStatus } from "@/lib/utils";
import CachedImage from "@/components/ui/CachedImage";

interface CollectionItem {
  id: string;
  species: string;
  family?: string;
  author?: string;
  notes?: string;
  createdAt: string;
}

interface OverviewViewProps {
  entries: MoltEntry[];
  specimens?: Specimen[];
  onViewChange: (view: ViewKey) => void;
  covers?: Record<string, string>;
}

export default function OverviewView({ entries, specimens = [], onViewChange, covers }: OverviewViewProps) {
  const [collectionTab, setCollectionTab] = useState<"favorites" | "wishlist">("favorites");
  const [favorites, setFavorites] = useState<CollectionItem[]>([]);
  const [wishlist, setWishlist] = useState<CollectionItem[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(true);

  const fetchCollection = useCallback(async () => {
    try {
      const [favRes, wishRes] = await Promise.all([
        fetch("/api/favorites"),
        fetch("/api/wishlists"),
      ]);
      if (favRes.ok) setFavorites(await favRes.json());
      if (wishRes.ok) setWishlist(await wishRes.json());
    } catch {
      // silently fail
    } finally {
      setCollectionLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollection();
  }, [fetchCollection]);

  const removeFromCollection = async (type: "favorites" | "wishlist", species: string) => {
    const endpoint = type === "favorites" ? "/api/favorites" : "/api/wishlists";
    try {
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ species }),
      });
      if (res.ok) {
        if (type === "favorites") {
          setFavorites((prev) => prev.filter((f) => f.species !== species));
        } else {
          setWishlist((prev) => prev.filter((w) => w.species !== species));
        }
      }
    } catch {
      // silently fail
    }
  };

  const stats = useMemo(() => {
    // Count unique specimens using specimenId when available, otherwise name+species
    const uniqueSpecimens = new Set(
      entries.map((e) => e.specimenId ?? `${e.specimen ?? "Unnamed"}-${e.species ?? ""}`)
    ).size;

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

  const getSpecimenImage = (name: string, specimenId?: string) => {
    if (specimenId && specimens) {
      const found = specimens.find((specimen) => specimen.id === specimenId);
      if (found && found.imageUrl !== undefined) {
        return found.imageUrl || undefined;
      }
    }

    let coverUrl = covers?.[name];

    if (!coverUrl && specimens) {
      const found = specimens.find((specimen) => specimen.name === name);
      if (found && found.imageUrl !== undefined) {
        coverUrl = found.imageUrl || undefined;
      }
    }
    return coverUrl;
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

      {/* My Collection */}
      {!collectionLoading && (favorites.length > 0 || wishlist.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">My Collection</CardTitle>
              <div className="flex rounded-[var(--radius)] bg-[rgb(var(--bg-muted))] p-0.5">
                <button
                  onClick={() => setCollectionTab("favorites")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors ${
                    collectionTab === "favorites"
                      ? "bg-[rgb(var(--bg))] text-[rgb(var(--text))] shadow-[var(--shadow-sm)]"
                      : "text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))]"
                  }`}
                >
                  <Heart className="w-3.5 h-3.5" />
                  Favorites
                  {favorites.length > 0 && (
                    <span className="text-[rgb(var(--text-subtle))]">({favorites.length})</span>
                  )}
                </button>
                <button
                  onClick={() => setCollectionTab("wishlist")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors ${
                    collectionTab === "wishlist"
                      ? "bg-[rgb(var(--bg))] text-[rgb(var(--text))] shadow-[var(--shadow-sm)]"
                      : "text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))]"
                  }`}
                >
                  <Star className="w-3.5 h-3.5" />
                  Wishlist
                  {wishlist.length > 0 && (
                    <span className="text-[rgb(var(--text-subtle))]">({wishlist.length})</span>
                  )}
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const items = collectionTab === "favorites" ? favorites : wishlist;
              if (items.length === 0) {
                return (
                  <p className="text-sm text-[rgb(var(--text-subtle))] text-center py-4">
                    No {collectionTab === "favorites" ? "favorites" : "wishlist items"} yet.
                  </p>
                );
              }
              return (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-[var(--radius)] bg-[rgb(var(--bg-muted))] hover:bg-[rgb(var(--border))] transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-[rgb(var(--text))] truncate italic">
                            {item.species}
                          </p>
                        </div>
                        {item.family && (
                          <p className="text-xs text-[rgb(var(--text-subtle))] mt-0.5">
                            {item.family}
                            {item.author && <span> &mdash; {item.author}</span>}
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-xs text-[rgb(var(--text-soft))] mt-1 line-clamp-1">
                            {item.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <a
                          href={`/species/${encodeURIComponent(item.species)}`}
                          className="p-1.5 rounded-[var(--radius-sm)] text-[rgb(var(--text-subtle))] hover:text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary-soft))] transition-colors"
                          title="View species"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => removeFromCollection(collectionTab, item.species)}
                          className="p-1.5 rounded-[var(--radius-sm)] text-[rgb(var(--text-subtle))] hover:text-[rgb(var(--danger))] hover:bg-[rgb(var(--danger-soft))] transition-colors opacity-0 group-hover:opacity-100"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

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
              <div className="flex items-center gap-2 mb-1">
                {(() => {
                  const key = stats.nextReminder.specimen || "Unnamed";
                  const coverUrl = getSpecimenImage(key, stats.nextReminder.specimenId);
                  if (!coverUrl) return null;
                  return (
                    <div className="w-8 h-8 rounded overflow-hidden bg-[rgb(var(--bg-muted))] shrink-0">
                      <CachedImage src={coverUrl} alt={`${key} photo`} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  );
                })()}
                <p className="font-semibold text-[rgb(var(--text))] truncate">
                  {stats.nextReminder.specimen || "Unnamed"}
                </p>
              </div>
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
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {(() => {
                        const key = entry.specimen || "Unnamed";
                        const coverUrl = getSpecimenImage(key, entry.specimenId);
                        if (!coverUrl) return null;
                        return (
                          <div className="w-7 h-7 rounded overflow-hidden bg-[rgb(var(--bg-muted))] shrink-0">
                            <CachedImage src={coverUrl} alt={`${key} photo`} className="w-full h-full object-cover" loading="lazy" />
                          </div>
                        );
                      })()}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-[rgb(var(--text))] truncate">
                          {entry.specimen || "Unnamed"}
                        </p>
                        <p className="text-xs text-[rgb(var(--text-subtle))]">
                          {formatDate(entry.reminderDate!)}
                        </p>
                      </div>
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
                <div className={`p-2 rounded-[var(--radius-sm)] ${entry.entryType === "molt"
                  ? "bg-[rgb(var(--primary-soft))] text-[rgb(var(--primary))]"
                  : entry.entryType === "feeding"
                    ? "bg-[rgb(var(--success-soft))] text-[rgb(var(--success))]"
                    : "bg-[rgb(var(--bg-muted))] text-[rgb(var(--text-soft))]"
                  }`}>
                  {entry.entryType === "molt" ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : entry.entryType === "feeding" ? (
                    <Activity className="w-4 h-4" />
                  ) : (
                    <Droplets className="w-4 h-4" />
                  )}
                </div>
                {(() => {
                  const key = entry.specimen || "Unnamed";
                  const coverUrl = getSpecimenImage(key, entry.specimenId);
                  if (!coverUrl) return null;
                  return (
                    <div className="w-8 h-8 rounded overflow-hidden bg-[rgb(var(--bg-muted))] shrink-0">
                      <CachedImage src={coverUrl} alt={`${key} photo`} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-medium text-sm text-[rgb(var(--text))] truncate">
                      {entry.specimen || "Unnamed"}
                    </p>
                    <Badge variant={entry.entryType === "molt" ? "primary" : entry.entryType === "feeding" ? "success" : "neutral"}>
                      {entry.entryType === "water" ? "water" : entry.entryType}
                    </Badge>
                  </div>
                  {entry.species && (
                    <p className="text-xs text-[rgb(var(--text-subtle))] mb-1">
                      <a href={`/species/${encodeURIComponent(entry.species)}`} className="hover:underline">
                        {entry.species}
                      </a>
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
