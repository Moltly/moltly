"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Github, FileText, Shield, Coffee, Smartphone, Sparkles, LogOut, ExternalLink, Upload, Download } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import OverviewView from "@/components/dashboard/OverviewView";
import ActivityView from "@/components/dashboard/ActivityView";
import SpecimensView from "@/components/dashboard/SpecimensView";
import RemindersView from "@/components/dashboard/RemindersView";
import EntryFormModal from "@/components/dashboard/EntryFormModal";
import NotebookView from "@/components/dashboard/NotebookView";
import HealthView from "@/components/dashboard/HealthView";
import BreedingView from "@/components/dashboard/BreedingView";
import type { MoltEntry, ViewKey, DataMode, Stage, EntryType, FormState, Attachment } from "@/types/molt";
import type { HealthEntry, HealthFormState } from "@/types/health";
import type { BreedingEntry, BreedingFormState } from "@/types/breeding";
import type { ResearchStack, ResearchNote } from "@/types/research";
import { readLocalEntries, writeLocalEntries } from "@/lib/local-entries";
import { readLocalHealthEntries, writeLocalHealthEntries } from "@/lib/local-health";
import { readLocalBreedingEntries, writeLocalBreedingEntries } from "@/lib/local-breeding";
import { readLocalResearchStacks, writeLocalResearchStacks } from "@/lib/local-research";
import { APP_VERSION, LAST_SEEN_VERSION_KEY } from "@/lib/app-version";
import { getUpdatesSince, type ChangelogEntry } from "@/lib/changelog";
import { getSavedTempUnit } from "@/lib/temperature";
import { cancelReminderNotification, scheduleReminderNotification } from "@/lib/notifications";

const defaultForm = (): FormState => ({
  entryType: "molt",
  specimen: "",
  species: "",
  date: new Date().toISOString().slice(0, 10),
  stage: "Molt",
  oldSize: "",
  newSize: "",
  humidity: "",
  temperature: "",
  temperatureUnit: getSavedTempUnit(),
  notes: "",
  reminderDate: "",
  feedingPrey: "",
  feedingOutcome: "",
  feedingAmount: "",
});

const parseNumber = (value: string): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const healthReminderKey = (id: string) => `health:${id}`;
const breedingReminderKey = (id: string) => `breeding:${id}`;

