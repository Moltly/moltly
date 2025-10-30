"use client";

import { useMemo, useState } from "react";
import { Egg, PlusCircle, RefreshCw, Trash2, CalendarDays, Users, LineChart } from "lucide-react";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { BreedingEntry, BreedingFormState } from "@/types/breeding";
import { formatDate, formatRelativeDate } from "@/lib/utils";

interface BreedingViewProps {
  entries: BreedingEntry[];
  onCreate: (form: BreedingFormState) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onScheduleFollowUpRetry: (entry: BreedingEntry) => Promise<void>;
}

const defaultForm = (): BreedingFormState => ({
  femaleSpecimen: "",
  maleSpecimen: "",
  species: "",
  pairingDate: new Date().toISOString().slice(0, 10),
  status: "Planned",
  pairingNotes: "",
  eggSacDate: "",
  eggSacStatus: "Not Laid",
  eggSacCount: "",
  hatchDate: "",
  slingCount: "",
  followUpDate: "",
  notes: "",
});

const statusBadgeClass = (status: BreedingEntry["status"]): string => {
  switch (status) {
    case "Successful":
      return "bg-emerald-100 text-emerald-700";
    case "Failed":
      return "bg-[rgb(var(--danger-soft))] text-[rgb(var(--danger))]";
    case "Observation":
      return "bg-yellow-100 text-yellow-700";
    case "Attempted":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-[rgb(var(--bg-muted))] text-[rgb(var(--text))]";
  }
};

const eggBadgeClass = (status: BreedingEntry["eggSacStatus"]): string => {
  switch (status) {
    case "Laid":
    case "Hatched":
      return "bg-emerald-100 text-emerald-700";
    case "Pulled":
      return "bg-blue-100 text-blue-700";
    case "Failed":
      return "bg-[rgb(var(--danger-soft))] text-[rgb(var(--danger))]";
    default:
      return "bg-[rgb(var(--bg-muted))] text-[rgb(var(--text))]";
  }
};

