import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import type { DataMode, MoltEntry } from "@/types/molt";
import type { HealthEntry } from "@/types/health";
import type { BreedingEntry } from "@/types/breeding";
import type { ResearchStack } from "@/types/research";
import { readLocalEntries, writeLocalEntries } from "@/lib/local-entries";
import { readLocalHealthEntries, writeLocalHealthEntries } from "@/lib/local-health";
import { readLocalBreedingEntries, writeLocalBreedingEntries } from "@/lib/local-breeding";
import { readLocalResearchStacks, writeLocalResearchStacks } from "@/lib/local-research";
import { readLocalSpecimenCovers, writeLocalSpecimenCovers } from "@/lib/local-specimens";
import { warmCachedImage } from "@/lib/image-cache";

type SetStateAction<T> = T | ((prev: T) => T);

function usePersistedState<T>(initialValue: T, persist: (value: T) => void): [T, (action: SetStateAction<T>) => void] {
  const [state, setState] = useState<T>(initialValue);

  const setPersistedState = useCallback(
    (action: SetStateAction<T>) => {
      setState((prev) => {
        const next = typeof action === "function" ? (action as (value: T) => T)(prev) : action;
        persist(next);
        return next;
      });
    },
    [persist]
  );

  return [state, setPersistedState];
}

const CACHE_KEYS = {
  entries: "moltly:cache:entries",
  health: "moltly:cache:health",
  breeding: "moltly:cache:breeding",
  covers: "moltly:cache:covers",
  stacks: "moltly:cache:stacks",
} as const;

