import { z } from "zod";
import { AttachmentWithDataSchema } from "./attachments";
import { MoltEntryBaseSchema } from "./molt";
import { HealthEntryBaseSchema } from "./health";
import { BreedingEntryBaseSchema } from "./breeding";
import { optionalDateString, optionalTrimmedString } from "./common";

const ImportMoltEntrySchema = MoltEntryBaseSchema.safeExtend({
  detachedSpecimen: z.boolean().optional(),
  specimenId: optionalTrimmedString(64),
  attachments: z.array(AttachmentWithDataSchema).optional()
}).transform((data) => {
  const entryType = data.entryType ?? "molt";
  return {
    detachedSpecimen: data.detachedSpecimen,
    specimenId: data.specimenId,
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
    attachments: (data.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      url: attachment.url,
      type: attachment.type,
      addedAt: attachment.addedAt,
      dataUrl: attachment.dataUrl
    }))
  };
});

const ImportHealthEntrySchema = HealthEntryBaseSchema.safeExtend({
  manualSpecimen: z.boolean().optional(),
  detachedSpecimen: z.boolean().optional(),
  specimenId: optionalTrimmedString(64),
  attachments: z.array(AttachmentWithDataSchema).optional()
}).transform((data) => ({
  manualSpecimen: data.manualSpecimen,
  detachedSpecimen: data.detachedSpecimen,
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
  attachments: (data.attachments ?? []).map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    url: attachment.url,
    type: attachment.type,
    addedAt: attachment.addedAt,
    dataUrl: attachment.dataUrl
  }))
}));

const ImportBreedingEntrySchema = BreedingEntryBaseSchema.safeExtend({
  manualFemaleSpecimen: z.boolean().optional(),
  detachedFemaleSpecimen: z.boolean().optional(),
  femaleSpecimenId: optionalTrimmedString(64),
  manualMaleSpecimen: z.boolean().optional(),
  detachedMaleSpecimen: z.boolean().optional(),
  maleSpecimenId: optionalTrimmedString(64),
  attachments: z.array(AttachmentWithDataSchema).optional()
}).transform((data) => ({
  manualFemaleSpecimen: data.manualFemaleSpecimen,
  detachedFemaleSpecimen: data.detachedFemaleSpecimen,
  femaleSpecimenId: data.femaleSpecimenId,
  femaleSpecimen: data.femaleSpecimen,
  manualMaleSpecimen: data.manualMaleSpecimen,
  detachedMaleSpecimen: data.detachedMaleSpecimen,
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
  attachments: (data.attachments ?? []).map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    url: attachment.url,
    type: attachment.type,
    addedAt: attachment.addedAt,
    dataUrl: attachment.dataUrl
  }))
}));

const ImportSpecimenSchema = z.object({
  id: optionalTrimmedString(64),
  name: z.string().trim().min(1).max(160),
  species: optionalTrimmedString(160),
  sex: z.enum(["Male", "Female", "Unknown", "Unsexed"]).optional(),
  imageUrl: optionalTrimmedString(4000),
  notes: optionalTrimmedString(4000),
  pairingStatus: z.enum(["none", "seeking_male", "seeking_female", "has_male", "has_female", "open_to_offers"]).optional(),
  availableForPairing: z.boolean().optional(),
  pairingNotes: optionalTrimmedString(4000),
  archived: z.boolean().optional(),
  archivedAt: optionalDateString,
  archivedReason: optionalTrimmedString(4000),
  attachments: z.array(AttachmentWithDataSchema).optional(),
  createdAt: optionalDateString,
  updatedAt: optionalDateString,
}).transform((data) => ({
  id: data.id,
  name: data.name,
  species: data.species,
  sex: data.sex,
  imageUrl: data.imageUrl,
  notes: data.notes,
  pairingStatus:
    data.pairingStatus === "has_male"
      ? "seeking_female"
      : data.pairingStatus === "has_female"
        ? "seeking_male"
        : data.pairingStatus ?? (data.availableForPairing ? "seeking_female" : "none"),
  pairingNotes: data.pairingNotes,
  archived: data.archived ?? false,
  archivedAt: data.archivedAt,
  archivedReason: data.archivedReason,
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
  attachments: (data.attachments ?? []).map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    url: attachment.url,
    type: attachment.type,
    addedAt: attachment.addedAt,
    dataUrl: attachment.dataUrl
  }))
}));

export const ImportPayloadSchema = z
  .object({
    entries: z.array(ImportMoltEntrySchema).optional(),
    research: z.array(z.unknown()).optional(),
    health: z.array(ImportHealthEntrySchema).optional(),
    breeding: z.array(ImportBreedingEntrySchema).optional(),
    specimens: z.array(ImportSpecimenSchema).optional(),
    specimenCovers: z.record(z.string(), z.string()).optional()
  })
  .transform((data) => ({
    entries: data.entries ?? [],
    research: data.research ?? [],
    health: data.health ?? [],
    breeding: data.breeding ?? [],
    specimens: data.specimens ?? [],
    specimenCovers: data.specimenCovers ?? {}
  }));

export type ImportPayload = z.infer<typeof ImportPayloadSchema>;
