"use client";

type TempUnit = "C" | "F";

const STORAGE_KEY = "moltly:tempUnit";

export function getSavedTempUnit(): TempUnit {
  if (typeof window === "undefined") return "F";
  try {
    const v = (localStorage.getItem(STORAGE_KEY) || "").toUpperCase();
    return v === "C" || v === "F" ? (v as TempUnit) : "F";
  } catch {
    return "F";
  }
}

export function saveTempUnit(unit: TempUnit) {
  try {
    localStorage.setItem(STORAGE_KEY, unit);
  } catch {}
}
