import type { Attachment } from "./molt";

export type BreedingStatus = "Planned" | "Attempted" | "Successful" | "Failed" | "Observation";
export type EggSacStatus = "Not Laid" | "Laid" | "Pulled" | "Failed" | "Hatched";

export type BreedingEntry = {
  id: string;
  femaleSpecimen?: string;
  maleSpecimen?: string;
  species?: string;
  pairingDate: string;
  status: BreedingStatus;
  pairingNotes?: string;
  eggSacDate?: string;
  eggSacStatus: EggSacStatus;
  eggSacCount?: number;
  hatchDate?: string;
  slingCount?: number;
  followUpDate?: string;
  notes?: string;
  attachments?: Attachment[];
  createdAt: string;
  updatedAt: string;
};

export type BreedingFormState = {
  femaleSpecimen: string;
  maleSpecimen: string;
  species: string;
  pairingDate: string;
  status: BreedingStatus;
  pairingNotes: string;
  eggSacDate: string;
  eggSacStatus: EggSacStatus;
  eggSacCount: string;
  hatchDate: string;
  slingCount: string;
  followUpDate: string;
  notes: string;
};

