"use client";

import type { SizeUnit } from "@/types/molt";

const STORAGE_KEY = "moltly:sizeUnit";

export function getSavedSizeUnit(): SizeUnit {
  if (typeof window === "undefined") return "cm";
  try {
    const val = (localStorage.getItem(STORAGE_KEY) || "").toLowerCase();
    return val === "in" ? "in" : "cm";
  } catch {
    return "cm";
  }
}

export function saveSizeUnit(unit: SizeUnit) {
  try {
    localStorage.setItem(STORAGE_KEY, unit);
  } catch {
    // noop
  }
}
