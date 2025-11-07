import getMongoClientPromise from "./mongodb";
import { connectMongoose } from "./mongoose";
import SpeciesSuggestion from "@/models/SpeciesSuggestion";

export function parseSpeciesFullName(fullName: string): {
  genus?: string;
  species?: string;
  subspecies?: string;
} {
  const tokens = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return {};
  const [genus, species, ...rest] = tokens;
  return {
    genus,
    species,
    subspecies: rest.length > 0 ? rest.join(" ") : undefined,
  };
}

export async function ensureSpeciesSuggestion(fullName: string, userId?: string) {
  const normalized = (fullName || "").trim();
  if (!normalized) return;

  const fullNameLC = normalized.toLowerCase();

  const client = await getMongoClientPromise();
  const db = client.db();

  // If species already exists in canonical collection, nothing to do
  const existing = await db.collection("species").findOne({ fullNameLC });
  if (existing) return;

  // Otherwise, create or upsert a pending suggestion
  await connectMongoose();
  const parts = parseSpeciesFullName(normalized);
  try {
    await SpeciesSuggestion.findOneAndUpdate(
      { fullNameLC },
      {
        $setOnInsert: {
          fullName: normalized,
          fullNameLC,
          genus: parts.genus,
          species: parts.species,
          subspecies: parts.subspecies,
          status: "pending",
          submittedBy: userId,
          submittedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch {
    // ignore errors for background upsert
  }
}

