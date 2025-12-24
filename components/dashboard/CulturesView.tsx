"use client";

import { useMemo, useState } from "react";
import { Bug, PlusCircle, Thermometer, Droplets, Trash2, Edit2, Check, X, Calendar, Hash } from "lucide-react";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { CultureEntry, CultureFormState, CultureType } from "@/types/culture";
import { formatDate, formatRelativeDate } from "@/lib/utils";
import { getSavedTempUnit, saveTempUnit } from "@/lib/temperature";
import { cToF, fToC } from "@/lib/utils";
import MarkdownRenderer from "@/components/ui/MarkdownRenderer";

interface CulturesViewProps {
    entries: CultureEntry[];
    onCreate: (form: CultureFormState) => Promise<void>;
    onUpdate: (id: string, form: CultureFormState) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onQuickUpdate: (id: string, field: "lastFed" | "lastCleaned", value: string) => Promise<void>;
}

const CULTURE_TYPES: { value: CultureType; label: string }[] = [
    { value: "roach", label: "Roach" },
    { value: "isopod", label: "Isopod" },
    { value: "cricket", label: "Cricket" },
    { value: "mealworm", label: "Mealworm" },
    { value: "superworm", label: "Superworm" },
    { value: "other", label: "Other" },
];

const defaultForm = (): CultureFormState => ({
    name: "",
    cultureType: "roach",
    species: "",
    quantity: "",
    purchaseDate: "",
    lastFed: "",
    lastCleaned: "",
    temperature: "",
    temperatureUnit: getSavedTempUnit(),
    humidity: "",
    notes: "",
});

function cultureTypeBadgeClass(type: CultureType): string {
    switch (type) {
        case "roach":
            return "bg-amber-100 text-amber-800";
        case "isopod":
            return "bg-slate-200 text-slate-700";
        case "cricket":
            return "bg-lime-100 text-lime-800";
        case "mealworm":
            return "bg-yellow-100 text-yellow-800";
        case "superworm":
            return "bg-orange-100 text-orange-800";
        default:
            return "bg-[rgb(var(--bg-muted))] text-[rgb(var(--text-soft))]";
    }
}

