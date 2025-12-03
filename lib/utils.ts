import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function parseInputDate(date: Date | string): Date {
  if (date instanceof Date) return date;
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.\d+)?Z)?$/);
  if (match) {
    const y = Number.parseInt(match[1], 10);
    const m = Number.parseInt(match[2], 10);
    const d = Number.parseInt(match[3], 10);
    return new Date(y, m - 1, d);
  }
  return new Date(date);
}

export function formatDate(date: Date | string): string {
  const d = parseInputDate(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelativeDate(date: Date | string): string {
  const d = parseInputDate(date);
  const now = new Date();
  const diffInDays = Math.floor(
    (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffInDays === 0) return "Today";
  if (diffInDays === 1) return "Yesterday";
  if (diffInDays < 7) return `${diffInDays}d ago`;
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)}w ago`;
  if (diffInDays < 365) return `${Math.floor(diffInDays / 30)}mo ago`;
  return `${Math.floor(diffInDays / 365)}y ago`;
}

export function getDaysUntil(date: Date | string): number {
  const d = parseInputDate(date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getReminderStatus(
  reminderDate: Date | string | null | undefined
): "overdue" | "due" | "soon" | "upcoming" | null {
  if (!reminderDate) return null;
  const daysUntil = getDaysUntil(reminderDate);

  if (daysUntil < 0) return "overdue";
  if (daysUntil === 0) return "due";
  if (daysUntil <= 3) return "soon";
  return "upcoming";
}

// Temperature conversions to keep storage canonical while allowing UI preference
export function cToF(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

export function fToC(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

export function cmToInches(cm: number): number {
  return cm / 2.54;
}

export function inchesToCm(inches: number): number {
  return inches * 2.54;
}
