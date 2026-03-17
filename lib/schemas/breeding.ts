import { z } from "zod";
import { AttachmentInputSchema } from "./attachments";
import {
  optionalDateString,
  optionalSafeInteger,
  optionalTrimmedString,
  requiredDateString
} from "./common";

const breedingStatusEnum = z.enum(["Planned", "Attempted", "Successful", "Failed", "Observation"]);
const eggStatusEnum = z.enum(["Not Laid", "Laid", "Pulled", "Failed", "Hatched"]);
const specimenSexEnum = z.enum(["Male", "Female", "Unknown", "Unsexed"]);
const createSpecimenSchema = z.object({
  name: z.string().trim().min(1).max(160),
  species: optionalTrimmedString(160),
  sex: specimenSexEnum.optional(),
});

export const BreedingEntryBaseSchema = z.object({
  autoLinkFemaleSpecimen: z.boolean().optional(),
  createFemaleSpecimen: createSpecimenSchema.optional(),
  femaleSpecimenId: optionalTrimmedString(32),
  femaleSpecimen: optionalTrimmedString(160),
  autoLinkMaleSpecimen: z.boolean().optional(),
  createMaleSpecimen: createSpecimenSchema.optional(),
  maleSpecimenId: optionalTrimmedString(32),
  maleSpecimen: optionalTrimmedString(160),
  species: optionalTrimmedString(160),
  pairingDate: requiredDateString,
  status: breedingStatusEnum.optional(),
  pairingNotes: optionalTrimmedString(2000),
  eggSacDate: optionalDateString,
  eggSacStatus: eggStatusEnum.optional(),
  eggSacCount: optionalSafeInteger,
  hatchDate: optionalDateString,
  slingCount: optionalSafeInteger,
  followUpDate: optionalDateString,
  notes: optionalTrimmedString(2000),
  attachments: z.array(AttachmentInputSchema).optional()
});

export const BreedingEntryCreateSchema = BreedingEntryBaseSchema.transform((data) => ({
  autoLinkFemaleSpecimen: data.autoLinkFemaleSpecimen ?? true,
  createFemaleSpecimen: data.createFemaleSpecimen,
  femaleSpecimenId: data.femaleSpecimenId,
  femaleSpecimen: data.femaleSpecimen,
  autoLinkMaleSpecimen: data.autoLinkMaleSpecimen ?? true,
  createMaleSpecimen: data.createMaleSpecimen,
  maleSpecimenId: data.maleSpecimenId,
  maleSpecimen: data.maleSpecimen,
  species: data.species,
  pairingDate: data.pairingDate,
  status: data.status ?? "Planned",
  pairingNotes: data.pairingNotes,
  eggSacDate: data.eggSacDate,
  eggSacStatus: data.eggSacStatus ?? "Not Laid",
  eggSacCount: data.eggSacCount,
  hatchDate: data.hatchDate,
  slingCount: data.slingCount,
  followUpDate: data.followUpDate,
  notes: data.notes,
  attachments: data.attachments ?? []
}));
