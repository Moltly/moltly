import { z } from "zod";
import { AttachmentInputSchema, type AttachmentInput } from "./attachments";
import {
  optionalDateString,
  optionalNumber,
  optionalTrimmedString,
  requiredDateString
} from "./common";

// Accept any custom entry type string; built-ins are still special-cased downstream
const entryTypeSchema = z.string().trim().min(1).max(32);
const stageEnum = z.enum(["Pre-molt", "Molt", "Post-molt"]);
const feedingOutcomeEnum = z.enum(["Offered", "Ate", "Refused", "Not Observed"]);
const temperatureUnitEnum = z.enum(["C", "F"]);

export const MoltEntryBaseSchema = z
  .object({
    specimen: optionalTrimmedString(160),
    species: optionalTrimmedString(160),
    date: requiredDateString,
    entryType: entryTypeSchema.optional(),
    stage: stageEnum.optional(),
    oldSize: optionalNumber,
    newSize: optionalNumber,
    humidity: optionalNumber,
    temperature: optionalNumber,
    temperatureUnit: temperatureUnitEnum.optional(),
    reminderDate: optionalDateString,
    notes: optionalTrimmedString(4000),
    feedingPrey: optionalTrimmedString(256),
    feedingOutcome: feedingOutcomeEnum.optional(),
    feedingAmount: optionalTrimmedString(128),
    attachments: z.array(AttachmentInputSchema).optional()
  })
  .superRefine((data, ctx) => {
    const entryType = (data.entryType ?? "molt");
    if (entryType === "molt" && !data.species) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Species is required for molt entries.",
        path: ["species"]
      });
    }
    if (entryType !== "molt" && data.stage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Stage can only be set for molt entries.",
        path: ["stage"]
      });
    }
    if (entryType !== "feeding") {
      if (data.feedingPrey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Feeding prey applies only to feeding entries.",
          path: ["feedingPrey"]
        });
      }
      if (data.feedingOutcome) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Feeding outcome applies only to feeding entries.",
          path: ["feedingOutcome"]
        });
      }
      if (data.feedingAmount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Feeding amount applies only to feeding entries.",
          path: ["feedingAmount"]
        });
      }
    }
  });

export const MoltEntryCreateSchema = MoltEntryBaseSchema.transform((data) => {
  const entryType = data.entryType ?? "molt";
  return {
    specimen: data.specimen,
    species: data.species,
    date: data.date,
    entryType,
    stage: entryType === "molt" ? data.stage ?? "Molt" : undefined,
    oldSize: data.oldSize,
    newSize: data.newSize,
    humidity: data.humidity,
    temperature: data.temperature,
    temperatureUnit: data.temperatureUnit,
    reminderDate: data.reminderDate,
    notes: data.notes,
    feedingPrey: entryType === "feeding" ? data.feedingPrey : undefined,
    feedingOutcome: entryType === "feeding" ? data.feedingOutcome : undefined,
    feedingAmount: entryType === "feeding" ? data.feedingAmount : undefined,
    attachments: (data.attachments ?? []).map<AttachmentInput>((attachment) => ({
      ...attachment,
      id: attachment.id,
      name: attachment.name,
      url: attachment.url,
      type: attachment.type,
      addedAt: attachment.addedAt
    }))
  };
});
