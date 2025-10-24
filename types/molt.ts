export type EntryType = "molt" | "feeding";
export type Stage = "Pre-molt" | "Molt" | "Post-molt";
export type FeedingOutcome = "Offered" | "Ate" | "Refused" | "Not Observed";

export type Attachment = {
  id: string;
  name: string;
  url: string;
  type: string;
  addedAt: string;
};

export type MoltEntry = {
  id: string;
  entryType: EntryType;
  specimen: string;
  species?: string;
  date: string;
  stage?: Stage;
  oldSize?: number;
  newSize?: number;
  humidity?: number;
  temperature?: number;
  notes?: string;
  reminderDate?: string;
  feedingPrey?: string;
  feedingOutcome?: FeedingOutcome;
  feedingAmount?: string;
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
  humidity: string;
  temperature: string;
  notes: string;
  reminderDate: string;
  feedingPrey: string;
  feedingOutcome: "" | FeedingOutcome;
  feedingAmount: string;
};

export type SpecimenDashboard = {
  key: string;
  specimen: string;
  species?: string;
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
};

export type ViewKey = "overview" | "activity" | "specimens" | "reminders" | "notebook";
export type DataMode = "sync" | "local" | null;

export type Filters = {
  search: string;
  stage: "all" | Stage;
  type: "all" | EntryType;
  order: "asc" | "desc";
};
