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

export const BreedingEntryBaseSchema = z.object({
  femaleSpecimen: optionalTrimmedString(160),
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
  femaleSpecimen: data.femaleSpecimen,
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
