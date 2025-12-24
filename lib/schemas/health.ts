import { z } from "zod";
import { AttachmentInputSchema } from "./attachments";
import {
  optionalDateString,
  optionalNumber,
  optionalTrimmedString,
  requiredDateString
} from "./common";

const temperatureUnitEnum = z.enum(["C", "F"]);
const conditionEnum = z.enum(["Stable", "Observation", "Critical"]);

export const HealthEntryBaseSchema = z.object({
  specimenId: optionalTrimmedString(32),
  specimen: optionalTrimmedString(160),
  species: optionalTrimmedString(160),
  date: requiredDateString,
  enclosureDimensions: optionalTrimmedString(120),
  temperature: optionalNumber,
  temperatureUnit: temperatureUnitEnum.optional(),
  humidity: optionalNumber,
  condition: conditionEnum.optional(),
  behavior: optionalTrimmedString(512),
  healthIssues: optionalTrimmedString(512),
  treatment: optionalTrimmedString(512),
  followUpDate: optionalDateString,
  notes: optionalTrimmedString(2000),
  attachments: z.array(AttachmentInputSchema).optional()
});

export const HealthEntryCreateSchema = HealthEntryBaseSchema.transform((data) => ({
  specimenId: data.specimenId,
  specimen: data.specimen,
  species: data.species,
  date: data.date,
  enclosureDimensions: data.enclosureDimensions,
  temperature: data.temperature,
  temperatureUnit: data.temperatureUnit,
  humidity: data.humidity,
  condition: data.condition ?? "Stable",
  behavior: data.behavior,
  healthIssues: data.healthIssues,
  treatment: data.treatment,
  followUpDate: data.followUpDate,
  notes: data.notes,
  attachments: data.attachments ?? []
}));
