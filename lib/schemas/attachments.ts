import { z } from "zod";
import { optionalDateTimeString, optionalTrimmedString } from "./common";

const dataUrlSchema = z
  .string()
  .trim()
  .refine((value) => value.startsWith("data:"), { message: "Invalid data URL." });

export const AttachmentInputSchema = z.object({
  id: optionalTrimmedString(128),
  name: optionalTrimmedString(256),
  url: optionalTrimmedString(2048),
  type: optionalTrimmedString(128),
  addedAt: optionalDateTimeString
});

export const AttachmentWithDataSchema = AttachmentInputSchema.extend({
  dataUrl: dataUrlSchema.optional()
});

export type AttachmentInput = z.infer<typeof AttachmentInputSchema>;
export type AttachmentWithDataInput = z.infer<typeof AttachmentWithDataSchema>;
