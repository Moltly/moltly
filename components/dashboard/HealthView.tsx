"use client";

import { useMemo, useState } from "react";
import { HeartPulse, PlusCircle, Thermometer, Droplets, RefreshCw, Trash2, Stethoscope, Ruler } from "lucide-react";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import SpeciesAutosuggest from "@/components/ui/SpeciesAutosuggest";
import type { HealthEntry, HealthFormState } from "@/types/health";
import { formatDate, formatRelativeDate } from "@/lib/utils";
import { cToF, fToC } from "@/lib/utils";
import { getSavedTempUnit, saveTempUnit } from "@/lib/temperature";

interface HealthViewProps {
  entries: HealthEntry[];
  onCreate: (form: HealthFormState) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onScheduleFollowUpRetry: (entry: HealthEntry) => Promise<void>;
}

const defaultForm = (): HealthFormState => ({
  specimen: "",
  species: "",
  date: new Date().toISOString().slice(0, 10),
  enclosureDimensions: "",
  temperature: "",
  temperatureUnit: getSavedTempUnit(),
  humidity: "",
  condition: "Stable",
  behavior: "",
  healthIssues: "",
  treatment: "",
  followUpDate: "",
  notes: "",
});

function conditionBadgeClass(condition: HealthEntry["condition"]): string {
  switch (condition) {
    case "Critical":
      return "bg-[rgb(var(--danger-soft))] text-[rgb(var(--danger))]";
    case "Observation":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-emerald-100 text-emerald-700";
  }
}

