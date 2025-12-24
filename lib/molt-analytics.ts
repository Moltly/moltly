import { MoltEntry } from "@/types/molt";

type IntervalStats = {
  averageDays: number | null;
  lastDays: number | null;
  intervals: number[];
};

export type SpecimenAnalytics = {
  specimen: string;
  species?: string;
  specimenId?: string;
  moltIntervals: IntervalStats;
  yearlyMolts: Record<number, number>;
};

export function computeSpecimenAnalytics(entries: MoltEntry[]): SpecimenAnalytics[] {
  const specimens = new Map<string, { specimen: string; species?: string; specimenId?: string; moltDates: number[] }>();

  for (const entry of entries) {
    if (entry.entryType !== "molt") continue;
    // Use specimenId when available, otherwise use name+species as key
    const key = entry.specimenId ?? `${entry.specimen ?? "Unnamed"}-${entry.species ?? ""}`;
    if (!specimens.has(key)) {
      specimens.set(key, { specimen: entry.specimen ?? "Unnamed", species: entry.species, specimenId: entry.specimenId, moltDates: [] });
    }
    const dataset = specimens.get(key)!;
    dataset.moltDates.push(new Date(entry.date).getTime());
    if (!dataset.species && entry.species) {
      dataset.species = entry.species;
    }
  }

  const analytics: SpecimenAnalytics[] = [];

  specimens.forEach(({ specimen, species, specimenId, moltDates }) => {
    const sorted = [...moltDates].sort((a, b) => b - a); // newest → oldest
    const intervals: number[] = [];
    const yearlyMolts: Record<number, number> = {};

    for (const ts of sorted) {
      const year = new Date(ts).getFullYear();
      yearlyMolts[year] = (yearlyMolts[year] ?? 0) + 1;
    }

    for (let i = 0; i < sorted.length - 1; i += 1) {
      const diffMs = sorted[i] - sorted[i + 1];
      intervals.push(Math.round(diffMs / (1000 * 60 * 60 * 24)));
    }

    const averageDays = intervals.length > 0 ? Math.round(intervals.reduce((acc, v) => acc + v, 0) / intervals.length) : null;
    const lastDays = intervals.length > 0 ? intervals[0] : null;

    analytics.push({
      specimen,
      species,
      specimenId,
      moltIntervals: { averageDays, lastDays, intervals },
      yearlyMolts,
    });
  });

  return analytics.sort((a, b) => a.specimen.localeCompare(b.specimen));
}