export default function MobileDashboard() {
  const { data: session, status } = useSession();
  const mode: DataMode | null = status === "loading" ? null : session?.user?.id ? "sync" : "local";
  const isSync = mode === "sync";

  const [activeView, setActiveView] = useState<ViewKey>("overview");
  const [entries, setEntries] = useState<MoltEntry[]>([]);
  const [healthEntries, setHealthEntries] = useState<HealthEntry[]>([]);
  const [breedingEntries, setBreedingEntries] = useState<BreedingEntry[]>([]);
  const [, setLoading] = useState(true); // internal fetch state
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [stacks, setStacks] = useState<ResearchStack[]>([]);
  const [selectedStackId, setSelectedStackId] = useState<string | null>(null);
  const [pendingUpdates, setPendingUpdates] = useState<ChangelogEntry[]>([]);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [hasPasswordAccount, setHasPasswordAccount] = useState<boolean | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const importInputId = "moltly-import-input";

  // Cross-platform export helper: uses Capacitor on native platforms, falls back to web download
  const exportJsonText = useCallback(async (jsonText: string) => {
    const filename = `moltly-export-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      if (Capacitor.getPlatform() !== "web") {
        // Try native share via Filesystem + Share
        try {
          const modFS = await import("@capacitor/filesystem");
          const modShare = await import("@capacitor/share");
          const { Filesystem, Directory, Encoding } = modFS;
          const { Share } = modShare;

          await Filesystem.writeFile({
            path: filename,
            data: jsonText,
            directory: Directory.Cache,
            encoding: Encoding.UTF8,
          });
          const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: filename });
          await Share.share({ title: filename, url: uri, dialogTitle: "Export data" });
          return;
        } catch (e) {
          // Fallback to web-style download if native plugins are unavailable
        }
      }

      // Web fallback (or native fallback)
      const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      throw err;
    }
  }, []);

  const persistLocal = useCallback(
    (list: MoltEntry[]) => {
      if (mode === "local") writeLocalEntries(list as unknown as Record<string, unknown>[]);
    },
    [mode]
  );

  const persistHealthLocal = useCallback(
    (list: HealthEntry[]) => {
      if (mode === "local") writeLocalHealthEntries(list as unknown as Record<string, unknown>[]);
    },
    [mode]
  );

  const persistBreedingLocal = useCallback(
    (list: BreedingEntry[]) => {
      if (mode === "local") writeLocalBreedingEntries(list as unknown as Record<string, unknown>[]);
    },
    [mode]
  );

  // Load entries
  useEffect(() => {
    const load = async () => {
      if (!mode) return;
      setLoading(true);
      try {
        if (isSync) {
          const res = await fetch("/api/logs", { credentials: "include" });
          if (!res.ok) throw new Error("Failed to load entries");
          const data = await res.json();
          setEntries(Array.isArray(data) ? (data as MoltEntry[]) : []);
        } else {
          setEntries(readLocalEntries() as unknown as MoltEntry[]);
        }
      } catch (err) {
        console.error(err);
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [mode, isSync]);

  useEffect(() => {
    const loadHealth = async () => {
      if (!mode) return;
      setLoading(true);
      try {
        if (isSync) {
          const res = await fetch("/api/health", { credentials: "include" });
          if (!res.ok) throw new Error("Failed to load health entries");
          const data = await res.json();
          setHealthEntries(Array.isArray(data) ? (data as HealthEntry[]) : []);
        } else {
          setHealthEntries(readLocalHealthEntries() as unknown as HealthEntry[]);
        }
      } catch (err) {
        console.error(err);
        setHealthEntries([]);
      } finally {
        setLoading(false);
      }
    };
    void loadHealth();
  }, [mode, isSync]);

  useEffect(() => {
    const loadBreeding = async () => {
      if (!mode) return;
      setLoading(true);
      try {
        if (isSync) {
          const res = await fetch("/api/breeding", { credentials: "include" });
          if (!res.ok) throw new Error("Failed to load breeding entries");
          const data = await res.json();
          setBreedingEntries(Array.isArray(data) ? (data as BreedingEntry[]) : []);
        } else {
          setBreedingEntries(readLocalBreedingEntries() as unknown as BreedingEntry[]);
        }
      } catch (err) {
        console.error(err);
        setBreedingEntries([]);
      } finally {
        setLoading(false);
      }
    };
    void loadBreeding();
  }, [mode, isSync]);

  // Load research stacks
  useEffect(() => {
    const loadStacks = async () => {
      if (!mode) return;
      setLoading(true);
      try {
        if (isSync) {
          const res = await fetch("/api/research", { credentials: "include" });
          if (!res.ok) throw new Error("Failed to load research stacks");
          const data = (await res.json()) as ResearchStack[];
          setStacks(Array.isArray(data) ? data : []);
          if (data.length > 0) setSelectedStackId((prev) => prev ?? data[0].id);
        } else {
          const localStacks = readLocalResearchStacks();
          setStacks(localStacks);
          if (localStacks.length > 0) setSelectedStackId((prev) => prev ?? localStacks[0].id);
        }
      } catch (err) {
        console.error(err);
        setStacks([]);
      } finally {
        setLoading(false);
      }
    };
    void loadStacks();
  }, [mode, isSync]);

  // Changelog first-run modal
  useEffect(() => {
    const lastSeen = typeof window !== "undefined" ? window.localStorage.getItem(LAST_SEEN_VERSION_KEY) : null;
    const updates = getUpdatesSince(lastSeen);
    if (updates.length > 0) {
      setPendingUpdates(updates);
      setShowChangelog(true);
    }
  }, []);

  useEffect(() => {
    const loadPasswordStatus = async () => {
      if (!showInfo || !isSync) return;
      try {
        const res = await fetch("/api/account/password", { method: "GET", credentials: "include" });
        if (!res.ok) throw new Error("Failed to load account status");
        const data = (await res.json()) as { hasPassword?: boolean };
        setHasPasswordAccount(Boolean(data.hasPassword));
      } catch (err) {
        console.error(err);
        setHasPasswordAccount(null);
      }
    };
    void loadPasswordStatus();
  }, [showInfo, isSync]);

  // Scroll-to-top button visibility
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 320);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const openNewEntry = () => {
    setEditingId(null);
    setFormState(defaultForm());
    setAttachments([]);
    setFormOpen(true);
  };

  const onEdit = (entry: MoltEntry) => {
    setEditingId(entry.id);
    setFormState({
      entryType: entry.entryType,
      specimen: entry.specimen ?? "",
      species: entry.species ?? "",
      date: entry.date.slice(0, 10),
      stage: entry.stage ?? "Molt",
      oldSize: entry.oldSize?.toString() ?? "",
      newSize: entry.newSize?.toString() ?? "",
      humidity: entry.humidity?.toString() ?? "",
      temperature: entry.temperature?.toString() ?? "",
      temperatureUnit: entry.temperatureUnit === "F" ? "F" : "C",
      notes: entry.notes ?? "",
      reminderDate: entry.reminderDate ? entry.reminderDate.slice(0, 10) : "",
      feedingPrey: entry.feedingPrey ?? "",
      feedingOutcome: entry.feedingOutcome ?? "",
      feedingAmount: entry.feedingAmount ?? "",
    });
    setAttachments(entry.attachments ?? []);
    setFormOpen(true);
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    if (!mode) return;
    if (isSync) {
      const res = await fetch(`/api/logs/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } else {
      const next = entries.filter((e) => e.id !== id);
      setEntries(next);
      persistLocal(next);
    }
    try {
      await cancelReminderNotification(id);
    } catch {}
  };

  const onSubmit = async () => {
    const isMolt = formState.entryType === "molt";
    const isFeeding = formState.entryType === "feeding";
    if (isMolt && !formState.species.trim()) {
      alert("Species is required for molt entries.");
      return;
    }

    const payload = {
      entryType: formState.entryType,
      specimen: formState.specimen.trim() || undefined,
      species: formState.species.trim() || undefined,
      date: formState.date,
      stage: isMolt ? formState.stage : undefined,
      oldSize: isMolt && formState.oldSize ? Number(formState.oldSize) : undefined,
      newSize: isMolt && formState.newSize ? Number(formState.newSize) : undefined,
      humidity: formState.humidity ? Number(formState.humidity) : undefined,
      temperature: formState.temperature ? Number(formState.temperature) : undefined,
      temperatureUnit: formState.temperature ? formState.temperatureUnit : undefined,
      notes: formState.notes.trim() || undefined,
      reminderDate: formState.reminderDate || undefined,
      feedingPrey: isFeeding ? formState.feedingPrey.trim() || undefined : undefined,
      feedingOutcome: isFeeding && formState.feedingOutcome ? formState.feedingOutcome : undefined,
      feedingAmount: isFeeding ? formState.feedingAmount.trim() || undefined : undefined,
      attachments,
    };

    if (!mode) return;

    if (isSync) {
      const res = await fetch(editingId ? `/api/logs/${editingId}` : "/api/logs", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        alert("Unable to save entry");
        return;
      }
      const saved = (await res.json()) as MoltEntry;
      setEntries((prev) => (editingId ? prev.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...prev]));
      // Schedule/cancel local notification via Capacitor
      try {
        const prev = editingId ? entries.find((e) => e.id === editingId) : undefined;
        const prevDate = prev?.reminderDate;
        const nextDate = saved.reminderDate;
        if (prevDate && !nextDate) {
          await cancelReminderNotification(saved.id);
        } else if (nextDate) {
          await scheduleReminderNotification({
            id: saved.id,
            dateISO: nextDate.slice(0, 10),
            title: `Reminder: ${saved.specimen || "Unnamed"}`,
            body: saved.notes || (saved.entryType === "feeding" ? "Feeding due." : saved.entryType === "water" ? "Water change due." : "Care reminder."),
          });
        }
      } catch (err) {
        console.warn("Local notification scheduling failed", err);
      }
    } else {
      const nowIso = new Date().toISOString();
      const saved: MoltEntry = {
        id: editingId ?? crypto.randomUUID(),
        entryType: payload.entryType as EntryType,
        specimen: payload.specimen ?? "Unnamed",
        species: payload.species,
        date: payload.date,
        stage: payload.stage as Stage | undefined,
        oldSize: payload.oldSize,
        newSize: payload.newSize,
      humidity: payload.humidity,
      temperature: payload.temperature,
      temperatureUnit: payload.temperatureUnit as MoltEntry["temperatureUnit"],
      notes: payload.notes,
        reminderDate: payload.reminderDate,
        feedingPrey: payload.feedingPrey,
        feedingOutcome: payload.feedingOutcome as MoltEntry["feedingOutcome"],
        feedingAmount: payload.feedingAmount,
        attachments: payload.attachments,
        createdAt: editingId ? entries.find((e) => e.id === editingId)?.createdAt ?? nowIso : nowIso,
        updatedAt: nowIso,
      };
      const next = editingId ? entries.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...entries];
      setEntries(next);
      persistLocal(next);
      try {
        const prev = editingId ? entries.find((e) => e.id === editingId) : undefined;
        const prevDate = prev?.reminderDate;
        const nextDate = saved.reminderDate;
        if (prevDate && !nextDate) {
          await cancelReminderNotification(saved.id);
        } else if (nextDate) {
          await scheduleReminderNotification({
            id: saved.id,
            dateISO: nextDate.slice(0, 10),
            title: `Reminder: ${saved.specimen || "Unnamed"}`,
            body: saved.notes || (saved.entryType === "feeding" ? "Feeding due." : saved.entryType === "water" ? "Water change due." : "Care reminder."),
          });
        }
      } catch (err) {
        console.warn("Local notification scheduling failed", err);
      }
    }

    setFormOpen(false);
    setEditingId(null);
    setFormState(defaultForm());
    setAttachments([]);
  };

  const createHealthEntry = async (form: HealthFormState) => {
    if (!mode) throw new Error("Please wait until the session is ready.");

    const payload = {
      specimen: form.specimen.trim() || undefined,
      species: form.species.trim() || undefined,
      date: form.date,
      weight: parseNumber(form.weight),
      weightUnit: form.weightUnit,
      temperature: parseNumber(form.temperature),
      temperatureUnit: form.temperature ? form.temperatureUnit : undefined,
      humidity: parseNumber(form.humidity),
      condition: form.condition,
      behavior: form.behavior.trim() || undefined,
      healthIssues: form.healthIssues.trim() || undefined,
      treatment: form.treatment.trim() || undefined,
      followUpDate: form.followUpDate || undefined,
      notes: form.notes.trim() || undefined,
      attachments: [] as Attachment[],
    };

    if (isSync) {
      const res = await fetch("/api/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Unable to save health entry.");
      }
      const saved = (await res.json()) as HealthEntry;
      setHealthEntries((prev) => [saved, ...prev]);
      if (saved.followUpDate) {
        try {
          await scheduleReminderNotification({
            id: healthReminderKey(saved.id),
            dateISO: saved.followUpDate.slice(0, 10),
            title: `Health follow-up: ${saved.specimen || saved.species || "Tarantula"}`,
            body: saved.healthIssues || saved.notes || "Check on specimen health.",
          });
        } catch (err) {
          console.warn("Unable to schedule health reminder", err);
        }
      }
      return;
    }

    const now = new Date().toISOString();
    const saved: HealthEntry = {
      id: crypto.randomUUID(),
      specimen: payload.specimen,
      species: payload.species,
      date: payload.date,
      weight: payload.weight,
      weightUnit: payload.weightUnit,
      temperature: payload.temperature,
      temperatureUnit: payload.temperatureUnit as HealthEntry["temperatureUnit"],
      humidity: payload.humidity,
      condition: payload.condition,
      behavior: payload.behavior,
      healthIssues: payload.healthIssues,
      treatment: payload.treatment,
      followUpDate: payload.followUpDate,
      notes: payload.notes,
      attachments: payload.attachments,
      createdAt: now,
      updatedAt: now,
    };
    const next = [saved, ...healthEntries];
    setHealthEntries(next);
    persistHealthLocal(next);
    if (saved.followUpDate) {
      try {
        await scheduleReminderNotification({
          id: healthReminderKey(saved.id),
          dateISO: saved.followUpDate.slice(0, 10),
          title: `Health follow-up: ${saved.specimen || saved.species || "Tarantula"}`,
          body: saved.healthIssues || saved.notes || "Check on specimen health.",
        });
      } catch (err) {
        console.warn("Unable to schedule health reminder", err);
      }
    }
  };

  const deleteHealthEntry = async (id: string) => {
    if (!mode) throw new Error("Please wait until the session is ready.");

    const existing = healthEntries.find((entry) => entry.id === id);

    if (isSync) {
      const res = await fetch(`/api/health/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Unable to delete entry.");
      }
    }

    const next = healthEntries.filter((entry) => entry.id !== id);
    setHealthEntries(next);
    persistHealthLocal(next);
    if (existing?.followUpDate) {
      try {
        await cancelReminderNotification(healthReminderKey(id));
      } catch {}
    }
  };

  const createBreedingEntry = async (form: BreedingFormState) => {
    if (!mode) throw new Error("Please wait until the session is ready.");

    const payload = {
      femaleSpecimen: form.femaleSpecimen.trim() || undefined,
      maleSpecimen: form.maleSpecimen.trim() || undefined,
      species: form.species.trim() || undefined,
      pairingDate: form.pairingDate,
      status: form.status,
      pairingNotes: form.pairingNotes.trim() || undefined,
      eggSacDate: form.eggSacDate || undefined,
      eggSacStatus: form.eggSacStatus,
      eggSacCount: parseNumber(form.eggSacCount),
      hatchDate: form.hatchDate || undefined,
      slingCount: parseNumber(form.slingCount),
      followUpDate: form.followUpDate || undefined,
      notes: form.notes.trim() || undefined,
      attachments: [] as Attachment[],
    };

    if (isSync) {
      const res = await fetch("/api/breeding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Unable to save breeding entry.");
      }
      const saved = (await res.json()) as BreedingEntry;
      setBreedingEntries((prev) => [saved, ...prev]);
      if (saved.followUpDate) {
        try {
          await scheduleReminderNotification({
            id: breedingReminderKey(saved.id),
            dateISO: saved.followUpDate.slice(0, 10),
            title: `Breeding follow-up: ${saved.femaleSpecimen || saved.species || "Specimen"}`,
            body: saved.notes || saved.pairingNotes || "Check breeding progress.",
          });
        } catch (err) {
          console.warn("Unable to schedule breeding reminder", err);
        }
      }
      return;
    }

    const now = new Date().toISOString();
    const saved: BreedingEntry = {
      id: crypto.randomUUID(),
      femaleSpecimen: payload.femaleSpecimen,
      maleSpecimen: payload.maleSpecimen,
      species: payload.species,
      pairingDate: payload.pairingDate,
      status: payload.status,
      pairingNotes: payload.pairingNotes,
      eggSacDate: payload.eggSacDate,
      eggSacStatus: payload.eggSacStatus,
      eggSacCount: payload.eggSacCount,
      hatchDate: payload.hatchDate,
      slingCount: payload.slingCount,
      followUpDate: payload.followUpDate,
      notes: payload.notes,
      attachments: payload.attachments,
      createdAt: now,
      updatedAt: now,
    };
    const next = [saved, ...breedingEntries];
    setBreedingEntries(next);
    persistBreedingLocal(next);
    if (saved.followUpDate) {
      try {
        await scheduleReminderNotification({
          id: breedingReminderKey(saved.id),
          dateISO: saved.followUpDate.slice(0, 10),
          title: `Breeding follow-up: ${saved.femaleSpecimen || saved.species || "Specimen"}`,
          body: saved.notes || saved.pairingNotes || "Check breeding progress.",
        });
      } catch (err) {
        console.warn("Unable to schedule breeding reminder", err);
      }
    }
  };

  const deleteBreedingEntry = async (id: string) => {
    if (!mode) throw new Error("Please wait until the session is ready.");

    const existing = breedingEntries.find((entry) => entry.id === id);

    if (isSync) {
      const res = await fetch(`/api/breeding/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Unable to delete breeding entry.");
      }
    }

    const next = breedingEntries.filter((entry) => entry.id !== id);
    setBreedingEntries(next);
    persistBreedingLocal(next);
    if (existing?.followUpDate) {
      try {
        await cancelReminderNotification(breedingReminderKey(id));
      } catch {}
    }
  };

  // Research stack actions (work in sync and local modes)
  const onCreateStack = async (stack: Partial<ResearchStack>) => {
    if (!mode) return;
    if (isSync) {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: stack.name,
          species: stack.species,
          category: stack.category,
          description: stack.description,
          tags: stack.tags ?? [],
          notes: stack.notes ?? [],
        }),
      });
      if (!res.ok) return;
      const saved = (await res.json()) as ResearchStack;
      setStacks((prev) => [saved, ...prev]);
      setSelectedStackId(saved.id);
      return;
    }
    const now = new Date().toISOString();
    const saved: ResearchStack = {
      id: crypto.randomUUID(),
      name: (stack.name ?? "Untitled").trim() || "Untitled",
      species: stack.species?.trim() || undefined,
      category: stack.category?.trim() || undefined,
      description: stack.description?.trim() || undefined,
      tags: [...(stack.tags ?? [])],
      notes: [...(stack.notes ?? [])],
      createdAt: now,
      updatedAt: now,
    };
    const next = [saved, ...stacks];
    setStacks(next);
    writeLocalResearchStacks(next);
    setSelectedStackId(saved.id);
  };

  const onUpdateStack = async (id: string, updates: Partial<ResearchStack>) => {
    if (!mode) return;
    if (isSync) {
      const res = await fetch(`/api/research/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: updates.name,
          species: updates.species,
          category: updates.category,
          description: updates.description,
          tags: updates.tags,
          notes: updates.notes,
        }),
      });
      if (!res.ok) return;
      const saved = (await res.json()) as ResearchStack;
      setStacks((prev) => prev.map((s) => (s.id === id ? saved : s)));
      return;
    }
    const next = stacks.map((s) =>
      s.id === id
        ? {
            ...s,
            ...updates,
            updatedAt: new Date().toISOString(),
          }
        : s
    );
    setStacks(next);
    writeLocalResearchStacks(next);
  };

  const onDeleteStack = async (id: string) => {
    if (!mode) return;
    if (isSync) {
      const res = await fetch(`/api/research/${id}`, { method: "DELETE" });
      if (!res.ok) return;
    }
    const next = stacks.filter((s) => s.id !== id);
    setStacks(next);
    writeLocalResearchStacks(next);
    if (selectedStackId === id) setSelectedStackId(next[0]?.id ?? null);
  };

  const onCreateNote = async (stackId: string, note: Partial<ResearchNote>) => {
    const base: ResearchNote = {
      id: crypto.randomUUID(),
      title: (note.title ?? "New Note").trim() || "New Note",
      content: note.content ?? "",
      individualLabel: note.individualLabel,
      tags: note.tags ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const stack = stacks.find((s) => s.id === stackId);
    if (!stack) return;
    const updated: ResearchStack = { ...stack, notes: [base, ...stack.notes], updatedAt: new Date().toISOString() };
    await onUpdateStack(stackId, { notes: updated.notes, name: stack.name });
  };

  const onUpdateNote = async (stackId: string, noteId: string, updates: Partial<ResearchNote>) => {
    const stack = stacks.find((s) => s.id === stackId);
    if (!stack) return;
    const notes = stack.notes.map((n) => (n.id === noteId ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n));
    await onUpdateStack(stackId, { notes, name: stack.name });
  };

  const onDeleteNote = async (stackId: string, noteId: string) => {
    const stack = stacks.find((s) => s.id === stackId);
    if (!stack) return;
    const notes = stack.notes.filter((n) => n.id !== noteId);
    await onUpdateStack(stackId, { notes, name: stack.name });
  };

  const onDuplicateNote = async (stackId: string, noteId: string) => {
    const stack = stacks.find((s) => s.id === stackId);
    if (!stack) return;
    const src = stack.notes.find((n) => n.id === noteId);
    if (!src) return;
    const dup: ResearchNote = {
      ...src,
      id: crypto.randomUUID(),
      title: src.title.endsWith(" copy") ? src.title : `${src.title} copy`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const notes = [dup, ...stack.notes];
    await onUpdateStack(stackId, { notes, name: stack.name });
  };

  const onMarkDone = async (id: string) => {
    if (!mode) return;
    if (isSync) {
      await fetch(`/api/logs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderDate: null }),
      });
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, reminderDate: undefined } : e)));
    } else {
      const next = entries.map((e) => (e.id === id ? { ...e, reminderDate: undefined } : e));
      setEntries(next);
      persistLocal(next);
    }
    try {
      await cancelReminderNotification(id);
    } catch {}
  };

  const onSnooze = async (id: string, days: number) => {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + days);
    const value = nextDate.toISOString().slice(0, 10);
    if (!mode) return;
    if (isSync) {
      await fetch(`/api/logs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderDate: value }),
      });
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, reminderDate: value } : e)));
    } else {
      const next = entries.map((e) => (e.id === id ? { ...e, reminderDate: value } : e));
      setEntries(next);
      persistLocal(next);
    }
    try {
      const entry = entries.find((e) => e.id === id);
      if (entry) {
        await scheduleReminderNotification({
          id,
          dateISO: value,
          title: `Reminder: ${entry.specimen || "Unnamed"}`,
          body: entry.notes || (entry.entryType === "feeding" ? "Feeding due." : entry.entryType === "water" ? "Water change due." : "Care reminder."),
        });
      }
    } catch {}
  };

  // Account deletion (sync mode only)
  const handleAccountDeletion = async () => {
    if (!isSync) return;
    const confirmed = confirm("Delete your Moltly account and all synced data? This cannot be undone.");
    if (!confirmed) return;
    setAccountDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error || "Failed to delete account.");
      }
      alert("Your account has been deleted. You'll be signed out next.");
      await signOut({ callbackUrl: "/login" });
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete account.");
    } finally {
      setAccountDeleting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[rgb(var(--bg))]">
      {/* Info modal */}
      {showInfo && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="info-title"
          onClick={() => setShowInfo(false)}
        >
          <div
            className="w-full max-w-lg max-h-[90dvh] flex flex-col rounded-[var(--radius-lg)] bg-[rgb(var(--surface))] shadow-[var(--shadow-lg)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--border))]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[rgb(var(--primary))] to-[rgb(var(--primary-strong))] text-white font-bold flex items-center justify-center">
                  M
                </div>
                <div>
                  <h2 id="info-title" className="text-xl font-bold">About Moltly</h2>
                  <p className="text-sm text-[rgb(var(--text-soft))]">Version {APP_VERSION} • {isSync ? "Signed in" : "Guest mode"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="p-2 rounded-[var(--radius)] text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))]"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-6 flex-1 min-h-0 overflow-y-auto">
              {/* Quick links */}
              <section>
                <h3 className="text-xs uppercase tracking-wide text-[rgb(var(--text-subtle))] mb-3">Links</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <a
                    href="https://github.com/moltly/moltly"
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center justify-between gap-3 p-3 border border-[rgb(var(--border))] rounded-[var(--radius)] hover:bg-[rgb(var(--bg-muted))] transition-colors"
                  >
                    <span className="flex items-center gap-2"><Github className="w-4 h-4" /> GitHub</span>
                    <ExternalLink className="w-4 h-4 text-[rgb(var(--text-subtle))] group-hover:text-[rgb(var(--text))]" />
                  </a>
                  <a
                    href="https://github.com/moltly/moltly/blob/main/TERMS.md"
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center justify-between gap-3 p-3 border border-[rgb(var(--border))] rounded-[var(--radius)] hover:bg-[rgb(var(--bg-muted))] transition-colors"
                  >
                    <span className="flex items-center gap-2"><FileText className="w-4 h-4" /> Terms</span>
                    <ExternalLink className="w-4 h-4 text-[rgb(var(--text-subtle))] group-hover:text-[rgb(var(--text))]" />
                  </a>
                  <a
                    href="https://github.com/moltly/moltly/blob/main/PRIVACY.md"
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center justify-between gap-3 p-3 border border-[rgb(var(--border))] rounded-[var(--radius)] hover:bg-[rgb(var(--bg-muted))] transition-colors"
                  >
                    <span className="flex items-center gap-2"><Shield className="w-4 h-4" /> Privacy</span>
                    <ExternalLink className="w-4 h-4 text-[rgb(var(--text-subtle))] group-hover:text-[rgb(var(--text))]" />
                  </a>
                  <a
                    href="https://ko-fi.com/0xgingi"
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center justify-between gap-3 p-3 border border-[rgb(var(--border))] rounded-[var(--radius)] hover:bg-[rgb(var(--bg-muted))] transition-colors"
                  >
                    <span className="flex items-center gap-2"><Coffee className="w-4 h-4" /> Ko‑fi</span>
                    <ExternalLink className="w-4 h-4 text-[rgb(var(--text-subtle))] group-hover:text-[rgb(var(--text))]" />
                  </a>
                  <a
                    href="https://testflight.apple.com/join/4NE9tZGT"
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center justify-between gap-3 p-3 border border-[rgb(var(--border))] rounded-[var(--radius)] hover:bg-[rgb(var(--bg-muted))] transition-colors sm:col-span-2"
                  >
                    <span className="flex items-center gap-2"><Smartphone className="w-4 h-4" /> iOS TestFlight</span>
                    <ExternalLink className="w-4 h-4 text-[rgb(var(--text-subtle))] group-hover:text-[rgb(var(--text))]" />
                  </a>
                                    <a
                    href="https://github.com/moltly/moltly/releases/latest"
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center justify-between gap-3 p-3 border border-[rgb(var(--border))] rounded-[var(--radius)] hover:bg-[rgb(var(--bg-muted))] transition-colors sm:col-span-2"
                  >
                    <span className="flex items-center gap-2"><Smartphone className="w-4 h-4" /> Android APK</span>
                    <ExternalLink className="w-4 h-4 text-[rgb(var(--text-subtle))] group-hover:text-[rgb(var(--text))]" />
                  </a>
                </div>
              </section>

              {/* App info */}
              <section>
                <h3 className="text-xs uppercase tracking-wide text-[rgb(var(--text-subtle))] mb-3">App</h3>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="px-2.5 py-1 rounded-full bg-[rgb(var(--bg-muted))] text-[rgb(var(--text))]">Version {APP_VERSION}</span>
                  <span className="px-2.5 py-1 rounded-full bg-[rgb(var(--bg-muted))] text-[rgb(var(--text))]">{isSync ? "Sync mode" : "Guest mode"}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingUpdates(getUpdatesSince(null));
                      setShowChangelog(true);
                    }}
                    className="ml-auto text-[rgb(var(--primary))] hover:underline inline-flex items-center gap-1"
                  >
                    <Sparkles className="w-4 h-4" /> What’s new
                  </button>
                </div>
              </section>

              {/* Account */}
              <section>
                <h3 className="text-xs uppercase tracking-wide text-[rgb(var(--text-subtle))] mb-3">Account</h3>
                {isSync ? (
                  <div className="flex flex-col gap-2">
                    <div className="text-sm text-[rgb(var(--text-soft))]">You’re signed in. Manage your account below.</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void signOut({ callbackUrl: "/login" })}
                        className="px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))] inline-flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" /> Sign out
                      </button>
                      {hasPasswordAccount === true ? (
                        <button
                          type="button"
                          onClick={() => setShowChangePassword(true)}
                          className="px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))]"
                        >
                          Change password
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={async () => {
                          setIsExporting(true);
                          try {
                            const res = await fetch("/api/export?embed=1", { credentials: "include" });
                            if (!res.ok) throw new Error("Export failed");
                            const text = await res.text();
                            await exportJsonText(text);
                          } catch (err) {
                            alert("Export failed. Please try again.");
                          } finally {
                            setIsExporting(false);
                          }
                        }}
                        className="px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))] inline-flex items-center gap-2"
                        disabled={isExporting}
                      >
                        <Download className="w-4 h-4" /> {isExporting ? "Exporting…" : "Export data"}
                      </button>
                      <label className="inline-flex items-center">
                        <input
                          id={importInputId}
                          type="file"
                          accept="application/json"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setIsImporting(true);
                            setImportError(null);
                            setImportSuccess(null);
                            try {
                              const text = await file.text();
                              const data = JSON.parse(text);
                              const res = await fetch("/api/import", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(data),
                              });
                              if (!res.ok) {
                                const body = await res.json().catch(() => ({} as { error?: string }));
                                throw new Error(body.error || "Import failed.");
                              }
                              setImportSuccess("Import complete. Reloading data…");
                              // Reload entries and research
                              try {
                                const [eRes, hRes, bRes, rRes] = await Promise.all([
                                  fetch("/api/logs", { credentials: "include" }),
                                  fetch("/api/health", { credentials: "include" }),
                                  fetch("/api/breeding", { credentials: "include" }),
                                  fetch("/api/research", { credentials: "include" }),
                                ]);
                                if (eRes.ok) setEntries(await eRes.json());
                                if (hRes.ok) setHealthEntries(await hRes.json());
                                if (bRes.ok) setBreedingEntries(await bRes.json());
                                if (rRes.ok) {
                                  const r = (await rRes.json()) as ResearchStack[];
                                  setStacks(Array.isArray(r) ? r : []);
                                  if (r.length > 0) setSelectedStackId(r[0].id);
                                }
                              } catch {}
                            } catch (err) {
                              setImportError(err instanceof Error ? err.message : "Import failed.");
                            } finally {
                              setIsImporting(false);
                              // reset input to allow re-selecting the same file
                              const input = document.getElementById(importInputId) as HTMLInputElement | null;
                              if (input) input.value = "";
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => (document.getElementById(importInputId) as HTMLInputElement | null)?.click()}
                          className="px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))] inline-flex items-center gap-2"
                          disabled={isImporting}
                        >
                          <Upload className="w-4 h-4" /> {isImporting ? "Importing…" : "Import data"}
                        </button>
                      </label>
                      <button
                        type="button"
                        onClick={handleAccountDeletion}
                        disabled={accountDeleting}
                        className="px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--danger))] text-[rgb(var(--danger))] hover:bg-[rgb(var(--danger-soft))]/20 disabled:opacity-60"
                      >
                        {accountDeleting ? "Deleting…" : "Delete account"}
                      </button>
                    </div>
                    {(importError || importSuccess) && (
                      <div className={"text-sm " + (importError ? "text-[rgb(var(--danger))]" : "text-[rgb(var(--success))]")}>{importError || importSuccess}</div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-[rgb(var(--text-soft))]">
                      You’re using guest mode. Data is stored locally on this device. Sign in to enable sync across devices.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          setIsExporting(true);
                          try {
                            // Build local export payload
                            const localEntries = readLocalEntries();
                            const localHealth = readLocalHealthEntries();
                            const localBreeding = readLocalBreedingEntries();
                            const localResearch = readLocalResearchStacks();
                            const payload = {
                              version: 2,
                              exportedAt: new Date().toISOString(),
                              entries: localEntries,
                              health: localHealth,
                              breeding: localBreeding,
                              research: localResearch,
                            };
                            const text = JSON.stringify(payload);
                            await exportJsonText(text);
                          } catch {
                            alert("Export failed. Please try again.");
                          } finally {
                            setIsExporting(false);
                          }
                        }}
                        className="px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))] inline-flex items-center gap-2"
                        disabled={isExporting}
                      >
                        <Download className="w-4 h-4" /> {isExporting ? "Exporting…" : "Export data"}
                      </button>
                      <label className="inline-flex items-center">
                        <input
                          id={importInputId + "-local"}
                          type="file"
                          accept="application/json"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setIsImporting(true);
                            setImportError(null);
                            setImportSuccess(null);
                            try {
                              const text = await file.text();
                              const data = JSON.parse(text) as { entries?: any[]; research?: ResearchStack[] };
                              const nextEntries = Array.isArray(data.entries) ? (data.entries as MoltEntry[]) : [];
                              const nextResearch = Array.isArray(data.research) ? (data.research as ResearchStack[]) : [];
                              // Overwrite local stores
                              writeLocalEntries(nextEntries as unknown as Record<string, unknown>[]);
                              writeLocalResearchStacks(nextResearch);
                              setEntries(nextEntries as MoltEntry[]);
                              setStacks(nextResearch);
                              if (nextResearch.length > 0) setSelectedStackId(nextResearch[0].id);
                              setImportSuccess("Import complete.");
                            } catch (err) {
                              setImportError(err instanceof Error ? err.message : "Import failed.");
                            } finally {
                              setIsImporting(false);
                              const input = document.getElementById(importInputId + "-local") as HTMLInputElement | null;
                              if (input) input.value = "";
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => (document.getElementById(importInputId + "-local") as HTMLInputElement | null)?.click()}
                          className="px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))] inline-flex items-center gap-2"
                          disabled={isImporting}
                        >
                          <Upload className="w-4 h-4" /> {isImporting ? "Importing…" : "Import data"}
                        </button>
                      </label>
                      <button
                        type="button"
                        onClick={() => (window.location.href = "/login")}
                        className="px-3 py-2 rounded-[var(--radius)] bg-[rgb(var(--primary))] text-white"
                      >
                        Sign in
                      </button>
                    </div>
                    {(importError || importSuccess) && (
                      <div className={"text-sm " + (importError ? "text-[rgb(var(--danger))]" : "text-[rgb(var(--success))]")}>{importError || importSuccess}</div>
                    )}
                  </div>
                )}
              </section>
            </div>
            <div className="p-4 border-t border-[rgb(var(--border))] flex justify-end safe-bottom">
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="px-4 py-2 rounded-[var(--radius)] bg-[rgb(var(--primary))] text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* What's new modal */}
      {showChangelog && pendingUpdates.length > 0 && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="changelog-title">
          <div className="w-full max-w-lg rounded-[var(--radius-lg)] bg-[rgb(var(--surface))] shadow-[var(--shadow-lg)]">
            <div className="flex items-start justify-between p-4 border-b border-[rgb(var(--border))]">
              <div>
                <p className="text-xs text-[rgb(var(--text-subtle))] mb-1">What&apos;s new</p>
                <h2 id="changelog-title" className="text-xl font-bold">Moltly {pendingUpdates[0].version}</h2>
                <p className="text-sm text-[rgb(var(--text-soft))]">
                  {pendingUpdates.length > 1
                    ? `Catch up on everything since version ${pendingUpdates[pendingUpdates.length - 1].version}.`
                    : `Released ${new Date(pendingUpdates[0].date).toLocaleDateString()}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowChangelog(false);
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
                  }
                }}
                className="text-[rgb(var(--primary))] hover:underline"
              >
                Close
              </button>
            </div>
            <div className="p-4 space-y-4 max-h-[70dvh] overflow-y-auto">
              {pendingUpdates.map((entry) => (
                <div key={entry.version} className="border border-[rgb(var(--border))] rounded-[var(--radius)] p-3">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold">Version {entry.version}</h3>
                    <time className="text-xs text-[rgb(var(--text-subtle))]" dateTime={entry.date}>
                      {new Date(entry.date).toLocaleDateString()}
                    </time>
                  </div>
                  <ul className="list-disc pl-5 text-sm text-[rgb(var(--text))]">
                    {entry.highlights.map((item, idx) => (
                      <li key={`${entry.version}-${idx}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-[rgb(var(--border))] flex justify-end safe-bottom">
              <button
                type="button"
                onClick={() => {
                  setShowChangelog(false);
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
                  }
                }}
                className="px-4 py-2 rounded-[var(--radius)] bg-[rgb(var(--primary))] text-white"
              >
                Thanks, got it
              </button>
            </div>
          </div>
        </div>
      )}
      <Header
        mode={isSync ? "sync" : "local"}
        onNewEntry={openNewEntry}
        onSignOut={isSync ? () => void signOut({ callbackUrl: "/login" }) : undefined}
        onOpenInfo={() => setShowInfo(true)}
      />

      <div className="max-w-screen-lg mx-auto px-4 py-4 pb-28">
        {activeView === "overview" && <OverviewView entries={entries} onViewChange={setActiveView} />}
        {activeView === "activity" && (
          <ActivityView entries={entries} onEdit={onEdit} onDelete={onDelete} />
        )}
        {activeView === "specimens" && <SpecimensView entries={entries} />}
        {activeView === "health" && (
          <HealthView
            entries={healthEntries}
            onCreate={createHealthEntry}
            onDelete={async (id) => {
              if (!confirm("Delete this health entry?")) return;
              await deleteHealthEntry(id);
            }}
            onScheduleFollowUpRetry={async (entry) => {
              if (!entry.followUpDate) return;
              try {
                await scheduleReminderNotification({
                  id: healthReminderKey(entry.id),
                  dateISO: entry.followUpDate.slice(0, 10),
                  title: `Health follow-up: ${entry.specimen || entry.species || "Tarantula"}`,
                  body: entry.healthIssues || entry.notes || "Check on specimen health.",
                });
              } catch (err) {
                console.warn("Unable to reschedule health reminder", err);
              }
            }}
          />
        )}
        {activeView === "breeding" && (
          <BreedingView
            entries={breedingEntries}
            onCreate={createBreedingEntry}
            onDelete={async (id) => {
              if (!confirm("Delete this breeding entry?")) return;
              await deleteBreedingEntry(id);
            }}
            onScheduleFollowUpRetry={async (entry) => {
              if (!entry.followUpDate) return;
              try {
                await scheduleReminderNotification({
                  id: breedingReminderKey(entry.id),
                  dateISO: entry.followUpDate.slice(0, 10),
                  title: `Breeding follow-up: ${entry.femaleSpecimen || entry.species || "Specimen"}`,
                  body: entry.notes || entry.pairingNotes || "Check breeding progress.",
                });
              } catch (err) {
                console.warn("Unable to reschedule breeding reminder", err);
              }
            }}
          />
        )}
        {activeView === "reminders" && (
          <RemindersView entries={entries} onMarkDone={onMarkDone} onSnooze={onSnooze} onEdit={onEdit} />
        )}
        {activeView === "notebook" && (
          <NotebookView
            stacks={stacks}
            selectedStackId={selectedStackId}
            onSelectStack={setSelectedStackId}
            onCreateStack={onCreateStack}
            onUpdateStack={onUpdateStack}
            onDeleteStack={onDeleteStack}
            onCreateNote={onCreateNote}
            onUpdateNote={onUpdateNote}
            onDeleteNote={onDeleteNote}
            onDuplicateNote={onDuplicateNote}
          />
        )}
      </div>

      {/* Footer links moved into Info modal */}

      <EntryFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        formState={formState}
        onFormChange={(u) => setFormState((p) => ({ ...p, ...u }))}
        onSubmit={onSubmit}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        isEditing={Boolean(editingId)}
      />

      <BottomNav activeView={activeView} onViewChange={setActiveView} />

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-20 right-4 z-40 rounded-full bg-[rgb(var(--surface))] border border-[rgb(var(--border))] shadow-[var(--shadow)] px-3 py-2 text-sm text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))]"
          aria-label="Scroll to top"
        >
          ↑ Top
        </button>
      )}

      {/* Change Password modal */}
      {showChangePassword && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-password-title"
          onClick={() => setShowChangePassword(false)}
        >
          <div
            className="w-full max-w-md max-h-[90dvh] flex flex-col rounded-[var(--radius-lg)] bg-[rgb(var(--surface))] shadow-[var(--shadow-lg)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--border))]">
              <h2 id="change-password-title" className="text-lg font-bold">Change password</h2>
              <button
                type="button"
                onClick={() => setShowChangePassword(false)}
                className="p-2 rounded-[var(--radius)] text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))]"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto safe-bottom"
              onSubmit={async (e) => {
                e.preventDefault();
                if (newPassword !== confirmNewPassword) {
                  alert("New passwords do not match.");
                  return;
                }
                setChangingPassword(true);
                try {
                  const res = await fetch("/api/account/password", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ currentPassword, newPassword })
                  });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({} as { error?: string }));
                    throw new Error(body.error || "Failed to change password.");
                  }
                  alert("Password updated.");
                  setShowChangePassword(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmNewPassword("");
                } catch (err) {
                  console.error(err);
                  alert(err instanceof Error ? err.message : "Failed to change password.");
                } finally {
                  setChangingPassword(false);
                }
              }}
            >
              <div className="space-y-1">
                <label className="text-sm text-[rgb(var(--text-soft))]">Current password</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-[rgb(var(--text-soft))]">New password</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 chars, letters + numbers"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-[rgb(var(--text-soft))]">Confirm new password</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowChangePassword(false)}
                  className="px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="px-3 py-2 rounded-[var(--radius)] bg-[rgb(var(--primary))] text-white disabled:opacity-60"
                >
                  {changingPassword ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
