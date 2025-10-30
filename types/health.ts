import type { Attachment } from "./molt";

export type HealthCondition = "Stable" | "Observation" | "Critical";
export type WeightUnit = "g" | "oz";

export type HealthEntry = {
  id: string;
  specimen?: string;
  species?: string;
  date: string;
  weight?: number;
  weightUnit: WeightUnit;
  temperature?: number;
  humidity?: number;
  condition: HealthCondition;
  behavior?: string;
  healthIssues?: string;
  treatment?: string;
  followUpDate?: string;
  notes?: string;
  attachments?: Attachment[];
  createdAt: string;
  updatedAt: string;
};

export type HealthFormState = {
  specimen: string;
  species: string;
  date: string;
  weight: string;
  weightUnit: WeightUnit;
  temperature: string;
  humidity: string;
  condition: HealthCondition;
  behavior: string;
  healthIssues: string;
  treatment: string;
  followUpDate: string;
  notes: string;
};

