import { z } from "zod";
import { AttachmentInputSchema } from "./attachments";
import {
  optionalDateString,
  optionalNumber,
  optionalTrimmedString,
  requiredDateString
} from "./common";

const weightUnitEnum = z.enum(["g", "oz"]);
const temperatureUnitEnum = z.enum(["C", "F"]);
const conditionEnum = z.enum(["Stable", "Observation", "Critical"]);

export const HealthEntryBaseSchema = z.object({
  specimen: optionalTrimmedString(160),
  species: optionalTrimmedString(160),
  date: requiredDateString,
  weight: optionalNumber,
  weightUnit: weightUnitEnum.optional(),
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
  specimen: data.specimen,
  species: data.species,
  date: data.date,
  weight: data.weight,
  weightUnit: data.weightUnit ?? "g",
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