export function useDashboardData() {
  const { data: session, status } = useSession();
  const mode: DataMode | null = status === "loading" ? null : session?.user?.id ? "sync" : "local";
  const isSync = mode === "sync";

  // Simple read-through caches for sync mode (enables cold-start offline views)
  const readCache = <T,>(key: string, fallback: T): T => {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch { return fallback; }
  };
  const writeCache = (key: string, value: unknown) => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
  };

  const persistEntries = useCallback(
    (value: MoltEntry[]) => {
      if (mode === "local") {
        writeLocalEntries(value as unknown as Record<string, unknown>[]);
      }
      // Also keep a read-through cache for sync mode to support offline reloads
      writeCache(CACHE_KEYS.entries, value ?? []);
    },
    [mode]
  );
  const [entries, setEntries] = usePersistedState<MoltEntry[]>([], persistEntries);

  const persistHealth = useCallback(
    (value: HealthEntry[]) => {
      if (mode === "local") {
        writeLocalHealthEntries(value as unknown as Record<string, unknown>[]);
      }
      writeCache(CACHE_KEYS.health, value ?? []);
    },
    [mode]
  );
  const [healthEntries, setHealthEntries] = usePersistedState<HealthEntry[]>([], persistHealth);

  const persistBreeding = useCallback(
    (value: BreedingEntry[]) => {
      if (mode === "local") {
        writeLocalBreedingEntries(value as unknown as Record<string, unknown>[]);
      }
      writeCache(CACHE_KEYS.breeding, value ?? []);
    },
    [mode]
  );
  const [breedingEntries, setBreedingEntries] = usePersistedState<BreedingEntry[]>([], persistBreeding);

  const persistSpecimenCovers = useCallback(
    (value: Record<string, string>) => {
      if (mode === "local") {
        writeLocalSpecimenCovers(value);
      }
      writeCache(CACHE_KEYS.covers, value ?? {});
    },
    [mode]
  );
  const [specimenCovers, setSpecimenCovers] = usePersistedState<Record<string, string>>({}, persistSpecimenCovers);

  const persistStacks = useCallback(
    (value: ResearchStack[]) => {
      if (mode === "local") {
        writeLocalResearchStacks(value);
      }
      writeCache(CACHE_KEYS.stacks, value ?? []);
    },
    [mode]
  );
  const [stacks, setStacks] = usePersistedState<ResearchStack[]>([], persistStacks);
  const [selectedStackId, setSelectedStackId] = useState<string | null>(null);

  const refreshEntries = useCallback(async () => {
    if (!mode) return;
    try {
      if (isSync) {
        const res = await fetch("/api/logs", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load entries");
        const data = (await res.json()) as MoltEntry[];
        setEntries(Array.isArray(data) ? data : []);
      } else {
        const localEntries = readLocalEntries() as unknown as MoltEntry[];
        setEntries(Array.isArray(localEntries) ? localEntries : []);
      }
    } catch (error) {
      console.error(error);
      // In sync mode, keep previous state and attempt cached fallback
      if (isSync) {
        const cached = readCache<MoltEntry[]>(CACHE_KEYS.entries, []);
        if (cached.length > 0) setEntries(cached);
      }
    }
  }, [mode, isSync, setEntries]);

  const refreshHealth = useCallback(async () => {
    if (!mode) return;
    try {
      if (isSync) {
        const res = await fetch("/api/health", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load health entries");
        const data = (await res.json()) as HealthEntry[];
        setHealthEntries(Array.isArray(data) ? data : []);
      } else {
        const localHealth = readLocalHealthEntries() as unknown as HealthEntry[];
        setHealthEntries(Array.isArray(localHealth) ? localHealth : []);
      }
    } catch (error) {
      console.error(error);
      if (isSync) {
        const cached = readCache<HealthEntry[]>(CACHE_KEYS.health, []);
        if (cached.length > 0) setHealthEntries(cached);
      }
    }
  }, [mode, isSync, setHealthEntries]);

  const refreshBreeding = useCallback(async () => {
    if (!mode) return;
    try {
      if (isSync) {
        const res = await fetch("/api/breeding", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load breeding entries");
        const data = (await res.json()) as BreedingEntry[];
        setBreedingEntries(Array.isArray(data) ? data : []);
      } else {
        const localBreeding = readLocalBreedingEntries() as unknown as BreedingEntry[];
        setBreedingEntries(Array.isArray(localBreeding) ? localBreeding : []);
      }
    } catch (error) {
      console.error(error);
      if (isSync) {
        const cached = readCache<BreedingEntry[]>(CACHE_KEYS.breeding, []);
        if (cached.length > 0) setBreedingEntries(cached);
      }
    }
  }, [mode, isSync, setBreedingEntries]);

  const refreshSpecimenCovers = useCallback(async () => {
    if (!mode) return;
    try {
      if (isSync) {
        const res = await fetch("/api/specimens", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load specimen covers");
        const data = (await res.json()) as Array<{ key: string; imageUrl: string }>;
        const map: Record<string, string> = {};
        for (const item of data) {
          if (item?.key && item?.imageUrl) {
            map[item.key] = item.imageUrl;
          }
        }
        setSpecimenCovers(map);
      } else {
        setSpecimenCovers(readLocalSpecimenCovers());
      }
    } catch (error) {
      console.error(error);
      if (isSync) {
        const cached = readCache<Record<string, string>>(CACHE_KEYS.covers, {});
        if (Object.keys(cached).length > 0) setSpecimenCovers(cached);
      }
    }
  }, [mode, isSync, setSpecimenCovers]);

  const refreshStacks = useCallback(async () => {
    if (!mode) return;
    try {
      if (isSync) {
        const res = await fetch("/api/research", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load research stacks");
        const data = (await res.json()) as ResearchStack[];
        setStacks(Array.isArray(data) ? data : []);
      } else {
        setStacks(readLocalResearchStacks());
      }
    } catch (error) {
      console.error(error);
      if (isSync) {
        const cached = readCache<ResearchStack[]>(CACHE_KEYS.stacks, []);
        if (cached.length > 0) setStacks(cached);
      }
    }
  }, [mode, isSync, setStacks]);

  const updateSpecimenCover = useCallback(
    async (specimenKey: string, imageUrl: string | null) => {
      const key = specimenKey || "Unnamed";
      try {
        if (isSync) {
          const res = await fetch("/api/specimens", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ key, imageUrl })
          });
          if (!res.ok) {
            throw new Error("Failed to update specimen cover");
          }
        }
        setSpecimenCovers((prev) => {
          const next = { ...prev };
          if (imageUrl) {
            next[key] = imageUrl;
          } else {
            delete next[key];
          }
          return next;
        });
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    },
    [isSync, setSpecimenCovers]
  );

  useEffect(() => {
    void refreshEntries();
  }, [refreshEntries]);

  useEffect(() => {
    void refreshSpecimenCovers();
  }, [refreshSpecimenCovers]);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    void refreshBreeding();
  }, [refreshBreeding]);

  useEffect(() => {
    void refreshStacks();
  }, [refreshStacks]);

  useEffect(() => {
    setSelectedStackId((prev) => {
      if (stacks.length === 0) return null;
      if (prev && stacks.some((stack) => stack.id === prev)) {
        return prev;
      }
      return stacks[0]?.id ?? null;
    });
  }, [stacks]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const urls = Object.values(specimenCovers ?? {});
    if (urls.length === 0) return;
    const timeout = window.setTimeout(() => {
      urls.forEach((url) => warmCachedImage(url));
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [specimenCovers]);

  return {
    session,
    status,
    mode,
    isSync,
    entries,
    setEntries,
    refreshEntries,
    healthEntries,
    setHealthEntries,
    refreshHealth,
    breedingEntries,
    setBreedingEntries,
    refreshBreeding,
    specimenCovers,
    updateSpecimenCover,
    stacks,
    setStacks,
    refreshStacks,
    selectedStackId,
    setSelectedStackId
  };
}