export default function HealthView({ entries, onCreate, onDelete, onScheduleFollowUpRetry }: HealthViewProps) {
  const [form, setForm] = useState<HealthFormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const sorted = [...entries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const conditionCounts: Record<HealthEntry["condition"], number> = {
      Stable: 0,
      Observation: 0,
      Critical: 0,
    };
    let latestEnclosureEntry: HealthEntry | null = null;

    for (const entry of sorted) {
      conditionCounts[entry.condition] = (conditionCounts[entry.condition] ?? 0) + 1;
      if (!latestEnclosureEntry && entry.enclosureDimensions) {
        latestEnclosureEntry = entry;
      }
    }

    const upcomingFollowUps = sorted
      .filter((entry) => entry.followUpDate)
      .sort(
        (a, b) =>
          new Date(a.followUpDate as string).getTime() -
          new Date(b.followUpDate as string).getTime()
      )
      .slice(0, 3);

    return {
      sorted,
      latest: sorted[0] ?? null,
      conditionCounts,
      latestEnclosureEntry,
      upcomingFollowUps,
    };
  }, [entries]);

  const handleChange = (key: keyof HealthFormState) => (value: string) => {
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
      setStatusMessage("Health log saved.");
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
      setStatusMessage("Health entry removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete entry.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleReschedule = async (entry: HealthEntry) => {
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
        <CardHeader className="bg-gradient-to-r from-emerald-600/20 via-emerald-500/10 to-transparent border-b border-[rgb(var(--border))]">
          <div className="flex items-center gap-3">
            <HeartPulse className="w-6 h-6 text-emerald-600" />
            <div>
              <CardTitle className="text-xl">Health Tracking</CardTitle>
              <p className="text-sm text-[rgb(var(--text-subtle))]">
                Log enclosure size, behavior, and advisory notes to monitor specimen wellness.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                  Specimen
                </label>
                <Input
                  placeholder="e.g., Rosie"
                  value={form.specimen}
                  onChange={(e) => handleChange("specimen")(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                  Species
                </label>
                <SpeciesAutosuggest
                  placeholder="e.g., Brachypelma hamorii"
                  value={form.species}
                  onChange={(next) => handleChange("species")(next)}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--text))] mb-1.5">
                  <Stethoscope className="w-4 h-4" />
                  Condition
                </label>
                <select
                  className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]"
                  value={form.condition}
                  onChange={(e) => handleChange("condition")(e.target.value)}
                >
                  <option value="Stable">Stable</option>
                  <option value="Observation">Observation</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--text))]">
                    <Thermometer className="w-4 h-4" />
                    Temperature ({form.temperatureUnit === "F" ? "°F" : "°C"})
                  </label>
                  <div className="inline-flex rounded-[var(--radius)] border border-[rgb(var(--border))] overflow-hidden">
                    <button
                      type="button"
                      className={`px-2 py-0.5 text-xs ${form.temperatureUnit === "C" ? "bg-[rgb(var(--primary-soft))] text-[rgb(var(--primary-strong))]" : "text-[rgb(var(--text-soft))]"}`}
                      onClick={() => {
                        if (form.temperatureUnit !== "C") {
                          const next = form.temperature ? (Math.round(fToC(Number(form.temperature)) * 10) / 10).toString() : form.temperature;
                          setForm((prev) => ({ ...prev, temperatureUnit: "C", temperature: next }));
                          saveTempUnit("C");
                        }
                      }}
                      aria-label="Use Celsius"
                    >
                      °C
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-0.5 text-xs ${form.temperatureUnit === "F" ? "bg-[rgb(var(--primary-soft))] text-[rgb(var(--primary-strong))]" : "text-[rgb(var(--text-soft))]"}`}
                      onClick={() => {
                        if (form.temperatureUnit !== "F") {
                          const next = form.temperature ? (Math.round(cToF(Number(form.temperature)) * 10) / 10).toString() : form.temperature;
                          setForm((prev) => ({ ...prev, temperatureUnit: "F", temperature: next }));
                          saveTempUnit("F");
                        }
                      }}
                      aria-label="Use Fahrenheit"
                    >
                      °F
                    </button>
                  </div>
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder={form.temperatureUnit === "F" ? "°F" : "°C"}
                  value={form.temperature}
                  onChange={(e) => handleChange("temperature")(e.target.value)}
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--text))] mb-1.5">
                  <Droplets className="w-4 h-4" />
                  Humidity
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="%"
                  value={form.humidity}
                  onChange={(e) => handleChange("humidity")(e.target.value)}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                  Log Date
                </label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => handleChange("date")(e.target.value)}
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--text))] mb-1.5">
                  <Ruler className="w-4 h-4" />
                  Enclosure dimensions
                </label>
                <Input
                  placeholder="L×W×H (e.g., 30×30×30 cm or 12×12×12 in)"
                  value={form.enclosureDimensions}
                  onChange={(e) => handleChange("enclosureDimensions")(e.target.value)}
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
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                  Behavior notes
                </label>
                <textarea
                  value={form.behavior}
                  onChange={(e) => handleChange("behavior")(e.target.value)}
                  className="w-full min-h-[90px] rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm"
                  placeholder="Activity changes, appetite, temperament…"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                  Health concerns / treatment
                </label>
                <textarea
                  value={form.healthIssues}
                  onChange={(e) => handleChange("healthIssues")(e.target.value)}
                  className="w-full min-h-[90px] rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm"
                  placeholder="Visible issues, medical notes…"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                Advisory notes
              </label>
              <textarea
                value={form.treatment}
                onChange={(e) => handleChange("treatment")(e.target.value)}
                className="w-full min-h-[70px] rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm"
                placeholder="Medication, advisory notes, supportive care…"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                Additional notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => handleChange("notes")(e.target.value)}
                className="w-full min-h-[70px] rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm"
                placeholder="General observations or reminders."
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button type="submit" disabled={saving} className="gap-2">
                <PlusCircle className="w-4 h-4" />
                {saving ? "Saving…" : "Save health log"}
              </Button>
              {statusMessage && <span className="text-sm text-emerald-700">{statusMessage}</span>}
              {error && <span className="text-sm text-[rgb(var(--danger))]">{error}</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      {stats.sorted.length === 0 ? (
        <Card className="p-6 text-center">
          <div className="flex flex-col items-center gap-3 text-[rgb(var(--text-soft))]">
            <HeartPulse className="w-10 h-10 opacity-70" />
            <p className="text-base font-medium text-[rgb(var(--text))]">No health entries yet</p>
              <p className="text-sm max-w-md">
              Start logging enclosure size, behavior, and advisory notes to catch trends early and keep your tarantulas thriving.
              </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-emerald-600" />
                  Condition overview
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 pt-3">
                {(["Stable", "Observation", "Critical"] as HealthEntry["condition"][]).map((key) => (
                  <div key={key} className="text-center">
                    <div className="text-2xl font-semibold text-[rgb(var(--text))]">{stats.conditionCounts[key]}</div>
                    <div className="text-xs text-[rgb(var(--text-subtle))]">{key}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-base">Latest enclosure size</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <p className="text-3xl font-semibold text-[rgb(var(--text))]">
                  {stats.latestEnclosureEntry?.enclosureDimensions || "—"}
                </p>
                <p className="text-xs text-[rgb(var(--text-subtle))]">Most recent logged entry</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-base">Upcoming follow-ups</CardTitle>
              </CardHeader>
              <CardContent className="pt-3 space-y-2">
                {stats.upcomingFollowUps.length === 0 ? (
                  <p className="text-sm text-[rgb(var(--text-subtle))]">No follow-up reminders scheduled.</p>
                ) : (
                  stats.upcomingFollowUps.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-[rgb(var(--text))]">
                          {entry.specimen || entry.species || "Unnamed"}
                        </p>
                        <p className="text-xs text-[rgb(var(--text-subtle))]">
                          {formatDate(entry.followUpDate as string)} • {formatRelativeDate(entry.followUpDate as string)}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[rgb(var(--bg-muted))] text-xs">
                        {entry.condition}
                      </span>
                    </div>
                  ))
                )}
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
                        {entry.specimen || entry.species || "Unnamed specimen"}
                      </h3>
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${conditionBadgeClass(entry.condition)}`}
                      >
                        {entry.condition}
                      </span>
                    </div>
                    <p className="text-xs text-[rgb(var(--text-subtle))]">
                      {formatDate(entry.date)} • {formatRelativeDate(entry.date)}
                    </p>
                    {entry.species && (
                      <p className="text-xs text-[rgb(var(--text-subtle))] uppercase tracking-wide">
                        <a href={`/species/${encodeURIComponent(entry.species)}`} className="hover:underline">
                          {entry.species}
                        </a>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
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
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid sm:grid-cols-4 gap-3 text-sm">
                    <div className="rounded-[var(--radius)] border border-[rgb(var(--border))] p-3">
                      <p className="text-xs text-[rgb(var(--text-subtle))] uppercase tracking-wide">
                        Enclosure
                      </p>
                      <p className="text-base font-semibold text-[rgb(var(--text))]">
                        {entry.enclosureDimensions || "—"}
                      </p>
                    </div>
                    <div className="rounded-[var(--radius)] border border-[rgb(var(--border))] p-3">
                      <p className="text-xs text-[rgb(var(--text-subtle))] uppercase tracking-wide">
                        Temperature
                      </p>
                      <p className="text-base font-semibold text-[rgb(var(--text))]">
                        {typeof entry.temperature === "number" ? `${entry.temperature}°${entry.temperatureUnit === "F" ? "F" : "C"}` : "—"}
                      </p>
                    </div>
                    <div className="rounded-[var(--radius)] border border-[rgb(var(--border))] p-3">
                      <p className="text-xs text-[rgb(var(--text-subtle))] uppercase tracking-wide">
                        Humidity
                      </p>
                      <p className="text-base font-semibold text-[rgb(var(--text))]">
                        {typeof entry.humidity === "number" ? `${entry.humidity}%` : "—"}
                      </p>
                    </div>
                    <div className="rounded-[var(--radius)] border border-[rgb(var(--border))] p-3">
                      <p className="text-xs text-[rgb(var(--text-subtle))] uppercase tracking-wide">
                        Follow-up
                      </p>
                      {entry.followUpDate ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-base font-semibold text-[rgb(var(--text))]">
                            {formatDate(entry.followUpDate)}
                          </span>
                          <span className="text-xs text-[rgb(var(--text-subtle))]">
                            {formatRelativeDate(entry.followUpDate)}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="justify-start text-xs text-[rgb(var(--primary))] px-0"
                            onClick={() => handleReschedule(entry)}
                            disabled={reschedulingId === entry.id}
                          >
                            <RefreshCw className="w-3 h-3" />
                            {reschedulingId === entry.id ? "Scheduling…" : "Reschedule reminder"}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-base text-[rgb(var(--text-subtle))]">—</span>
                      )}
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    {entry.behavior && (
                      <div className="border border-[rgb(var(--border))] rounded-[var(--radius)] p-3 bg-[rgb(var(--bg-muted))]">
                        <p className="text-xs font-semibold text-[rgb(var(--text))] uppercase tracking-wide">
                          Behavior
                        </p>
                        <p className="mt-1 text-[rgb(var(--text))] leading-relaxed">{entry.behavior}</p>
                      </div>
                    )}
                    {entry.healthIssues && (
                      <div className="border border-[rgb(var(--border))] rounded-[var(--radius)] p-3 bg-[rgb(var(--danger-soft))]/20">
                        <p className="text-xs font-semibold text-[rgb(var(--text))] uppercase tracking-wide">
                          Health notes
                        </p>
                        <p className="mt-1 text-[rgb(var(--text))] leading-relaxed">{entry.healthIssues}</p>
                      </div>
                    )}
                  </div>
                  {entry.treatment && (
                    <div className="border border-[rgb(var(--border))] rounded-[var(--radius)] p-3 text-sm">
                      <p className="text-xs font-semibold text-[rgb(var(--text))] uppercase tracking-wide">
                        Advisory notes
                      </p>
                      <p className="mt-1 text-[rgb(var(--text))] leading-relaxed">{entry.treatment}</p>
                    </div>
                  )}
                  {entry.notes && (
                    <div className="border border-[rgb(var(--border))] rounded-[var(--radius)] p-3 text-sm">
                      <p className="text-xs font-semibold text-[rgb(var(--text))] uppercase tracking-wide">
                        Additional notes
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
