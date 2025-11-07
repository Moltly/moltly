import { z } from "zod";
import { AttachmentWithDataSchema } from "./attachments";
import { MoltEntryBaseSchema } from "./molt";
import { HealthEntryBaseSchema } from "./health";
import { BreedingEntryBaseSchema } from "./breeding";

const ImportMoltEntrySchema = MoltEntryBaseSchema.safeExtend({
  attachments: z.array(AttachmentWithDataSchema).optional()
}).transform((data) => {
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
  attachments: z.array(AttachmentWithDataSchema).optional()
}).transform((data) => ({
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
  attachments: z.array(AttachmentWithDataSchema).optional()
}).transform((data) => ({
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
    breeding: z.array(ImportBreedingEntrySchema).optional()
  })
  .transform((data) => ({
    entries: data.entries ?? [],
    research: data.research ?? [],
    health: data.health ?? [],
    breeding: data.breeding ?? []
  }));

export type ImportPayload = z.infer<typeof ImportPayloadSchema>;
