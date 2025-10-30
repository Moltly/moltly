const LOCAL_STORAGE_KEY = "moltly:guest-breeding";

type UnknownRecord = Record<string, unknown>;

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseEntries(raw: string | null): UnknownRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is UnknownRecord => typeof item === "object" && item !== null);
    }
    return [];
  } catch {
    return [];
  }
}

export function readLocalBreedingEntries(): UnknownRecord[] {
  const storage = getLocalStorage();
  if (!storage) return [];
  const raw = storage.getItem(LOCAL_STORAGE_KEY);
  return parseEntries(raw);
}

export function writeLocalBreedingEntries(entries: UnknownRecord[]): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore persistence errors for offline usage
  }
}

