"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Github, FileText, Shield, Coffee, Smartphone, Sparkles, LogOut, ExternalLink, Upload, Download, BarChart3, KeyRound, Server } from "lucide-react";
import { signOut } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import LogoMark from "@/components/layout/LogoMark";
import BottomNav from "@/components/layout/BottomNav";
import OverviewView from "@/components/dashboard/OverviewView";
import ActivityView from "@/components/dashboard/ActivityView";
import SpecimensView from "@/components/dashboard/SpecimensView";
import RemindersView from "@/components/dashboard/RemindersView";
import EntryFormModal from "@/components/dashboard/EntryFormModal";
import NotebookView from "@/components/dashboard/NotebookView";
import HealthView from "@/components/dashboard/HealthView";
import BreedingView from "@/components/dashboard/BreedingView";
import AnalyticsView from "@/components/dashboard/AnalyticsView";
import CulturesView from "@/components/dashboard/CulturesView";
import type { MoltEntry, ViewKey, Stage, EntryType, FormState, Attachment, SizeUnit, Specimen } from "@/types/molt";
import type { HealthEntry, HealthFormState } from "@/types/health";
import type { BreedingEntry, BreedingFormState } from "@/types/breeding";
import type { ResearchStack, ResearchNote } from "@/types/research";
import type { CultureEntry, CultureFormState } from "@/types/culture";
import { APP_VERSION, LAST_SEEN_VERSION_KEY } from "@/lib/app-version";
import { getUpdatesSince, type ChangelogEntry } from "@/lib/changelog";
import { getSavedTempUnit } from "@/lib/temperature";
import { getSavedSizeUnit } from "@/lib/size-unit";
import { cancelReminderNotification, scheduleReminderNotification } from "@/lib/notifications";
import type { GalleryImage } from "@/components/ui/ImageGallery";
import { useDashboardData } from "@/hooks/useDashboardData";
import { decodeCreationOptions, serializePublicKeyCredential } from "@/lib/passkey-client";
import { cmToInches, inchesToCm, formatDate } from "@/lib/utils";

const defaultForm = (): FormState => ({
  entryType: "molt",
  specimenId: "",
  specimen: "",
  species: "",
  sex: "",
  date: new Date().toISOString().slice(0, 10),
  stage: "Molt",
  oldSize: "",
  newSize: "",
  sizeUnit: getSavedSizeUnit(),
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

const roundTo = (value: number, precision = 2): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const toDisplaySize = (value: number | undefined, unit: SizeUnit): string => {
  if (value === undefined || value === null) return "";
  const cmValue = value;
  const converted = unit === "cm" ? cmValue : cmToInches(cmValue);
  return roundTo(converted, 2).toString();
};

const toCanonicalSize = (value: string, unit: SizeUnit): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return undefined;
  const cmValue = unit === "cm" ? parsed : inchesToCm(parsed);
  return roundTo(cmValue, 2);
};

const buildBreedingPayload = (form: BreedingFormState, existingAttachments?: Attachment[]) => ({
  femaleSpecimenId: form.femaleSpecimenId,
  femaleSpecimen: form.femaleSpecimen.trim() || undefined,
  maleSpecimenId: form.maleSpecimenId,
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
  attachments: existingAttachments ? [...existingAttachments] : [],
});

const buildMoltPayloadFromEntry = (entry: MoltEntry) => {
  const isMolt = entry.entryType === "molt";
  const isFeeding = entry.entryType === "feeding";
  return {
    entryType: entry.entryType,
    specimenId: entry.specimenId ?? undefined,
    specimen: entry.specimen ?? undefined,
    species: entry.species ?? undefined,
    date: entry.date,
    stage: isMolt ? (entry.stage ?? "Molt") : undefined,
    oldSize: isMolt ? entry.oldSize ?? undefined : undefined,
    newSize: isMolt ? entry.newSize ?? undefined : undefined,
    humidity: entry.humidity ?? undefined,
    temperature: entry.temperature ?? undefined,
    temperatureUnit: entry.temperatureUnit ?? undefined,
    notes: entry.notes ?? undefined,
    reminderDate: entry.reminderDate ?? undefined,
    feedingPrey: isFeeding ? entry.feedingPrey ?? undefined : undefined,
    feedingOutcome: isFeeding ? entry.feedingOutcome ?? undefined : undefined,
    feedingAmount: isFeeding ? entry.feedingAmount ?? undefined : undefined,
    attachments: entry.attachments ?? [],
  };
};

const syncBreedingReminder = async (prev: BreedingEntry | undefined, next: BreedingEntry) => {
  const prevFollowUp = prev?.followUpDate?.slice(0, 10) || null;
  const nextFollowUp = next.followUpDate?.slice(0, 10) || null;

  if (prevFollowUp && !nextFollowUp) {
    try {
      await cancelReminderNotification(breedingReminderKey(next.id));
    } catch { }
    return;
  }

  if (nextFollowUp) {
    try {
      await scheduleReminderNotification({
        id: breedingReminderKey(next.id),
        dateISO: nextFollowUp,
        title: `Breeding follow-up: ${next.femaleSpecimen || next.species || "Specimen"}`,
        body: next.notes || next.pairingNotes || "Check breeding progress.",
      });
    } catch (err) {
      console.warn("Unable to schedule breeding reminder", err);
    }
  }
};

const healthReminderKey = (id: string) => `health:${id}`;
const breedingReminderKey = (id: string) => `breeding:${id}`;

const isLocalOnly = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  return Boolean((value as { _localOnly?: boolean })._localOnly);
};

