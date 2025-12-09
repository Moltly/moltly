import { z } from "zod";
import { optionalDateTimeString, optionalTrimmedString } from "./common";

const dataUrlSchema = z
  .string()
  .trim()
  .refine((value) => value.startsWith("data:"), { message: "Invalid data URL." });

// URL schema that allows either short HTTP URLs (up to 2048 chars) or data URLs of any length
const attachmentUrlSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed;
  },
  z.union([
    // Allow data URLs of any length (base64-encoded images can be very large)
    z.string().startsWith("data:"),
    // Regular URLs are limited to 2048 chars
    z.string().max(2048),
    z.undefined()
  ])
);

export const AttachmentInputSchema = z.object({
  id: optionalTrimmedString(128),
  name: optionalTrimmedString(256),
  url: attachmentUrlSchema,
  type: optionalTrimmedString(128),
  addedAt: optionalDateTimeString
});

export const AttachmentWithDataSchema = AttachmentInputSchema.extend({
  dataUrl: dataUrlSchema.optional()
});

export type AttachmentInput = z.infer<typeof AttachmentInputSchema>;
export type AttachmentWithDataInput = z.infer<typeof AttachmentWithDataSchema>;
