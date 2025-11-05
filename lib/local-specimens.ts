const LOCAL_STORAGE_KEY = "moltly:guest-specimens";

type UnknownRecord = Record<string, unknown>;

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLocalSpecimenCovers(): Record<string, string> {
  const storage = getLocalStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as UnknownRecord;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof k === "string" && typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeLocalSpecimenCovers(covers: Record<string, string>): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(covers));
  } catch {
    // ignore
  }
}