export default function MobileDashboard() {
  const {
    session,
    status,
    mode,
    isSync,
    entries,
    setEntries,
    healthEntries,
    setHealthEntries,
    breedingEntries,
    setBreedingEntries,
    specimenCovers,
    setSpecimenCovers,
    refreshSpecimenCovers,
    updateSpecimenCover,
    stacks,
    setStacks,
    selectedStackId,
    setSelectedStackId,
    queueOfflineCreate,
    queueOfflineMutation,
    clearOfflineCreate,
    cultureEntries,
    setCultureEntries,
    refreshCultures,
    specimens,
    setSpecimens,
    refreshSpecimens
  } = useDashboardData();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [linkedSpecimen, setLinkedSpecimen] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<ViewKey>("overview");
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pendingUpdates, setPendingUpdates] = useState<ChangelogEntry[]>([]);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [hasPasswordAccount, setHasPasswordAccount] = useState<boolean | null>(null);
  const [hasUsernameAccount, setHasUsernameAccount] = useState<boolean | null>(null);
  const [passkeyCount, setPasskeyCount] = useState<number | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordMode, setPasswordMode] = useState<"change" | "create">("change");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null);
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [wscaSyncing, setWscaSyncing] = useState(false);
  const [wscaSyncStatus, setWscaSyncStatus] = useState<string | null>(null);
  const specimenParam = searchParams?.get("specimen");
  const specimenIdParam = searchParams?.get("specimenId");
  const speciesParam = searchParams?.get("species") || "";
  const noteParam = searchParams?.get("note") || "";
  const ownerParam = searchParams?.get("owner") || "";
  const viewParam = searchParams?.get("view");
  const [shareImported, setShareImported] = useState(false);
  const [importingShare, setImportingShare] = useState(false);
  const [sharePreviewData, setSharePreviewData] = useState<{
    specimen: Specimen | null;
    entries: MoltEntry[];
    health: HealthEntry[];
    breeding: BreedingEntry[];
    cover: string | null;
  } | null>(null);
  const [sharePreviewError, setSharePreviewError] = useState<string | null>(null);
  const [sharePreviewLoading, setSharePreviewLoading] = useState(false);
  const deepLinkUrl = useMemo(() => {
    if (!specimenParam && !specimenIdParam) return null;
    const params = new URLSearchParams();
    if (specimenParam) params.set("specimen", specimenParam);
    if (specimenIdParam) params.set("specimenId", specimenIdParam);
    if (speciesParam) params.set("species", speciesParam);
    if (ownerParam) params.set("owner", ownerParam);
    if (noteParam) params.set("note", noteParam);
    return `moltly://open?${params.toString()}`;
  }, [specimenParam, specimenIdParam, speciesParam, ownerParam, noteParam]);
  const intentLink = useMemo(() => {
    if (typeof window === "undefined" || (!specimenParam && !specimenIdParam)) return null;
    const params = new URLSearchParams();
    if (specimenParam) params.set("specimen", specimenParam);
    if (specimenIdParam) params.set("specimenId", specimenIdParam);
    if (speciesParam) params.set("species", speciesParam);
    if (ownerParam) params.set("owner", ownerParam);
    if (noteParam) params.set("note", noteParam);
    return `intent://open?${params.toString()}#Intent;scheme=moltly;package=xyz.moltly.app;S.browser_fallback_url=${encodeURIComponent(window.location.href)};end;`;
  }, [specimenParam, specimenIdParam, speciesParam, ownerParam, noteParam]);
  const importInputId = "moltly-import-input";
  const noteSaveTimers = useRef<Record<string, number>>({});
  const pendingNoteUpdates = useRef<Record<string, ResearchNote[]>>({});
  const noteSaveLatestRequest = useRef<Record<string, number>>({});
  const isCreatingPassword = passwordMode === "create";

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
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      throw err;
    }
  }, []);

  const handleUpdateSpecimenCover = useCallback(
    async (specimenId: string, imageUrl: string | null) => {
      try {
        const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;
        const specimenName = specimens.find((specimen) => specimen.id === specimenId)?.name || "Unnamed";

        // Optimistically update local state
        setSpecimens((prev) => {
          const nextSpecimens = prev.map((s) =>
            s.id === specimenId ? { ...s, imageUrl: imageUrl === null ? "" : imageUrl ?? undefined } : s
          );
          const sameNameSpecimens = nextSpecimens.filter(
            (specimen) => specimen.name.trim().toLowerCase() === specimenName.trim().toLowerCase()
          );
          if (sameNameSpecimens.length <= 1) {
            const fallbackCoverUrl = sameNameSpecimens.find((specimen) => specimen.imageUrl)?.imageUrl;
            setSpecimenCovers((prevCovers) => {
              const nextCovers = { ...prevCovers };
              if (fallbackCoverUrl) {
                nextCovers[specimenName] = fallbackCoverUrl;
              } else {
                delete nextCovers[specimenName];
              }
              return nextCovers;
            });
          }
          return nextSpecimens;
        });

        if (isSync && isOnline) {
          const res = await fetch(`/api/specimens/${specimenId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrl: imageUrl === null ? null : imageUrl }),
            credentials: "include",
          });
          if (!res.ok) throw new Error("Failed to update specimen cover");
        } else if (isSync) {
          queueOfflineMutation("specimens", "update", specimenId, { imageUrl });
        }
      } catch (error) {
        console.error("Failed to update specimen cover:", error);
        // Revert on failure
        refreshSpecimens();
        refreshSpecimenCovers();
      }
    },
    [isSync, queueOfflineMutation, specimens, setSpecimens, setSpecimenCovers, refreshSpecimens, refreshSpecimenCovers]
  );

  const handleSetSpecimenCover = useCallback(
    async (specimenRef: string, img: GalleryImage) => {
      const url = img.url;
      if (!url) return;
      const linkedSpecimen = specimens.find((specimen) => specimen.id === specimenRef);
      if (linkedSpecimen) {
        await handleUpdateSpecimenCover(specimenRef, url);
        return;
      }
      await updateSpecimenCover(specimenRef, url);
    },
    [handleUpdateSpecimenCover, specimens, updateSpecimenCover]
  );

  const handleUnsetSpecimenCover = useCallback(
    async (specimenRef: string) => {
      const linkedSpecimen = specimens.find((specimen) => specimen.id === specimenRef);
      if (linkedSpecimen) {
        await handleUpdateSpecimenCover(specimenRef, null);
        return;
      }
      await updateSpecimenCover(specimenRef, null);
    },
    [handleUpdateSpecimenCover, specimens, updateSpecimenCover]
  );

  const upsertSpecimenState = useCallback(
    (specimen: Specimen) => {
      setSpecimens((prev) => {
        const withoutCurrent = prev.filter((item) => item.id !== specimen.id);
        return [...withoutCurrent, specimen].sort((a, b) => a.name.localeCompare(b.name));
      });
    },
    [setSpecimens]
  );

  const removeLocalSpecimenRecords = useCallback(
    (specimenIds: string[]) => {
      if (specimenIds.length === 0) return;
      const ids = new Set(specimenIds);
      setSpecimens((prev) => prev.filter((specimen) => !ids.has(specimen.id)));
    },
    [setSpecimens]
  );

  const createSpecimenRecord = useCallback(
    async ({ name, species, sex, notes }: { name: string; species?: string; sex?: "Male" | "Female" | "Unknown" | "Unsexed"; notes?: string }) => {
      const trimmedName = name.trim();
      const trimmedSpecies = species?.trim() || undefined;
      const trimmedNotes = notes?.trim() || undefined;

      if (!trimmedName) {
        throw new Error("Specimen name is required to create a new specimen record.");
      }

      if (isSync) {
        const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;
        if (!isOnline) {
          throw new Error("Creating a new specimen while offline in sync mode is not supported yet.");
        }
        const res = await fetch("/api/specimens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmedName, species: trimmedSpecies, sex, notes: trimmedNotes }),
          credentials: "include",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || "Unable to create specimen.");
        }
        const saved = (await res.json()) as Specimen;
        upsertSpecimenState(saved);
        return saved;
      }

      const now = new Date().toISOString();
      const localSpecimen: Specimen = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: trimmedName,
        species: trimmedSpecies,
        sex,
        notes: trimmedNotes,
        createdAt: now,
        updatedAt: now,
      };
      upsertSpecimenState(localSpecimen);
      return localSpecimen;
    },
    [isSync, upsertSpecimenState]
  );

  // Load research stacks
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
    if (specimenIdParam || specimenParam) {
      setLinkedSpecimen(specimenIdParam || specimenParam);
      setActiveView("specimens");
    } else if (viewParam === "specimens") {
      setActiveView("specimens");
    }
    setShareImported(false);
  }, [specimenIdParam, specimenParam, viewParam, ownerParam]);

  const currentUserId = session?.user?.id ?? "";
  const isOwnerMatch = Boolean(ownerParam && ownerParam === currentUserId);
  const isSharePreview = Boolean(linkedSpecimen) && !isOwnerMatch;
  const isPreviewActive = isSharePreview && !shareImported;

  useEffect(() => {
    if (!isPreviewActive || !linkedSpecimen || !ownerParam) {
      setSharePreviewData(null);
      setSharePreviewError(null);
      setSharePreviewLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setSharePreviewLoading(true);
      setSharePreviewError(null);
      try {
        const params = new URLSearchParams();
        if (specimenParam) params.set("specimen", specimenParam);
        if (specimenIdParam) params.set("specimenId", specimenIdParam);
        if (speciesParam) params.set("species", speciesParam);
        if (!specimenParam && !specimenIdParam) params.set("specimen", linkedSpecimen);
        params.set("owner", ownerParam);
        const res = await fetch(`/api/specimens/shared?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load shared specimen");
        const data = (await res.json()) as {
          specimen?: Specimen | null;
          entries?: MoltEntry[];
          health?: HealthEntry[];
          breeding?: BreedingEntry[];
          cover?: string | null;
        };
        if (!cancelled) {
          setSharePreviewData({
            specimen: data.specimen ?? null,
            entries: Array.isArray(data.entries) ? data.entries : [],
            health: Array.isArray(data.health) ? data.health : [],
            breeding: Array.isArray(data.breeding) ? data.breeding : [],
            cover: data.cover ?? null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setSharePreviewError(err instanceof Error ? err.message : "Failed to load shared specimen");
          setSharePreviewData(null);
        }
      } finally {
        if (!cancelled) setSharePreviewLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isPreviewActive, linkedSpecimen, ownerParam, specimenIdParam, specimenParam, speciesParam]);

  // Once preview is done (either owner matches or copy completed), strip share-only params to hide the banner.
  useEffect(() => {
    if (isPreviewActive) return;
    if (!linkedSpecimen) return;
    if (!ownerParam && !noteParam) return;
    const params = new URLSearchParams();
    params.set("view", "specimens");
    if (specimenParam) params.set("specimen", specimenParam);
    if (specimenIdParam) params.set("specimenId", specimenIdParam);
    if (!specimenParam && !specimenIdParam) params.set("specimen", linkedSpecimen);
    const nextUrl = `/?${params.toString()}`;
    router.replace(nextUrl);
  }, [isPreviewActive, linkedSpecimen, ownerParam, noteParam, router, specimenIdParam, specimenParam]);
  const previewEntries = sharePreviewData?.entries ?? [];
  const previewHealthEntries = sharePreviewData?.health ?? [];
  const previewBreedingEntries = sharePreviewData?.breeding ?? [];
  const previewSpecimens = sharePreviewData?.specimen ? [sharePreviewData.specimen] : [];
  const displayEntries = isPreviewActive ? previewEntries : entries;
  const displayHealthEntries = isPreviewActive ? previewHealthEntries : healthEntries;
  const displayBreedingEntries = isPreviewActive ? previewBreedingEntries : breedingEntries;
  const displaySpecimens = isPreviewActive ? previewSpecimens : specimens;
  const displayCovers =
    isPreviewActive && sharePreviewData?.cover && linkedSpecimen
      ? {
          ...specimenCovers,
          [linkedSpecimen]: sharePreviewData.cover,
          ...(sharePreviewData.specimen?.name ? { [sharePreviewData.specimen.name]: sharePreviewData.cover } : {}),
        }
      : specimenCovers;

  const refreshAccountStatus = useCallback(async () => {
    if (!isSync) return;
    try {
      const res = await fetch("/api/account/password", { method: "GET", credentials: "include" });
      if (!res.ok) throw new Error("Failed to load account status");
      const data = (await res.json()) as { hasPassword?: boolean; hasUsername?: boolean; passkeyCount?: number };
      setHasPasswordAccount(Boolean(data.hasPassword));
      setHasUsernameAccount(typeof data.hasUsername === "boolean" ? data.hasUsername : null);
      setPasskeyCount(typeof data.passkeyCount === "number" ? data.passkeyCount : null);
    } catch (err) {
      console.error(err);
      setHasPasswordAccount(null);
      setHasUsernameAccount(null);
      setPasskeyCount(null);
    }
  }, [isSync]);

  useEffect(() => {
    if (!showInfo && !showChangePassword) return;
    void refreshAccountStatus();
  }, [showInfo, showChangePassword, refreshAccountStatus]);

  useEffect(() => {
    if (!isSync) return;
    void refreshAccountStatus();
  }, [isSync, refreshAccountStatus]);

  // Scroll-to-top button visibility
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 320);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const timers = noteSaveTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const openNewEntry = () => {
    setEditingId(null);
    setFormState(defaultForm());
    setAttachments([]);
    setFormOpen(true);
  };

  const onEdit = (entry: MoltEntry) => {
    setEditingId(entry.id);
    setFormState((prev) => {
      const sizeUnit = prev.sizeUnit ?? getSavedSizeUnit();
      return {
        entryType: entry.entryType,
        specimenId: entry.specimenId ?? "",
        specimen: entry.specimen ?? "",
        species: entry.species ?? "",
        sex: "",
        date: entry.date.slice(0, 10),
        stage: entry.stage ?? "Molt",
        oldSize: toDisplaySize(entry.oldSize, sizeUnit),
        newSize: toDisplaySize(entry.newSize, sizeUnit),
        sizeUnit,
        humidity: entry.humidity?.toString() ?? "",
        temperature: entry.temperature?.toString() ?? "",
        temperatureUnit: entry.temperatureUnit === "F" ? "F" : "C",
        notes: entry.notes ?? "",
        reminderDate: entry.reminderDate ? entry.reminderDate.slice(0, 10) : "",
        feedingPrey: entry.feedingPrey ?? "",
        feedingOutcome: entry.feedingOutcome ?? "",
        feedingAmount: entry.feedingAmount ?? "",
      };
    });
    setAttachments(entry.attachments ?? []);
    setFormOpen(true);
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    if (!mode) return;
    const existing = entries.find((e) => e.id === id);
    const localOnly = isLocalOnly(existing);
    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

    let shouldQueueDelete = false;

    if (isSync && !localOnly) {
      if (isOnline) {
        try {
          const res = await fetch(`/api/logs/${id}`, { method: "DELETE" });
          if (!res.ok) {
            const message = await res.text().catch(() => "");
            if (message.trim()) {
              alert(message);
            } else {
              alert("Unable to delete entry.");
            }
            return;
          }
        } catch {
          shouldQueueDelete = true;
        }
      } else {
        shouldQueueDelete = true;
      }
    }

    if (isSync && localOnly && existing) {
      clearOfflineCreate("entries", existing.id);
    }

    if (isSync && shouldQueueDelete) {
      queueOfflineMutation("entries", "delete", id);
    }

    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      await cancelReminderNotification(id);
    } catch { }
  };

  const onSubmit = async () => {
    const isMolt = formState.entryType === "molt";
    const isFeeding = formState.entryType === "feeding";
    const isSpecimenCreate = formState.entryType === "specimen";
    if (isSpecimenCreate) {
      const trimmedName = formState.specimen.trim();
      if (!trimmedName) {
        alert("Specimen name is required.");
        return;
      }
      try {
        await createSpecimenRecord({
          name: trimmedName,
          species: formState.species.trim() || undefined,
          sex: formState.sex || undefined,
          notes: formState.notes.trim() || undefined,
        });
        setFormOpen(false);
        setEditingId(null);
        setFormState(defaultForm());
        setAttachments([]);
      } catch (error) {
        alert(error instanceof Error ? error.message : "Unable to create specimen.");
      }
      return;
    }
    if (isMolt && !formState.species.trim()) {
      alert("Species is required for molt entries.");
      return;
    }

    const trimmedSpecimen = formState.specimen.trim();
    const trimmedSpecies = formState.species.trim();
    const selectedSpecimen = formState.specimenId
      ? specimens.find((specimen) => specimen.id === formState.specimenId)
      : undefined;
    const existing = editingId ? entries.find((entry) => entry.id === editingId) : undefined;
    const resolvedSpecimenId = formState.specimenId || undefined;
    const resolvedSpecimenName = selectedSpecimen ? selectedSpecimen.name : trimmedSpecimen || undefined;
    const resolvedSpecies = selectedSpecimen ? selectedSpecimen.species ?? (trimmedSpecies || undefined) : trimmedSpecies || undefined;
    const shouldClearSpecimenId = Boolean(editingId && existing?.specimenId && !resolvedSpecimenId);

    const payload = {
      entryType: formState.entryType,
      specimenId: shouldClearSpecimenId ? null : resolvedSpecimenId,
      specimen: resolvedSpecimenName,
      species: resolvedSpecies,
      date: formState.date,
      stage: isMolt ? formState.stage : undefined,
      oldSize: isMolt ? toCanonicalSize(formState.oldSize, formState.sizeUnit) : undefined,
      newSize: isMolt ? toCanonicalSize(formState.newSize, formState.sizeUnit) : undefined,
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

    const nowIso = new Date().toISOString();
    const localOnlyExisting = isLocalOnly(existing);
    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

    if (isSync && !localOnlyExisting && isOnline) {
      try {
        const res = await fetch(editingId ? `/api/logs/${editingId}` : "/api/logs", {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errorBody = await res.text().catch(() => "");
          console.error("[MobileDashboard] Save failed:", res.status, errorBody);
          alert(`Unable to save entry: ${errorBody || res.status}`);
          return;
        }
        const saved = (await res.json()) as MoltEntry;
        setEntries((prev) => (editingId ? prev.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...prev]));
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
              body:
                saved.notes ||
                (saved.entryType === "feeding"
                  ? "Feeding due."
                  : saved.entryType === "water"
                    ? "Water change due."
                    : "Care reminder."),
            });
          }
        } catch (err) {
          console.warn("Local notification scheduling failed", err);
        }
        setFormOpen(false);
        setEditingId(null);
        setFormState(defaultForm());
        setAttachments([]);
        return;
      } catch {
        // Network error; fall back to offline path below.
      }
    }

    const localId = editingId ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const baseExisting = existing;
    const saved: MoltEntry = {
      id: localId,
      entryType: payload.entryType as EntryType,
      specimenId: payload.specimenId ?? undefined,
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
      createdAt: baseExisting?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    const nextSaved: MoltEntry = (() => {
      if (isSync) {
        const anySaved: any = saved;
        anySaved._localOnly = true;
        return anySaved as MoltEntry;
      }
      return saved;
    })();

    setEntries((prev) =>
      editingId ? prev.map((e) => (e.id === nextSaved.id ? nextSaved : e)) : [nextSaved, ...prev]
    );

    try {
      const prevDate = baseExisting?.reminderDate;
      const nextDate = nextSaved.reminderDate;
      if (prevDate && !nextDate) {
        await cancelReminderNotification(nextSaved.id);
      } else if (nextDate) {
        await scheduleReminderNotification({
          id: nextSaved.id,
          dateISO: nextDate.slice(0, 10),
          title: `Reminder: ${nextSaved.specimen || "Unnamed"}`,
          body:
            nextSaved.notes ||
            (nextSaved.entryType === "feeding"
              ? "Feeding due."
              : nextSaved.entryType === "water"
                ? "Water change due."
                : "Care reminder."),
        });
      }
    } catch (err) {
      console.warn("Local notification scheduling failed", err);
    }

    if (isSync) {
      if (!editingId) {
        queueOfflineCreate("entries", localId, payload);
      } else if (localOnlyExisting && baseExisting) {
        queueOfflineCreate("entries", baseExisting.id, payload);
      } else if (!localOnlyExisting && editingId) {
        queueOfflineMutation("entries", "update", editingId, payload);
      }
    }

    setFormOpen(false);
    setEditingId(null);
    setFormState(defaultForm());
    setAttachments([]);
  };

  const createHealthEntry = async (form: HealthFormState) => {
    if (!mode) throw new Error("Please wait until the session is ready.");

    let specimenId = form.specimenId || undefined;
    let specimenName = form.specimen.trim() || undefined;
    let species = form.species.trim() || undefined;
    let createSpecimen:
      | {
          name: string;
          species?: string;
        }
      | undefined;

    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

    if (form.specimenMode === "create") {
      if (isSync) {
        if (!isOnline) {
          throw new Error("Creating a new specimen while offline in sync mode is not supported yet.");
        }
        createSpecimen = {
          name: form.specimen.trim(),
          species,
        };
      } else {
        const created = await createSpecimenRecord({
          name: form.specimen,
          species: form.species,
        });
        specimenId = created.id;
        specimenName = created.name;
        species = created.species ?? species;
      }
    }

    const payload = {
      autoLinkSpecimen: form.specimenMode !== "manual",
      createSpecimen,
      specimenId,
      specimen: specimenName,
      species,
      date: form.date,
      enclosureDimensions: form.enclosureDimensions.trim() || undefined,
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

    if (isSync && isOnline) {
      try {
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
        if (createSpecimen) {
          try {
            await refreshSpecimens();
          } catch {}
        }
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
      } catch (err) {
        if (createSpecimen) {
          throw err instanceof Error ? err : new Error("Unable to save health entry while creating a specimen.");
        }
        // Network error; fall back to offline flow.
      }
    }

    const now = new Date().toISOString();
    const localId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const base: HealthEntry = {
      id: localId,
      specimenId: payload.specimenId,
      manualSpecimen: payload.autoLinkSpecimen === false,
      specimen: payload.specimen,
      species: payload.species,
      date: payload.date,
      enclosureDimensions: payload.enclosureDimensions,
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
    const saved: HealthEntry = isSync ? ({ ...base, _localOnly: true } as any) : base;

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

    if (isSync) {
      queueOfflineCreate("health", localId, payload);
    }
  };

  const deleteHealthEntry = async (id: string) => {
    if (!mode) throw new Error("Please wait until the session is ready.");

    const existing = healthEntries.find((entry) => entry.id === id);

    const localOnly = isLocalOnly(existing);
    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

    let shouldQueueDelete = false;

    if (isSync && !localOnly) {
      if (isOnline) {
        try {
          const res = await fetch(`/api/health/${id}`, { method: "DELETE", credentials: "include" });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error || "Unable to delete entry.");
          }
        } catch (err) {
          // If we already threw due to a server error, rethrow.
          if (err instanceof Error && !/network/i.test(err.message) && isOnline) {
            throw err;
          }
          shouldQueueDelete = true;
        }
      } else {
        shouldQueueDelete = true;
      }
    }

    if (isSync && localOnly && existing) {
      clearOfflineCreate("health", existing.id);
    }

    if (isSync && shouldQueueDelete) {
      queueOfflineMutation("health", "delete", id);
    }

    setHealthEntries((prev) => prev.filter((entry) => entry.id !== id));
    if (existing?.followUpDate) {
      try {
        await cancelReminderNotification(healthReminderKey(id));
      } catch { }
    }
  };

  const createBreedingEntry = async (form: BreedingFormState) => {
    if (!mode) throw new Error("Please wait until the session is ready.");
    if (form.femaleSpecimenId && form.maleSpecimenId && form.femaleSpecimenId === form.maleSpecimenId) {
      throw new Error("Female and male specimens must be different.");
    }

    const sharedSpecies = form.species.trim() || undefined;
    let femaleSpecimenId = form.femaleSpecimenId || undefined;
    let femaleSpecimen = form.femaleSpecimen.trim() || undefined;
    let maleSpecimenId = form.maleSpecimenId || undefined;
    let maleSpecimen = form.maleSpecimen.trim() || undefined;
    let createFemaleSpecimen:
      | {
          name: string;
          species?: string;
          sex: "Female";
        }
      | undefined;
    let createMaleSpecimen:
      | {
          name: string;
          species?: string;
          sex: "Male";
        }
      | undefined;
    const createdLocalSpecimenIds: string[] = [];

    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

    try {
      if (form.femaleSpecimenMode === "create") {
        if (isSync) {
          if (!isOnline) {
            throw new Error("Creating a new specimen while offline in sync mode is not supported yet.");
          }
          createFemaleSpecimen = {
            name: form.femaleSpecimen.trim(),
            species: sharedSpecies,
            sex: "Female",
          };
        } else {
          const created = await createSpecimenRecord({
            name: form.femaleSpecimen,
            species: sharedSpecies,
            sex: "Female",
          });
          createdLocalSpecimenIds.push(created.id);
          femaleSpecimenId = created.id;
          femaleSpecimen = created.name;
        }
      }

      if (form.maleSpecimenMode === "create") {
        if (isSync) {
          if (!isOnline) {
            throw new Error("Creating a new specimen while offline in sync mode is not supported yet.");
          }
          createMaleSpecimen = {
            name: form.maleSpecimen.trim(),
            species: sharedSpecies,
            sex: "Male",
          };
        } else {
          const created = await createSpecimenRecord({
            name: form.maleSpecimen,
            species: sharedSpecies,
            sex: "Male",
          });
          createdLocalSpecimenIds.push(created.id);
          maleSpecimenId = created.id;
          maleSpecimen = created.name;
        }
      }
    } catch (error) {
      removeLocalSpecimenRecords(createdLocalSpecimenIds);
      throw error;
    }

    const payload = {
      ...buildBreedingPayload(form),
      autoLinkFemaleSpecimen: form.femaleSpecimenMode !== "manual",
      createFemaleSpecimen,
      femaleSpecimenId,
      femaleSpecimen,
      autoLinkMaleSpecimen: form.maleSpecimenMode !== "manual",
      createMaleSpecimen,
      maleSpecimenId,
      maleSpecimen,
      species: sharedSpecies,
    };

    if (isSync && isOnline) {
      try {
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
        if (createFemaleSpecimen || createMaleSpecimen) {
          try {
            await refreshSpecimens();
          } catch {}
        }
        await syncBreedingReminder(undefined, saved);
        return;
      } catch (err) {
        if (createFemaleSpecimen || createMaleSpecimen) {
          throw err instanceof Error ? err : new Error("Unable to save breeding entry while creating specimens.");
        }
        // Network error; fall back to offline flow.
      }
    }

    const now = new Date().toISOString();
    const localId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const base: BreedingEntry = {
      id: localId,
      femaleSpecimenId: payload.femaleSpecimenId,
      manualFemaleSpecimen: payload.autoLinkFemaleSpecimen === false,
      femaleSpecimen: payload.femaleSpecimen,
      maleSpecimenId: payload.maleSpecimenId,
      manualMaleSpecimen: payload.autoLinkMaleSpecimen === false,
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
    const saved: BreedingEntry = isSync ? ({ ...base, _localOnly: true } as any) : base;

    setBreedingEntries((prev) => [saved, ...prev]);
    await syncBreedingReminder(undefined, saved);

    if (isSync) {
      queueOfflineCreate("breeding", localId, payload);
    }
  };

  const deleteBreedingEntry = async (id: string) => {
    if (!mode) throw new Error("Please wait until the session is ready.");

    const existing = breedingEntries.find((entry) => entry.id === id);

    const localOnly = isLocalOnly(existing);
    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

    let shouldQueueDelete = false;

    if (isSync && !localOnly) {
      if (isOnline) {
        try {
          const res = await fetch(`/api/breeding/${id}`, { method: "DELETE", credentials: "include" });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error || "Unable to delete breeding entry.");
          }
        } catch (err) {
          if (err instanceof Error && isOnline) {
            throw err;
          }
          shouldQueueDelete = true;
        }
      } else {
        shouldQueueDelete = true;
      }
    }

    if (isSync && localOnly && existing) {
      clearOfflineCreate("breeding", existing.id);
    }

    if (isSync && shouldQueueDelete) {
      queueOfflineMutation("breeding", "delete", id);
    }

    setBreedingEntries((prev) => prev.filter((entry) => entry.id !== id));
    if (existing?.followUpDate) {
      try {
        await cancelReminderNotification(breedingReminderKey(id));
      } catch { }
    }
  };

  const updateBreedingEntry = async (id: string, form: BreedingFormState) => {
    if (!mode) throw new Error("Please wait until the session is ready.");

    const existing = breedingEntries.find((entry) => entry.id === id);
    if (!existing) {
      throw new Error("Breeding entry not found.");
    }

    if (form.femaleSpecimenId && form.maleSpecimenId && form.femaleSpecimenId === form.maleSpecimenId) {
      throw new Error("Female and male specimens must be different.");
    }

    const sharedSpecies = form.species.trim() || undefined;
    let femaleSpecimenId = form.femaleSpecimenId || undefined;
    let femaleSpecimen = form.femaleSpecimen.trim() || undefined;
    let maleSpecimenId = form.maleSpecimenId || undefined;
    let maleSpecimen = form.maleSpecimen.trim() || undefined;
    let createFemaleSpecimen:
      | {
          name: string;
          species?: string;
          sex: "Female";
        }
      | undefined;
    let createMaleSpecimen:
      | {
          name: string;
          species?: string;
          sex: "Male";
        }
      | undefined;
    const createdLocalSpecimenIds: string[] = [];

    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

    try {
      if (form.femaleSpecimenMode === "create") {
        if (isSync) {
          if (!isOnline) {
            throw new Error("Creating a new specimen while offline in sync mode is not supported yet.");
          }
          createFemaleSpecimen = {
            name: form.femaleSpecimen.trim(),
            species: sharedSpecies,
            sex: "Female",
          };
        } else {
          const created = await createSpecimenRecord({
            name: form.femaleSpecimen,
            species: sharedSpecies,
            sex: "Female",
          });
          createdLocalSpecimenIds.push(created.id);
          femaleSpecimenId = created.id;
          femaleSpecimen = created.name;
        }
      }

      if (form.maleSpecimenMode === "create") {
        if (isSync) {
          if (!isOnline) {
            throw new Error("Creating a new specimen while offline in sync mode is not supported yet.");
          }
          createMaleSpecimen = {
            name: form.maleSpecimen.trim(),
            species: sharedSpecies,
            sex: "Male",
          };
        } else {
          const created = await createSpecimenRecord({
            name: form.maleSpecimen,
            species: sharedSpecies,
            sex: "Male",
          });
          createdLocalSpecimenIds.push(created.id);
          maleSpecimenId = created.id;
          maleSpecimen = created.name;
        }
      }
    } catch (error) {
      removeLocalSpecimenRecords(createdLocalSpecimenIds);
      throw error;
    }

    const payload = {
      ...buildBreedingPayload(form, existing.attachments),
      autoLinkFemaleSpecimen: form.femaleSpecimenMode !== "manual",
      createFemaleSpecimen,
      femaleSpecimenId,
      femaleSpecimen,
      autoLinkMaleSpecimen: form.maleSpecimenMode !== "manual",
      createMaleSpecimen,
      maleSpecimenId,
      maleSpecimen,
      species: sharedSpecies,
    };

    const localOnly = isLocalOnly(existing);

    if (isSync && !localOnly && isOnline) {
      try {
        const res = await fetch(`/api/breeding/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || "Unable to update breeding entry.");
        }
        const saved = (await res.json()) as BreedingEntry;
        setBreedingEntries((prev) => prev.map((entry) => (entry.id === id ? saved : entry)));
        if (createFemaleSpecimen || createMaleSpecimen) {
          try {
            await refreshSpecimens();
          } catch {}
        }
        await syncBreedingReminder(existing, saved);
        return;
      } catch (err) {
        if (createFemaleSpecimen || createMaleSpecimen) {
          throw err instanceof Error ? err : new Error("Unable to update breeding entry while creating specimens.");
        }
        if (err instanceof Error && isOnline) {
          throw err;
        }
        // Network error; fall back to offline flow.
      }
    }

    const now = new Date().toISOString();
    const base: BreedingEntry = {
      ...existing,
      ...payload,
      manualFemaleSpecimen: payload.autoLinkFemaleSpecimen === false,
      manualMaleSpecimen: payload.autoLinkMaleSpecimen === false,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
    const saved: BreedingEntry = isSync ? ({ ...base, _localOnly: true } as any) : base;

    setBreedingEntries((prev) => prev.map((entry) => (entry.id === id ? saved : entry)));
    await syncBreedingReminder(existing, saved);

    if (isSync) {
      if (localOnly) {
        queueOfflineCreate("breeding", existing.id, payload);
      } else {
        queueOfflineMutation("breeding", "update", id, payload);
      }
    }
  };

  // Research stack actions (work in sync and local modes)
  const onCreateStack = async (stack: Partial<ResearchStack>) => {
    if (!mode) return;
    const payload = {
      name: stack.name,
      species: stack.species,
      category: stack.category,
      description: stack.description,
      tags: stack.tags ?? [],
      notes: stack.notes ?? [],
    };
    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

    if (isSync && isOnline) {
      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });
        if (!res.ok) return;
        const saved = (await res.json()) as ResearchStack;
        setStacks((prev) => [saved, ...prev]);
        setSelectedStackId(saved.id);
        return;
      } catch {
        // Network error; fall back to offline flow.
      }
    }

    const now = new Date().toISOString();
    const localId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const base: ResearchStack = {
      id: localId,
      name: (stack.name ?? "Untitled").trim() || "Untitled",
      species: stack.species?.trim() || undefined,
      category: stack.category?.trim() || undefined,
      description: stack.description?.trim() || undefined,
      tags: [...(stack.tags ?? [])],
      notes: [...(stack.notes ?? [])],
      createdAt: now,
      updatedAt: now,
    };
    const saved: ResearchStack = isSync ? ({ ...base, _localOnly: true } as any) : base;

    setStacks((prev) => [saved, ...prev]);
    setSelectedStackId(saved.id);

    if (isSync) {
      queueOfflineCreate("stacks", localId, payload);
    }
  };

  const onUpdateStack = async (id: string, updates: Partial<ResearchStack>) => {
    if (!mode) return;
    const existing = stacks.find((s) => s.id === id);
    if (!existing) return;

    const payload = {
      name: updates.name,
      species: updates.species,
      category: updates.category,
      description: updates.description,
      tags: updates.tags,
      notes: updates.notes,
      isEncryptedStack: updates.isEncryptedStack,
    };

    const localOnly = isLocalOnly(existing);
    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

    if (isSync && !localOnly && isOnline) {
      try {
        const res = await fetch(`/api/research/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });
        if (!res.ok) return;
        const saved = (await res.json()) as ResearchStack;
        setStacks((prev) => prev.map((s) => (s.id === id ? saved : s)));
        return;
      } catch {
        // Network error; fall back to offline flow.
      }
    }

    const nowIso = new Date().toISOString();
    const base: ResearchStack = {
      ...existing,
      ...updates,
      updatedAt: nowIso,
    };
    const saved: ResearchStack = isSync ? ({ ...base, _localOnly: true } as any) : base;

    setStacks((prev) => prev.map((s) => (s.id === id ? saved : s)));

    if (isSync) {
      if (localOnly) {
        queueOfflineCreate("stacks", id, payload);
      } else {
        queueOfflineMutation("stacks", "update", id, payload);
      }
    }
  };

  const onDeleteStack = async (id: string) => {
    if (!mode) return;
    const existing = stacks.find((s) => s.id === id);
    const localOnly = isLocalOnly(existing);
    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

    let shouldQueueDelete = false;

    if (isSync && !localOnly) {
      if (isOnline) {
        try {
          const res = await fetch(`/api/research/${id}`, { method: "DELETE", credentials: "include" });
          if (!res.ok) return;
        } catch {
          shouldQueueDelete = true;
        }
      } else {
        shouldQueueDelete = true;
      }
    }

    if (isSync && localOnly && existing) {
      clearOfflineCreate("stacks", existing.id);
    }

    if (isSync && shouldQueueDelete) {
      queueOfflineMutation("stacks", "delete", id);
    }

    setStacks((prev) => prev.filter((s) => s.id !== id));
  };

  const cancelPendingNoteSave = (stackId: string) => {
    if (noteSaveTimers.current[stackId]) {
      window.clearTimeout(noteSaveTimers.current[stackId]);
      delete noteSaveTimers.current[stackId];
    }
    delete pendingNoteUpdates.current[stackId];
    noteSaveLatestRequest.current[stackId] = Date.now();
  };

  const onCreateNote = async (stackId: string, note: Partial<ResearchNote>) => {
    cancelPendingNoteSave(stackId);
    const base: ResearchNote = {
      id: crypto.randomUUID(),
      title: (note.title ?? "New Note").trim() || "New Note",
      content: note.content ?? "",
      individualLabel: note.individualLabel,
      tags: note.tags ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // E2E encryption fields
      isEncrypted: note.isEncrypted,
      encryptionSalt: note.encryptionSalt,
      encryptionIV: note.encryptionIV,
    };
    const stack = stacks.find((s) => s.id === stackId);
    if (!stack) return;
    const updated: ResearchStack = { ...stack, notes: [base, ...stack.notes], updatedAt: new Date().toISOString() };
    await onUpdateStack(stackId, { notes: updated.notes, name: stack.name });
  };

  const onUpdateNote = (stackId: string, noteId: string, updates: Partial<ResearchNote>) => {
    if (!mode) return;

    const now = new Date().toISOString();
    let nextNotes: ResearchNote[] | null = null;

    setStacks((prev) =>
      prev.map((s) => {
        if (s.id !== stackId) return s;
        nextNotes = s.notes.map((n) => (n.id === noteId ? { ...n, ...updates, updatedAt: now } : n));
        return { ...s, notes: nextNotes, updatedAt: now };
      })
    );

    if (!nextNotes) return;
    pendingNoteUpdates.current[stackId] = nextNotes;

    if (!isSync) return;

    if (noteSaveTimers.current[stackId]) {
      window.clearTimeout(noteSaveTimers.current[stackId]);
    }

    noteSaveTimers.current[stackId] = window.setTimeout(async () => {
      const requestId = Date.now();
      noteSaveLatestRequest.current[stackId] = requestId;
      const payload = pendingNoteUpdates.current[stackId] ?? nextNotes;
      const stack = stacks.find((s) => s.id === stackId);
      const localOnly = isLocalOnly(stack);
      const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

      if (!stack) return;

      if (!isOnline || localOnly) {
        if (localOnly) {
          queueOfflineCreate("stacks", stackId, {
            name: stack.name,
            species: stack.species,
            category: stack.category,
            description: stack.description,
            tags: stack.tags,
            notes: payload,
          });
        } else {
          queueOfflineMutation("stacks", "update", stackId, { notes: payload });
        }
        return;
      }

      try {
        const res = await fetch(`/api/research/${stackId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: payload }),
          credentials: "include",
        });
        if (!res.ok) return;
        const saved = (await res.json()) as ResearchStack;
        if (noteSaveLatestRequest.current[stackId] !== requestId) return;
        setStacks((prev) => prev.map((s) => (s.id === stackId ? saved : s)));
      } catch (err) {
        console.error(err);
        queueOfflineMutation("stacks", "update", stackId, { notes: payload });
      }
    }, 400);
  };

  const onDeleteNote = async (stackId: string, noteId: string) => {
    cancelPendingNoteSave(stackId);
    const stack = stacks.find((s) => s.id === stackId);
    if (!stack) return;
    const notes = stack.notes.filter((n) => n.id !== noteId);
    await onUpdateStack(stackId, { notes, name: stack.name });
  };

  const onDuplicateNote = async (stackId: string, noteId: string) => {
    cancelPendingNoteSave(stackId);
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
    const existing = entries.find((e) => e.id === id);
    const localOnly = isLocalOnly(existing);
    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

    let shouldQueueUpdate = false;

    if (isSync && !localOnly) {
      if (isOnline) {
        try {
          const res = await fetch(`/api/logs/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reminderDate: null }),
            credentials: "include",
          });
          if (!res.ok) {
            return;
          }
        } catch {
          shouldQueueUpdate = true;
        }
      } else {
        shouldQueueUpdate = true;
      }
    }

    const updatedExisting = existing ? { ...existing, reminderDate: undefined } : undefined;

    setEntries((prev) =>
      prev.map((e) => (e.id === id ? (updatedExisting ? (updatedExisting as MoltEntry) : e) : e))
    );

    if (isSync) {
      if (localOnly && updatedExisting) {
        const payloadForCreate = buildMoltPayloadFromEntry(updatedExisting);
        queueOfflineCreate("entries", updatedExisting.id, payloadForCreate);
      } else if (!localOnly && shouldQueueUpdate) {
        queueOfflineMutation("entries", "update", id, { reminderDate: null });
      }
    }

    try {
      await cancelReminderNotification(id);
    } catch { }
  };

  const onSnooze = async (id: string, days: number) => {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + days);
    const value = nextDate.toISOString().slice(0, 10);
    if (!mode) return;
    const existing = entries.find((e) => e.id === id);
    const localOnly = isLocalOnly(existing);
    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

    let shouldQueueUpdate = false;

    if (isSync && !localOnly) {
      if (isOnline) {
        try {
          const res = await fetch(`/api/logs/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reminderDate: value }),
            credentials: "include",
          });
          if (!res.ok) {
            return;
          }
        } catch {
          shouldQueueUpdate = true;
        }
      } else {
        shouldQueueUpdate = true;
      }
    }

    const updatedExisting = existing ? { ...existing, reminderDate: value } : undefined;

    setEntries((prev) =>
      prev.map((e) => (e.id === id ? (updatedExisting ? (updatedExisting as MoltEntry) : e) : e))
    );

    if (isSync) {
      if (localOnly && updatedExisting) {
        const payloadForCreate = buildMoltPayloadFromEntry(updatedExisting);
        queueOfflineCreate("entries", updatedExisting.id, payloadForCreate);
      } else if (!localOnly && shouldQueueUpdate) {
        queueOfflineMutation("entries", "update", id, { reminderDate: value });
      }
    }

    try {
      const entry = updatedExisting ?? entries.find((e) => e.id === id);
      if (entry) {
        await scheduleReminderNotification({
          id,
          dateISO: value,
          title: `Reminder: ${entry.specimen || "Unnamed"}`,
          body: entry.notes || (entry.entryType === "feeding" ? "Feeding due." : entry.entryType === "water" ? "Water change due." : "Care reminder."),
        });
      }
    } catch { }
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

  const handleRegisterPasskey = useCallback(async () => {
    if (!isSync) return;
    setPasskeyMessage(null);
    setRegisteringPasskey(true);
    try {
      if (typeof window === "undefined" || !("credentials" in navigator)) {
        throw new Error("Passkeys are not supported in this browser.");
      }
      const optionsRes = await fetch("/api/account/passkey/options", { credentials: "include" });
      if (!optionsRes.ok) {
        const body = await optionsRes.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error || "Unable to start passkey registration.");
      }
      const options = await optionsRes.json();
      const decoded = decodeCreationOptions(options);
      const credential = (await navigator.credentials.create({ publicKey: decoded })) as PublicKeyCredential | null;
      if (!credential) {
        throw new Error("Passkey creation was cancelled.");
      }
      const verifyRes = await fetch("/api/account/passkey/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: serializePublicKeyCredential(credential) }),
        credentials: "include",
      });
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error || "Unable to save passkey.");
      }
      setPasskeyMessage("Passkey added. You can now sign in with it.");
      await refreshAccountStatus();
    } catch (err) {
      console.error(err);
      setPasskeyMessage(err instanceof Error ? err.message : "Passkey setup failed.");
    } finally {
      setRegisteringPasskey(false);
    }
  }, [isSync, refreshAccountStatus]);

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
                <LogoMark size={36} />
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
                  <a
                    href="https://discord.com/invite/ta"
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center justify-between gap-3 p-3 border border-[rgb(var(--border))] rounded-[var(--radius)] hover:bg-[rgb(var(--bg-muted))] transition-colors sm:col-span-2"
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" /></svg>
                      Join Tarantula Addicts
                    </span>
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
                {/* Change Server button - only on native platforms */}
                {Capacitor.getPlatform() !== "web" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Switch to a different server? You'll need to sign in again on the new server.")) {
                        try {
                          localStorage.removeItem("moltly:server-url");
                        } catch { }
                        // Navigate to the mobile shell root to show server selection
                        window.location.href = "/";
                      }
                    }}
                    className="mt-3 w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))] inline-flex items-center justify-center gap-2"
                  >
                    <Server className="w-4 h-4" /> Change Server
                  </button>
                )}
              </section>

              {/* Account */}
              <section>
                <h3 className="text-xs uppercase tracking-wide text-[rgb(var(--text-subtle))] mb-3">Account</h3>
                {isSync ? (
                  <div className="flex flex-col gap-2">
                    <div className="text-sm text-[rgb(var(--text-soft))]">You’re signed in. Manage your account below.</div>
                    {hasPasswordAccount === false ? (
                      <div className="text-xs text-[rgb(var(--text-subtle))]">
                        Add a username + password so you can sign in without Discord, Google, or Apple.
                      </div>
                    ) : null}
                    {passkeyCount !== null && (
                      <div className="text-xs text-[rgb(var(--text-subtle))]">
                        Passkeys on file: {passkeyCount}
                      </div>
                    )}
                    {passkeyMessage && (
                      <div className="text-xs text-[rgb(var(--success))]">{passkeyMessage}</div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void signOut({ callbackUrl: "/login" })}
                        className="px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))] inline-flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" /> Sign out
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setWscaSyncing(true);
                          setWscaSyncStatus(null);
                          try {
                            const res = await fetch("/api/sync/wsca/me", { method: "POST", credentials: "include" });
                            const text = await res.text();
                            try {
                              const data = JSON.parse(text);
                              if (res.ok) {
                                setWscaSyncStatus("WSCA sync triggered successfully.");
                              } else {
                                setWscaSyncStatus(`WSCA sync failed: ${data?.error || res.status}`);
                              }
                            } catch {
                              setWscaSyncStatus(res.ok ? "WSCA sync triggered successfully." : `WSCA sync failed (${res.status}).`);
                            }
                            try { console.log("WSCA sync response:", text); } catch { }
                          } catch (err) {
                            setWscaSyncStatus("WSCA sync failed. Please try again.");
                          } finally {
                            setWscaSyncing(false);
                          }
                        }}
                        className="px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))]"
                        disabled={wscaSyncing}
                      >
                        {wscaSyncing ? "Syncing…" : "Sync WSC now"}
                      </button>
                      {hasPasswordAccount === true ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordMode("change");
                            setCurrentPassword("");
                            setNewUsername("");
                            setNewPassword("");
                            setConfirmNewPassword("");
                            setShowChangePassword(true);
                          }}
                          className="px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))]"
                        >
                          Change password
                        </button>
                      ) : hasPasswordAccount === false ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordMode("create");
                            setCurrentPassword("");
                            setNewUsername("");
                            setNewPassword("");
                            setConfirmNewPassword("");
                            setShowChangePassword(true);
                          }}
                          className="px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))]"
                        >
                          Add password login
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleRegisterPasskey()}
                        className="px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--bg-muted))] inline-flex items-center gap-2"
                        disabled={registeringPasskey}
                      >
                        <KeyRound className="w-4 h-4" />
                        {registeringPasskey ? "Saving passkey…" : "Add passkey"}
                      </button>
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
                                const [eRes, hRes, bRes, rRes, sRes] = await Promise.all([
                                  fetch("/api/logs", { credentials: "include" }),
                                  fetch("/api/health", { credentials: "include" }),
                                  fetch("/api/breeding", { credentials: "include" }),
                                  fetch("/api/research", { credentials: "include" }),
                                  fetch("/api/specimens?includeArchived=true", { credentials: "include" }),
                                ]);
                                if (eRes.ok) setEntries(await eRes.json());
                                if (hRes.ok) setHealthEntries(await hRes.json());
                                if (bRes.ok) setBreedingEntries(await bRes.json());
                                if (rRes.ok) {
                                  const r = (await rRes.json()) as ResearchStack[];
                                  setStacks(Array.isArray(r) ? r : []);
                                  if (r.length > 0) setSelectedStackId(r[0].id);
                                }
                                if (sRes.ok) {
                                  const s = (await sRes.json()) as Specimen[];
                                  setSpecimens(Array.isArray(s) ? s : []);
                                }
                              } catch { }
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
                    {(importError || importSuccess || wscaSyncStatus) && (
                      <div className="space-y-1">
                        {(importError || importSuccess) ? (
                          <div className={"text-sm " + (importError ? "text-[rgb(var(--danger))]" : "text-[rgb(var(--success))]")}>{importError || importSuccess}</div>
                        ) : null}
                        {wscaSyncStatus ? (
                          <div className="text-sm text-[rgb(var(--text-soft))]">{wscaSyncStatus}</div>
                        ) : null}
                      </div>
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
                            const payload = {
                              version: 3,
                              exportedAt: new Date().toISOString(),
                              entries,
                              health: healthEntries,
                              breeding: breedingEntries,
                              specimens,
                              specimenCovers,
                              research: stacks,
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
                              const data = JSON.parse(text) as {
                                entries?: MoltEntry[];
                                health?: HealthEntry[];
                                breeding?: BreedingEntry[];
                                specimens?: Specimen[];
                                specimenCovers?: Record<string, string>;
                                research?: ResearchStack[];
                              };
                              const nextEntries = Array.isArray(data.entries) ? (data.entries as MoltEntry[]) : [];
                              const nextHealth = Array.isArray(data.health) ? (data.health as HealthEntry[]) : [];
                              const nextBreeding = Array.isArray(data.breeding) ? (data.breeding as BreedingEntry[]) : [];
                              const nextSpecimens = Array.isArray(data.specimens) ? (data.specimens as Specimen[]) : [];
                              const nextResearch = Array.isArray(data.research) ? (data.research as ResearchStack[]) : [];
                              const importedLegacyCovers =
                                data.specimenCovers && typeof data.specimenCovers === "object"
                                  ? Object.entries(data.specimenCovers).reduce<Record<string, string>>((acc, [key, value]) => {
                                      if (typeof key === "string" && typeof value === "string" && key.trim() && value.trim()) {
                                        acc[key] = value;
                                      }
                                      return acc;
                                    }, {})
                                  : {};
                              const specimenNameCounts = nextSpecimens.reduce<Record<string, number>>((acc, specimen) => {
                                if (!specimen.name) return acc;
                                acc[specimen.name] = (acc[specimen.name] ?? 0) + 1;
                                return acc;
                              }, {});
                              const nextSpecimenCovers = nextSpecimens.reduce<Record<string, string>>((acc, specimen) => {
                                if (specimen.name && specimen.imageUrl && specimenNameCounts[specimen.name] === 1) {
                                  acc[specimen.name] = specimen.imageUrl;
                                }
                                return acc;
                              }, { ...importedLegacyCovers });
                              setEntries(nextEntries as MoltEntry[]);
                              setHealthEntries(nextHealth as HealthEntry[]);
                              setBreedingEntries(nextBreeding as BreedingEntry[]);
                              setSpecimens(nextSpecimens);
                              setSpecimenCovers(nextSpecimenCovers);
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
                    : `Released ${formatDate(pendingUpdates[0].date)}`}
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
                      {formatDate(entry.date)}
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
        onNewEntry={isSharePreview ? undefined : openNewEntry}
        onSignOut={isSync ? () => void signOut({ callbackUrl: "/login" }) : undefined}
        onOpenInfo={() => setShowInfo(true)}
      />

      <div className="max-w-screen-lg mx-auto px-4 py-4 pb-28">
        {isPreviewActive && (
          <div className="mb-4 p-3 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--bg-muted))] text-sm text-[rgb(var(--text))]">
            Viewing shared specimen “{sharePreviewData?.specimen?.name || specimenParam || linkedSpecimen}” in read-only mode. Sign in to copy it into your account; original ownership stays with the sender.
            {sharePreviewLoading && (
              <div className="mt-2 text-xs text-[rgb(var(--text-subtle))]">Loading specimen history…</div>
            )}
            {sharePreviewError && (
              <div className="mt-2 text-xs text-[rgb(var(--danger))]">{sharePreviewError}</div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {deepLinkUrl && (
                <a
                  href={deepLinkUrl}
                  className="px-3 py-1 rounded-[var(--radius)] bg-[rgb(var(--primary))] text-white text-sm"
                >
                  Open in app
                </a>
              )}
              {intentLink && (
                <a
                  href={intentLink}
                  className="px-3 py-1 rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text))] text-sm"
                >
                  Android intent
                </a>
              )}
              {currentUserId && ownerParam && !importingShare && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!linkedSpecimen) return;
                    setImportingShare(true);
                    try {
                      if (isSync && ownerParam) {
                        const res = await fetch("/api/specimens/copy", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            specimen: specimenParam || linkedSpecimen,
                            specimenId: specimenIdParam || undefined,
                            species: speciesParam || undefined,
                            ownerId: ownerParam,
                          }),
                        });
                        if (!res.ok) {
                          const text = await res.text();
                          throw new Error(text || "Copy failed");
                        }
                        // Reload data to reflect the copied entries and cover
                        const [logsRes, healthRes, breedingRes, specimensRes] = await Promise.all([
                          fetch("/api/logs", { credentials: "include" }),
                          fetch("/api/health", { credentials: "include" }),
                          fetch("/api/breeding", { credentials: "include" }),
                          fetch("/api/specimens?includeArchived=true", { credentials: "include" }),
                        ]);
                        if (logsRes.ok) setEntries(await logsRes.json());
                        if (healthRes.ok) setHealthEntries(await healthRes.json());
                        if (breedingRes.ok) setBreedingEntries(await breedingRes.json());
                        if (specimensRes.ok) {
                          const data = (await specimensRes.json()) as Specimen[];
                          setSpecimens(Array.isArray(data) ? data : []);
                        }
                        await refreshSpecimenCovers();
                      } else {
                        // Fallback for guest/local or missing owner: create a single note entry
                        const today = new Date().toISOString().slice(0, 10);
                        const notes =
                          noteParam && noteParam.trim()
                            ? `Copied from shared label${ownerParam ? ` (owner ${ownerParam})` : ""}. ${noteParam}`
                            : `Copied from shared label${ownerParam ? ` (owner ${ownerParam})` : ""}.`;
                        const now = new Date().toISOString();
                        const sharedSpecimenName = sharePreviewData?.specimen?.name || specimenParam || linkedSpecimen;
                        const created: MoltEntry = {
                          id: `local-import-${Date.now()}`,
                          entryType: "note",
                          specimen: sharedSpecimenName,
                          species: speciesParam || undefined,
                          date: today,
                          notes,
                          createdAt: now,
                          updatedAt: now,
                        };
                        setEntries((prev) => [created, ...prev]);
                      }
                      setShareImported(true);
                      setActiveView("specimens");
                      // Redirect to home to avoid lingering share params/banners
                      router.replace("/");
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "Import failed.");
                    } finally {
                      setImportingShare(false);
                    }
                  }}
                  className="px-3 py-1 rounded-[var(--radius)] bg-[rgb(var(--success))] text-white text-sm"
                >
                  Copy to my account
                </button>
              )}
              {importingShare && (
                <span className="text-xs text-[rgb(var(--text-subtle))]">Importing…</span>
              )}
            </div>
          </div>
        )}
        {/* Keep views mounted to avoid reloading images on tab swap */}
        <div style={{ display: activeView === "overview" ? undefined : "none" }}>
          <OverviewView entries={displayEntries} specimens={displaySpecimens} onViewChange={setActiveView} covers={displayCovers} />
        </div>

        <div style={{ display: activeView === "activity" ? undefined : "none" }}>
          <ActivityView
            entries={displayEntries}
            specimens={displaySpecimens}
            onEdit={onEdit}
            onDelete={onDelete}
            onSetCover={handleSetSpecimenCover}
            onUnsetCover={handleUnsetSpecimenCover}
            covers={displayCovers}
            sizeUnit={formState.sizeUnit}
          />
        </div>

        <div style={{ display: activeView === "specimens" ? undefined : "none" }}>
          <SpecimensView
            entries={displayEntries}
            specimens={displaySpecimens}
            covers={displayCovers}
            healthEntries={displayHealthEntries}
            breedingEntries={displayBreedingEntries}
            readOnly={isPreviewActive}
            initialFocusSpecimen={linkedSpecimen ?? undefined}
            ownerId={isPreviewActive ? ownerParam || undefined : session?.user?.id || undefined}
            sizeUnit={formState.sizeUnit}
            onUpdateCover={isPreviewActive ? undefined : handleUpdateSpecimenCover}
            onEdit={isPreviewActive ? undefined : onEdit}
            onArchive={
              isPreviewActive || !isSync
                ? undefined
                : async (specimenId, archived, reason) => {
                  try {
                    const res = await fetch(`/api/specimens/${specimenId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ archived, archivedReason: reason }),
                    });
                    if (!res.ok) {
                      throw new Error("Failed to update specimen");
                    }
                    await refreshSpecimens();
                  } catch (err) {
                    console.error("Failed to archive specimen", err);
                    alert("Failed to update specimen. Please try again.");
                  }
                }
            }
            onQuickAction={
              isPreviewActive
                ? undefined
                : (specimenId, specimen, species, label) => {
                  const d = new Date();
                  const pad = (n: number) => String(n).padStart(2, "0");
                  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                  const note = label ? `- ${label} ` : "";
                  setEditingId(null);
                  setAttachments([]);
                  setFormState({
                    ...defaultForm(),
                    specimenId: specimenId || "",
                    entryType: "water",
                    specimen,
                    species: species || "",
                    date: date,
                    notes: note,
                  });
                  setFormOpen(true);
                }
            }
          />
        </div>

        <div style={{ display: activeView === "health" ? undefined : "none" }}>
          <HealthView
            entries={displayHealthEntries}
            specimens={displaySpecimens}
            readOnly={isPreviewActive}
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
        </div>

        <div style={{ display: activeView === "breeding" ? undefined : "none" }}>
          <BreedingView
            entries={displayBreedingEntries}
            specimens={displaySpecimens}
            readOnly={isPreviewActive}
            onCreate={createBreedingEntry}
            onUpdate={updateBreedingEntry}
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
        </div>

        <div style={{ display: activeView === "analytics" ? undefined : "none" }}>
          <AnalyticsView entries={entries} />
        </div>

        <div style={{ display: activeView === "reminders" ? undefined : "none" }}>
          <RemindersView entries={entries} onMarkDone={onMarkDone} onSnooze={onSnooze} onEdit={onEdit} covers={specimenCovers} />
        </div>

        <div style={{ display: activeView === "notebook" ? undefined : "none" }}>
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
        </div>

        <div style={{ display: activeView === "cultures" ? undefined : "none" }}>
          <CulturesView
            entries={cultureEntries}
            onCreate={async (form: CultureFormState) => {
              if (!mode) throw new Error("Please wait until the session is ready.");
              const payload = {
                name: form.name.trim(),
                cultureType: form.cultureType,
                species: form.species.trim() || undefined,
                quantity: form.quantity ? Number(form.quantity) : undefined,
                purchaseDate: form.purchaseDate || undefined,
                lastFed: form.lastFed || undefined,
                lastCleaned: form.lastCleaned || undefined,
                temperature: form.temperature ? Number(form.temperature) : undefined,
                temperatureUnit: form.temperature ? form.temperatureUnit : undefined,
                humidity: form.humidity ? Number(form.humidity) : undefined,
                notes: form.notes.trim() || undefined,
              };
              const res = await fetch("/api/cultures", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include",
              });
              if (!res.ok) throw new Error("Failed to create culture");
              const saved = await res.json() as CultureEntry;
              setCultureEntries((prev) => [saved, ...prev]);
            }}
            onUpdate={async (id: string, form: CultureFormState) => {
              const payload = {
                name: form.name.trim(),
                cultureType: form.cultureType,
                species: form.species.trim() || undefined,
                quantity: form.quantity ? Number(form.quantity) : undefined,
                purchaseDate: form.purchaseDate || undefined,
                lastFed: form.lastFed || undefined,
                lastCleaned: form.lastCleaned || undefined,
                temperature: form.temperature ? Number(form.temperature) : undefined,
                temperatureUnit: form.temperature ? form.temperatureUnit : undefined,
                humidity: form.humidity ? Number(form.humidity) : undefined,
                notes: form.notes.trim() || undefined,
              };
              const res = await fetch(`/api/cultures/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include",
              });
              if (!res.ok) throw new Error("Failed to update culture");
              const saved = await res.json() as CultureEntry;
              setCultureEntries((prev) => prev.map((e) => e.id === id ? saved : e));
            }}
            onDelete={async (id: string) => {
              const res = await fetch(`/api/cultures/${id}`, {
                method: "DELETE",
                credentials: "include",
              });
              if (!res.ok) throw new Error("Failed to delete culture");
              setCultureEntries((prev) => prev.filter((e) => e.id !== id));
            }}
            onQuickUpdate={async (id: string, field: "lastFed" | "lastCleaned", value: string) => {
              const res = await fetch(`/api/cultures/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ [field]: value }),
                credentials: "include",
              });
              if (!res.ok) throw new Error("Failed to update culture");
              const saved = await res.json() as CultureEntry;
              setCultureEntries((prev) => prev.map((e) => e.id === id ? saved : e));
            }}
          />
        </div>
      </div>

      {/* Footer links moved into Info modal */}

      <EntryFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        formState={formState}
        specimens={specimens}
        onFormChange={(u) => setFormState((p) => ({ ...p, ...u }))}
        onSubmit={onSubmit}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        onSetCover={(att) => handleSetSpecimenCover(formState.specimenId || formState.specimen || "Unnamed", { id: att.id, url: att.url, name: att.name })}
        onUnsetCover={() => handleUnsetSpecimenCover(formState.specimenId || formState.specimen || "Unnamed")}
        currentCoverUrl={
          formState.specimenId
            ? (() => {
                const selectedSpecimen = specimens.find((specimen) => specimen.id === formState.specimenId);
                if (!selectedSpecimen) return specimenCovers[formState.specimen || "Unnamed"];
                if (selectedSpecimen.imageUrl !== undefined) return selectedSpecimen.imageUrl || undefined;
                return specimenCovers[selectedSpecimen.name];
              })()
            : specimenCovers[formState.specimen || "Unnamed"]
        }
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
              <h2 id="change-password-title" className="text-lg font-bold">
                {isCreatingPassword ? "Add password login" : "Change password"}
              </h2>
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
                const trimmedUsername = newUsername.trim();
                if (isCreatingPassword && hasUsernameAccount !== true) {
                  if (!trimmedUsername) {
                    alert("Username is required to add a password login.");
                    return;
                  }
                  if (!/^[a-zA-Z0-9]{2,32}$/.test(trimmedUsername)) {
                    alert("Username must be 2-32 characters (letters and numbers only).");
                    return;
                  }
                }
                if (newPassword !== confirmNewPassword) {
                  alert("New passwords do not match.");
                  return;
                }
                setChangingPassword(true);
                try {
                  const payload = isCreatingPassword
                    ? { newPassword, username: trimmedUsername || undefined }
                    : { currentPassword, newPassword };
                  const res = await fetch("/api/account/password", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                  });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({} as { error?: string }));
                    throw new Error(body.error || "Failed to change password.");
                  }
                  alert(
                    isCreatingPassword
                      ? "Password login added. You can now sign in with email and password."
                      : "Password updated."
                  );
                  setHasPasswordAccount(true);
                  setHasUsernameAccount(true);
                  setShowChangePassword(false);
                  setCurrentPassword("");
                  setNewUsername("");
                  setNewPassword("");
                  setConfirmNewPassword("");
                  setPasswordMode("change");
                } catch (err) {
                  console.error(err);
                  alert(err instanceof Error ? err.message : "Failed to change password.");
                } finally {
                  setChangingPassword(false);
                }
              }}
            >
              <p className="text-sm text-[rgb(var(--text-soft))]">
                {isCreatingPassword
                  ? "Set a password so you can log in without using an OAuth provider."
                  : "Update the password you use for sign-in."}
              </p>
              {isCreatingPassword && hasUsernameAccount !== true && (
                <div className="space-y-1">
                  <label className="text-sm text-[rgb(var(--text-soft))]">Username</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="yourname"
                    required
                  />
                </div>
              )}
              {!isCreatingPassword && (
                <div className="space-y-1">
                  <label className="text-sm text-[rgb(var(--text-soft))]">Current password</label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required={!isCreatingPassword}
                  />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-sm text-[rgb(var(--text-soft))]">New password</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 chars, letters + numbers"
                  minLength={8}
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
                  minLength={8}
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
