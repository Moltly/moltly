// Allow custom entry type strings beyond built-ins
export type EntryType = string;
export type Stage = "Pre-molt" | "Molt" | "Post-molt";
export type FeedingOutcome = "Offered" | "Ate" | "Refused" | "Not Observed";
export type SizeUnit = "cm" | "in";

export type Attachment = {
  id: string;
  name: string;
  url: string;
  type: string;
  addedAt: string;
};

export type Specimen = {
  id: string;
  name: string;
  species?: string;
  imageUrl?: string;
  notes?: string;
  attachments?: Attachment[];
  archived?: boolean;
  archivedAt?: string;
  archivedReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type MoltEntry = {
  id: string;
  entryType: EntryType;
  specimenId?: string;
  specimen?: string;
  species?: string;
  date: string;
  stage?: Stage;
  oldSize?: number;
  newSize?: number;
  humidity?: number;
  temperature?: number;
  temperatureUnit?: "C" | "F";
  notes?: string;
  reminderDate?: string;
  feedingPrey?: string;
  feedingOutcome?: FeedingOutcome;
  feedingAmount?: string;
  cultureId?: string;
  attachments?: Attachment[];
  createdAt: string;
  updatedAt: string;
};

export type FormState = {
  entryType: EntryType;
  specimen: string;
  species: string;
  date: string;
  stage: Stage;
  oldSize: string;
  newSize: string;
  sizeUnit: SizeUnit;
  humidity: string;
  temperature: string;
  temperatureUnit: "C" | "F";
  notes: string;
  reminderDate: string;
  feedingPrey: string;
  feedingOutcome: "" | FeedingOutcome;
  feedingAmount: string;
};

export type SpecimenDashboard = {
  key: string;
  specimenId?: string;
  specimen: string;
  species?: string;
  // Optional cover image URL for this specimen, derived from attachments
  imageUrl?: string;
  totalMolts: number;
  totalFeedings: number;
  stageCounts: Record<Stage, number>;
  lastMoltDate: string | null;
  firstMoltDate: string | null;
  averageIntervalDays: number | null;
  lastIntervalDays: number | null;
  yearMolts: number;
  attachmentsCount: number;
  reminder: { tone: string; label: string; date?: string } | null;
  recentEntries: MoltEntry[];
  latestEntry: MoltEntry | null;
  archived?: boolean;
  archivedAt?: string;
  archivedReason?: string;
};

export type ViewKey = "overview" | "activity" | "specimens" | "reminders" | "notebook" | "health" | "breeding" | "analytics" | "cultures";
export type DataMode = "sync" | "local" | null;

export type Filters = {
  search: string;
  stage: "all" | Stage;
  type: "all" | EntryType;
  order: "asc" | "desc";
};
