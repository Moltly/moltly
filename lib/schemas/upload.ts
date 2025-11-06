import { z } from "zod";
import { optionalTrimmedString } from "./common";

const ALLOWED_IMAGE_MIME_PREFIX = "image/";
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const UploadedImageSchema = z
  .object({
    name: optionalTrimmedString(256),
    type: optionalTrimmedString(128),
    size: z.number().int().nonnegative().max(MAX_UPLOAD_SIZE_BYTES, "File exceeds 10MB limit.")
  })
  .superRefine((data, ctx) => {
    if (!data.type || !data.type.startsWith(ALLOWED_IMAGE_MIME_PREFIX)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only image uploads are supported."
      });
    }
  });
