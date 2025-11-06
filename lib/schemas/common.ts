import { z } from "zod";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDateString(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (ISO_DATE_PATTERN.test(trimmed)) {
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === trimmed) {
        return trimmed;
      }
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return undefined;
}

export const requiredDateString = z.preprocess(
  (value) => normalizeDateString(value) ?? value,
  z.string().regex(ISO_DATE_PATTERN, "Invalid date")
);

export const optionalDateString = z.preprocess(
  (value) => {
    const normalized = normalizeDateString(value);
    return normalized ?? undefined;
  },
  z.union([z.string().regex(ISO_DATE_PATTERN, "Invalid date"), z.undefined()])
);

const isValidDateTimeString = (value: string) => {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};

export const optionalDateTimeString = z.preprocess(
  (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString();
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      if (isValidDateTimeString(trimmed)) {
        return trimmed;
      }
    }
    return undefined;
  },
  z.union([z.string(), z.undefined()])
);

export const optionalTrimmedString = (maxLength = 512) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      return trimmed;
    },
    z.union([z.string().max(maxLength), z.undefined()])
  );

export const optionalNumber = z.preprocess(
  (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const parsed = Number.parseFloat(trimmed);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  },
  z.union([z.number().finite(), z.undefined()])
);

export const optionalSafeInteger = z.preprocess(
  (value) => {
    if (typeof value === "number" && Number.isSafeInteger(value)) return value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isSafeInteger(parsed)) return parsed;
    }
    return undefined;
  },
  z.union([z.number().int(), z.undefined()])
);
