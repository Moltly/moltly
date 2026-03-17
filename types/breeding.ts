import type { Attachment } from "./molt";

type BreedingStatus = "Planned" | "Attempted" | "Successful" | "Failed" | "Observation";
type EggSacStatus = "Not Laid" | "Laid" | "Pulled" | "Failed" | "Hatched";

export type BreedingEntry = {
  id: string;
  femaleSpecimenId?: string;
  manualFemaleSpecimen?: boolean;
  detachedFemaleSpecimen?: boolean;
  femaleSpecimen?: string;
  maleSpecimenId?: string;
  manualMaleSpecimen?: boolean;
  detachedMaleSpecimen?: boolean;
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
  femaleSpecimenMode: "manual" | "existing" | "create";
  femaleSpecimenId: string;
  femaleSpecimen: string;
  maleSpecimenMode: "manual" | "existing" | "create";
  maleSpecimenId: string;
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