export default function BreedingView({ entries, onCreate, onDelete, onScheduleFollowUpRetry }: BreedingViewProps) {
  const [form, setForm] = useState<BreedingFormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const sorted = [...entries].sort(
      (a, b) => new Date(b.pairingDate).getTime() - new Date(a.pairingDate).getTime()
    );

    const statusCounts: Record<BreedingEntry["status"], number> = {
      Planned: 0,
      Attempted: 0,
      Successful: 0,
      Failed: 0,
      Observation: 0,
    };

    let successful = 0;
    let totalSlings = 0;
    let slingSamples = 0;

    for (const entry of sorted) {
      statusCounts[entry.status] = (statusCounts[entry.status] ?? 0) + 1;
      if (entry.status === "Successful") successful += 1;
      if (typeof entry.slingCount === "number" && Number.isFinite(entry.slingCount)) {
        totalSlings += entry.slingCount;
        slingSamples += 1;
      }
    }

    const averageSlings = slingSamples > 0 ? Math.round((totalSlings / slingSamples) * 10) / 10 : null;

    const upcomingMilestones = sorted
      .map((entry) => {
        const events: { label: string; date: string; entry: BreedingEntry }[] = [];
        if (entry.eggSacDate) events.push({ label: "Egg sac", date: entry.eggSacDate, entry });
        if (entry.hatchDate) events.push({ label: "Hatch", date: entry.hatchDate, entry });
        if (entry.followUpDate) events.push({ label: "Follow-up", date: entry.followUpDate, entry });
        return events;
      })
      .flat()
      .filter((event) => Boolean(event.date))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 4);

    return {
      sorted,
      statusCounts,
      successful,
      averageSlings,
      upcomingMilestones,
    };
  }, [entries]);

  const handleChange = (key: keyof BreedingFormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (statusMessage) setStatusMessage(null);
    if (error) setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onCreate(form);
      setStatusMessage("Breeding log saved.");
      setForm(defaultForm());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      await onDelete(id);
      setStatusMessage("Breeding entry removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete entry.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleReschedule = async (entry: BreedingEntry) => {
    if (!entry.followUpDate) return;
    setReschedulingId(entry.id);
    setError(null);
    try {
      await onScheduleFollowUpRetry(entry);
      setStatusMessage("Reminder scheduled.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to schedule reminder.");
    } finally {
      setReschedulingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card elevated className="overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-purple-600/20 via-purple-500/10 to-transparent border-b border-[rgb(var(--border))]">
          <div className="flex items-center gap-3">
            <Egg className="w-6 h-6 text-purple-600" />
            <div>
              <CardTitle className="text-xl">Breeding Tracker</CardTitle>
              <p className="text-sm text-[rgb(var(--text-subtle))]">
                Record pairings, egg sacs, and sling outcomes to refine your breeding projects.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                  Female specimen
                </label>
                <Input
                  placeholder="e.g., Female #1"
                  value={form.femaleSpecimen}
                  onChange={(e) => handleChange("femaleSpecimen")(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                  Male specimen
                </label>
                <Input
                  placeholder="e.g., Male #3"
                  value={form.maleSpecimen}
                  onChange={(e) => handleChange("maleSpecimen")(e.target.value)}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                  Species
                </label>
                <Input
                  placeholder="e.g., Poecilotheria metallica"
                  value={form.species}
                  onChange={(e) => handleChange("species")(e.target.value)}
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--text))] mb-1.5">
                  <CalendarDays className="w-4 h-4" />
                  Pairing date
                </label>
                <Input
                  type="date"
                  value={form.pairingDate}
                  onChange={(e) => handleChange("pairingDate")(e.target.value)}
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--text))] mb-1.5">
                  <Users className="w-4 h-4" />
                  Status
                </label>
                <select
                  className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]"
                  value={form.status}
                  onChange={(e) => handleChange("status")(e.target.value)}
                >
                  <option value="Planned">Planned</option>
                  <option value="Attempted">Attempted</option>
                  <option value="Successful">Successful</option>
                  <option value="Failed">Failed</option>
                  <option value="Observation">Observation</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                Pairing notes
              </label>
              <textarea
                className="w-full min-h-[90px] rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm"
                value={form.pairingNotes}
                onChange={(e) => handleChange("pairingNotes")(e.target.value)}
                placeholder="Mating behavior, inserts, observations…"
              />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                  Egg sac status
                </label>
                <select
                  className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]"
                  value={form.eggSacStatus}
                  onChange={(e) => handleChange("eggSacStatus")(e.target.value)}
                >
                  <option value="Not Laid">Not Laid</option>
                  <option value="Laid">Laid</option>
                  <option value="Pulled">Pulled</option>
                  <option value="Failed">Failed</option>
                  <option value="Hatched">Hatched</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                  Egg sac date
                </label>
                <Input
                  type="date"
                  value={form.eggSacDate}
                  onChange={(e) => handleChange("eggSacDate")(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                  Egg sac count
                </label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={form.eggSacCount}
                  onChange={(e) => handleChange("eggSacCount")(e.target.value)}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                  Hatch date
                </label>
                <Input
                  type="date"
                  value={form.hatchDate}
                  onChange={(e) => handleChange("hatchDate")(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                  Sling count
                </label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={form.slingCount}
                  onChange={(e) => handleChange("slingCount")(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                  Follow-up date
                </label>
                <Input
                  type="date"
                  value={form.followUpDate}
                  onChange={(e) => handleChange("followUpDate")(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                Project notes
              </label>
              <textarea
                className="w-full min-h-[80px] rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm"
                value={form.notes}
                onChange={(e) => handleChange("notes")(e.target.value)}
                placeholder="Next steps, sales plans, holdbacks…"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button type="submit" disabled={saving} className="gap-2">
                <PlusCircle className="w-4 h-4" />
                {saving ? "Saving…" : "Save breeding log"}
              </Button>
              {statusMessage && <span className="text-sm text-purple-700">{statusMessage}</span>}
              {error && <span className="text-sm text-[rgb(var(--danger))]">{error}</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      {stats.sorted.length === 0 ? (
        <Card className="p-6 text-center">
          <div className="flex flex-col items-center gap-3 text-[rgb(var(--text-soft))]">
            <Egg className="w-10 h-10 opacity-70" />
            <p className="text-base font-medium text-[rgb(var(--text))]">No breeding entries yet</p>
            <p className="text-sm max-w-md">
              Log pairing attempts and outcomes to build a repeatable breeding playbook and track sling production.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-600" />
                  Project status
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 pt-3 text-sm">
                {(["Planned", "Attempted", "Successful", "Failed", "Observation"] as BreedingEntry["status"][]).map(
                  (key) => (
                    <div key={key} className="flex items-center justify-between">
                      <span>{key}</span>
                      <span className="font-semibold text-[rgb(var(--text))]">
                        {stats.statusCounts[key]}
                      </span>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-base">Successful projects</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <p className="text-3xl font-semibold text-[rgb(var(--text))]">{stats.successful}</p>
                <p className="text-xs text-[rgb(var(--text-subtle))]">Total pairings reaching egg sac or hatch</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <LineChart className="w-4 h-4 text-purple-600" />
                  Average sling yield
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <p className="text-3xl font-semibold text-[rgb(var(--text))]">
                  {stats.averageSlings !== null ? stats.averageSlings : "—"}
                </p>
                <p className="text-xs text-[rgb(var(--text-subtle))]">Across logged clutches</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Card elevated>
              <CardHeader className="pb-0">
                <CardTitle className="text-base">Upcoming milestones</CardTitle>
              </CardHeader>
              <CardContent className="pt-3 space-y-3">
                {stats.upcomingMilestones.length === 0 ? (
                  <p className="text-sm text-[rgb(var(--text-subtle))]">No milestones scheduled.</p>
                ) : (
                  stats.upcomingMilestones.map((milestone) => (
                    <div
                      key={`${milestone.entry.id}-${milestone.label}`}
                      className="flex items-start justify-between gap-3 border border-[rgb(var(--border))] rounded-[var(--radius)] p-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[rgb(var(--text))]">
                          {milestone.label} • {milestone.entry.species || milestone.entry.femaleSpecimen || "Specimen"}
                        </p>
                        <p className="text-xs text-[rgb(var(--text-subtle))]">
                          {formatDate(milestone.date)} • {formatRelativeDate(milestone.date)}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${statusBadgeClass(milestone.entry.status)}`}
                      >
                        {milestone.entry.status}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card elevated>
              <CardHeader className="pb-0">
                <CardTitle className="text-base">Recent pairings</CardTitle>
              </CardHeader>
              <CardContent className="pt-3 space-y-3">
                {stats.sorted.slice(0, 4).map((entry) => (
                  <div key={entry.id} className="border border-[rgb(var(--border))] rounded-[var(--radius)] p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[rgb(var(--text))]">
                          {entry.femaleSpecimen || "Unnamed female"} × {entry.maleSpecimen || "Unnamed male"}
                        </p>
                        <p className="text-xs text-[rgb(var(--text-subtle))]">
                          {formatDate(entry.pairingDate)} • {formatRelativeDate(entry.pairingDate)}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${statusBadgeClass(entry.status)}`}
                      >
                        {entry.status}
                      </span>
                    </div>
                    {entry.eggSacStatus && (
                      <div className="mt-2 inline-flex items-center gap-2 text-xs">
                        <span className={`px-2 py-1 rounded-full ${eggBadgeClass(entry.eggSacStatus)}`}>
                          Egg sac: {entry.eggSacStatus}
                        </span>
                        {typeof entry.eggSacCount === "number" && Number.isFinite(entry.eggSacCount) && (
                          <span className="px-2 py-1 rounded-full bg-[rgb(var(--bg-muted))] text-[rgb(var(--text))]">
                            {entry.eggSacCount} eggs
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {stats.sorted.map((entry) => (
              <Card key={entry.id} elevated>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-[rgb(var(--text))]">
                        {entry.femaleSpecimen || "Female"} × {entry.maleSpecimen || "Male"}
                      </h3>
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${statusBadgeClass(entry.status)}`}
                      >
                        {entry.status}
                      </span>
                    </div>
                    <p className="text-xs text-[rgb(var(--text-subtle))]">
                      {formatDate(entry.pairingDate)} • {formatRelativeDate(entry.pairingDate)}
                    </p>
                    {entry.species && (
                      <p className="text-xs text-[rgb(var(--text-subtle))] uppercase tracking-wide">
                        {entry.species}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(entry.id)}
                    disabled={deletingId === entry.id}
                    className="text-[rgb(var(--danger))]"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid sm:grid-cols-4 gap-3">
                    <div className="border border-[rgb(var(--border))] rounded-[var(--radius)] p-3">
                      <p className="text-xs text-[rgb(var(--text-subtle))] uppercase tracking-wide">
                        Egg sac
                      </p>
                      <p className="text-base font-semibold text-[rgb(var(--text))]">
                        {entry.eggSacDate ? formatDate(entry.eggSacDate) : "—"}
                      </p>
                      <p className="text-xs text-[rgb(var(--text-subtle))]">
                        {entry.eggSacDate ? formatRelativeDate(entry.eggSacDate) : ""}
                      </p>
                    </div>
                    <div className="border border-[rgb(var(--border))] rounded-[var(--radius)] p-3">
                      <p className="text-xs text-[rgb(var(--text-subtle))] uppercase tracking-wide">
                        Egg sac status
                      </p>
                      <p className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${eggBadgeClass(entry.eggSacStatus)}`}>
                        {entry.eggSacStatus}
                      </p>
                    </div>
                    <div className="border border-[rgb(var(--border))] rounded-[var(--radius)] p-3">
                      <p className="text-xs text-[rgb(var(--text-subtle))] uppercase tracking-wide">
                        Hatch date
                      </p>
                      <p className="text-base font-semibold text-[rgb(var(--text))]">
                        {entry.hatchDate ? formatDate(entry.hatchDate) : "—"}
                      </p>
                      <p className="text-xs text-[rgb(var(--text-subtle))]">
                        {entry.hatchDate ? formatRelativeDate(entry.hatchDate) : ""}
                      </p>
                    </div>
                    <div className="border border-[rgb(var(--border))] rounded-[var(--radius)] p-3">
                      <p className="text-xs text-[rgb(var(--text-subtle))] uppercase tracking-wide">
                        Sling count
                      </p>
                      <p className="text-base font-semibold text-[rgb(var(--text))]">
                        {typeof entry.slingCount === "number" && Number.isFinite(entry.slingCount)
                          ? entry.slingCount
                          : "—"}
                      </p>
                    </div>
                  </div>
                  {entry.followUpDate && (
                    <div className="border border-[rgb(var(--border))] rounded-[var(--radius)] p-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-[rgb(var(--text-subtle))] uppercase tracking-wide">
                          Follow-up
                        </p>
                        <p className="text-base font-semibold text-[rgb(var(--text))]">
                          {formatDate(entry.followUpDate)}
                        </p>
                        <p className="text-xs text-[rgb(var(--text-subtle))]">
                          {formatRelativeDate(entry.followUpDate)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs text-[rgb(var(--primary))]"
                        onClick={() => handleReschedule(entry)}
                        disabled={reschedulingId === entry.id}
                      >
                        <RefreshCw className="w-3 h-3" />
                        {reschedulingId === entry.id ? "Scheduling…" : "Reschedule reminder"}
                      </Button>
                    </div>
                  )}
                  {entry.pairingNotes && (
                    <div className="border border-[rgb(var(--border))] rounded-[var(--radius)] p-3 bg-[rgb(var(--bg-muted))]">
                      <p className="text-xs font-semibold text-[rgb(var(--text))] uppercase tracking-wide">
                        Pairing notes
                      </p>
                      <p className="mt-1 text-[rgb(var(--text))] leading-relaxed">{entry.pairingNotes}</p>
                    </div>
                  )}
                  {entry.notes && (
                    <div className="border border-[rgb(var(--border))] rounded-[var(--radius)] p-3">
                      <p className="text-xs font-semibold text-[rgb(var(--text))] uppercase tracking-wide">
                        Project notes
                      </p>
                      <p className="mt-1 text-[rgb(var(--text))] leading-relaxed">{entry.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
