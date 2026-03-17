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
const specimenSexEnum = z.enum(["Male", "Female", "Unknown", "Unsexed"]);
const createSpecimenSchema = z.object({
  name: z.string().trim().min(1).max(160),
  species: optionalTrimmedString(160),
  sex: specimenSexEnum.optional(),
});

export const HealthEntryBaseSchema = z.object({
  autoLinkSpecimen: z.boolean().optional(),
  createSpecimen: createSpecimenSchema.optional(),
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
  autoLinkSpecimen: data.autoLinkSpecimen ?? true,
  createSpecimen: data.createSpecimen,
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
