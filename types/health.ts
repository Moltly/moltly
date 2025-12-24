import type { Attachment } from "./molt";

type HealthCondition = "Stable" | "Observation" | "Critical";
export type HealthEntry = {
  id: string;
  specimenId?: string;
  specimen?: string;
  species?: string;
  date: string;
  enclosureDimensions?: string;
  temperature?: number;
  temperatureUnit?: "C" | "F";
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
  enclosureDimensions: string;
  temperature: string;
  temperatureUnit: "C" | "F";
  humidity: string;
  condition: HealthCondition;
  behavior: string;
  healthIssues: string;
  treatment: string;
  followUpDate: string;
  notes: string;
};