export default function CulturesView({ entries, onCreate, onUpdate, onDelete, onQuickUpdate }: CulturesViewProps) {
    const [form, setForm] = useState<CultureFormState>(defaultForm);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const stats = useMemo(() => {
        const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
        const typeCounts: Record<CultureType, number> = {
            roach: 0,
            isopod: 0,
            cricket: 0,
            mealworm: 0,
            superworm: 0,
            other: 0,
        };
        let totalQuantity = 0;

        for (const entry of sorted) {
            typeCounts[entry.cultureType] = (typeCounts[entry.cultureType] ?? 0) + 1;
            if (typeof entry.quantity === "number") {
                totalQuantity += entry.quantity;
            }
        }

        return { sorted, typeCounts, totalQuantity };
    }, [entries]);

    const handleChange = (key: keyof CultureFormState) => (value: string) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        if (statusMessage) setStatusMessage(null);
        if (error) setError(null);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!form.name.trim()) {
            setError("Name is required.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            if (editingId) {
                await onUpdate(editingId, form);
                setStatusMessage("Culture updated.");
                setEditingId(null);
            } else {
                await onCreate(form);
                setStatusMessage("Culture added.");
            }
            setForm(defaultForm());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to save culture.");
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (entry: CultureEntry) => {
        setEditingId(entry.id);
        setForm({
            name: entry.name,
            cultureType: entry.cultureType,
            species: entry.species ?? "",
            quantity: entry.quantity?.toString() ?? "",
            purchaseDate: entry.purchaseDate ? entry.purchaseDate.slice(0, 10) : "",
            lastFed: entry.lastFed ? entry.lastFed.slice(0, 10) : "",
            lastCleaned: entry.lastCleaned ? entry.lastCleaned.slice(0, 10) : "",
            temperature: entry.temperature?.toString() ?? "",
            temperatureUnit: entry.temperatureUnit ?? getSavedTempUnit(),
            humidity: entry.humidity?.toString() ?? "",
            notes: entry.notes ?? "",
        });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setForm(defaultForm());
        setError(null);
        setStatusMessage(null);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this culture?")) return;
        setDeletingId(id);
        setError(null);
        try {
            await onDelete(id);
            setStatusMessage("Culture removed.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to delete culture.");
        } finally {
            setDeletingId(null);
        }
    };

    const handleQuickFed = async (id: string) => {
        setUpdatingId(id);
        try {
            await onQuickUpdate(id, "lastFed", new Date().toISOString().slice(0, 10));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to update.");
        } finally {
            setUpdatingId(null);
        }
    };

    const handleQuickCleaned = async (id: string) => {
        setUpdatingId(id);
        try {
            await onQuickUpdate(id, "lastCleaned", new Date().toISOString().slice(0, 10));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to update.");
        } finally {
            setUpdatingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <Card elevated className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-amber-600/20 via-amber-500/10 to-transparent border-b border-[rgb(var(--border))]">
                    <div className="flex items-center gap-3">
                        <Bug className="w-6 h-6 text-amber-600" />
                        <div>
                            <CardTitle className="text-xl">{editingId ? "Edit Culture" : "Cultures"}</CardTitle>
                            <p className="text-sm text-[rgb(var(--text-subtle))]">
                                Track your colonies: roaches, isopods, crickets, and more.
                            </p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                                    Name <span className="text-[rgb(var(--danger))]">*</span>
                                </label>
                                <Input
                                    placeholder="e.g., Dubia Colony #1"
                                    value={form.name}
                                    onChange={(e) => handleChange("name")(e.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                                    Type
                                </label>
                                <select
                                    className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]"
                                    value={form.cultureType}
                                    onChange={(e) => handleChange("cultureType")(e.target.value)}
                                >
                                    {CULTURE_TYPES.map((t) => (
                                        <option key={t.value} value={t.value}>
                                            {t.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="grid sm:grid-cols-3 gap-4">
                            <div>
                                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                                    Species
                                </label>
                                <Input
                                    placeholder="e.g., Blaptica dubia"
                                    value={form.species}
                                    onChange={(e) => handleChange("species")(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--text))] mb-1.5">
                                    <Hash className="w-4 h-4" />
                                    Quantity
                                </label>
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    placeholder="Estimated count"
                                    value={form.quantity}
                                    onChange={(e) => handleChange("quantity")(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--text))] mb-1.5">
                                    <Calendar className="w-4 h-4" />
                                    Purchase Date
                                </label>
                                <Input
                                    type="date"
                                    value={form.purchaseDate}
                                    onChange={(e) => handleChange("purchaseDate")(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="grid sm:grid-cols-3 gap-4">
                            <div>
                                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                                    Last Fed
                                </label>
                                <Input
                                    type="date"
                                    value={form.lastFed}
                                    onChange={(e) => handleChange("lastFed")(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                                    Last Cleaned
                                </label>
                                <Input
                                    type="date"
                                    value={form.lastCleaned}
                                    onChange={(e) => handleChange("lastCleaned")(e.target.value)}
                                />
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--text))]">
                                        <Thermometer className="w-4 h-4" />
                                        Temperature
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
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--text))] mb-1.5">
                                    <Droplets className="w-4 h-4" />
                                    Humidity (%)
                                </label>
                                <Input
                                    type="number"
                                    inputMode="decimal"
                                    placeholder="%"
                                    value={form.humidity}
                                    onChange={(e) => handleChange("humidity")(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                                    Notes
                                </label>
                                <textarea
                                    value={form.notes}
                                    onChange={(e) => handleChange("notes")(e.target.value)}
                                    className="w-full min-h-[60px] rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm"
                                    placeholder="Substrate, feeding schedule, care notes..."
                                />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                            <Button type="submit" disabled={saving} className="gap-2">
                                {editingId ? <Check className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
                                {saving ? "Saving…" : editingId ? "Update culture" : "Add culture"}
                            </Button>
                            {editingId && (
                                <Button type="button" variant="ghost" onClick={handleCancelEdit}>
                                    <X className="w-4 h-4" />
                                    Cancel
                                </Button>
                            )}
                            {statusMessage && <span className="text-sm text-emerald-700">{statusMessage}</span>}
                            {error && <span className="text-sm text-[rgb(var(--danger))]">{error}</span>}
                        </div>
                    </form>
                </CardContent>
            </Card>

            {stats.sorted.length === 0 ? (
                <Card className="p-6 text-center">
                    <div className="flex flex-col items-center gap-3 text-[rgb(var(--text-soft))]">
                        <Bug className="w-10 h-10 opacity-70" />
                        <p className="text-base font-medium text-[rgb(var(--text))]">No cultures yet</p>
                        <p className="text-sm max-w-md">
                            Start tracking your colonies to manage food sources for your tarantulas.
                        </p>
                    </div>
                </Card>
            ) : (
                <>
                    <div className="grid sm:grid-cols-3 gap-4">
                        <Card>
                            <CardHeader className="pb-0">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Bug className="w-4 h-4 text-amber-600" />
                                    Total cultures
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-3">
                                <p className="text-3xl font-semibold text-[rgb(var(--text))]">{stats.sorted.length}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-0">
                                <CardTitle className="text-base">Estimated count</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-3">
                                <p className="text-3xl font-semibold text-[rgb(var(--text))]">
                                    {stats.totalQuantity > 0 ? stats.totalQuantity.toLocaleString() : "—"}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-0">
                                <CardTitle className="text-base">By type</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-3 flex flex-wrap gap-2">
                                {CULTURE_TYPES.filter((t) => stats.typeCounts[t.value] > 0).map((t) => (
                                    <span key={t.value} className={`text-xs px-2 py-1 rounded-full ${cultureTypeBadgeClass(t.value)}`}>
                                        {t.label}: {stats.typeCounts[t.value]}
                                    </span>
                                ))}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-4">
                        {stats.sorted.map((entry) => (
                            <Card key={entry.id} elevated>
                                <CardHeader className="flex-row items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-lg font-semibold text-[rgb(var(--text))]">
                                                {entry.name}
                                            </h3>
                                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${cultureTypeBadgeClass(entry.cultureType)}`}>
                                                {CULTURE_TYPES.find((t) => t.value === entry.cultureType)?.label ?? entry.cultureType}
                                            </span>
                                        </div>
                                        {entry.species && (
                                            <p className="text-sm text-[rgb(var(--text-soft))] italic">{entry.species}</p>
                                        )}
                                        <p className="text-xs text-[rgb(var(--text-subtle))]">
                                            Added {formatRelativeDate(entry.createdAt)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEdit(entry)}
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(entry.id)}
                                            disabled={deletingId === entry.id}
                                            className="text-[rgb(var(--danger))]"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="grid sm:grid-cols-4 gap-3 text-sm">
                                        <div className="rounded-[var(--radius)] border border-[rgb(var(--border))] p-3">
                                            <p className="text-xs text-[rgb(var(--text-subtle))] uppercase tracking-wide">
                                                Quantity
                                            </p>
                                            <p className="text-base font-semibold text-[rgb(var(--text))]">
                                                {typeof entry.quantity === "number" ? entry.quantity.toLocaleString() : "—"}
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
                                                Purchased
                                            </p>
                                            <p className="text-base font-semibold text-[rgb(var(--text))]">
                                                {entry.purchaseDate ? formatDate(entry.purchaseDate) : "—"}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="grid sm:grid-cols-2 gap-3">
                                        <div className="rounded-[var(--radius)] border border-[rgb(var(--border))] p-3 flex items-center justify-between">
                                            <div>
                                                <p className="text-xs text-[rgb(var(--text-subtle))] uppercase tracking-wide">
                                                    Last Fed
                                                </p>
                                                <p className="text-sm font-semibold text-[rgb(var(--text))]">
                                                    {entry.lastFed ? `${formatDate(entry.lastFed)} (${formatRelativeDate(entry.lastFed)})` : "—"}
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => handleQuickFed(entry.id)}
                                                disabled={updatingId === entry.id}
                                            >
                                                Fed today
                                            </Button>
                                        </div>
                                        <div className="rounded-[var(--radius)] border border-[rgb(var(--border))] p-3 flex items-center justify-between">
                                            <div>
                                                <p className="text-xs text-[rgb(var(--text-subtle))] uppercase tracking-wide">
                                                    Last Cleaned
                                                </p>
                                                <p className="text-sm font-semibold text-[rgb(var(--text))]">
                                                    {entry.lastCleaned ? `${formatDate(entry.lastCleaned)} (${formatRelativeDate(entry.lastCleaned)})` : "—"}
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => handleQuickCleaned(entry.id)}
                                                disabled={updatingId === entry.id}
                                            >
                                                Cleaned today
                                            </Button>
                                        </div>
                                    </div>
                                    {entry.notes && (
                                        <div className="border border-[rgb(var(--border))] rounded-[var(--radius)] p-3 text-sm bg-[rgb(var(--bg-muted))]">
                                            <p className="text-xs font-semibold text-[rgb(var(--text))] uppercase tracking-wide">
                                                Notes
                                            </p>
                                            <div className="mt-1 text-[rgb(var(--text))] leading-relaxed"><MarkdownRenderer>{entry.notes}</MarkdownRenderer></div>
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
