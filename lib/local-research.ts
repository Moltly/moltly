import type { ResearchStack } from "../types/research";
import { normalizeStack } from "./research-stacks";

const LOCAL_STORAGE_KEY = "moltly:guest-research-stacks";

type UnknownRecord = Record<string, unknown>;

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseStacks(raw: string | null): ResearchStack[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is UnknownRecord => Boolean(item) && typeof item === "object")
      .map((item) => normalizeStack(item))
      .filter((stack): stack is NonNullable<ReturnType<typeof normalizeStack>> => Boolean(stack))
      .map((stack) => ({
        id: stack.id,
        name: stack.name,
        species: stack.species,
        category: stack.category,
        description: stack.description,
        tags: stack.tags,
        notes: stack.notes.map((note) => ({
          id: note.id,
          title: note.title,
          individualLabel: note.individualLabel,
          content: note.content,
          tags: note.tags,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt
        })),
        createdAt: stack.createdAt,
        updatedAt: stack.updatedAt
      }));
  } catch {
    return [];
  }
}

export function readLocalResearchStacks(): ResearchStack[] {
  const storage = getLocalStorage();
  if (!storage) {
    return [];
  }
  const raw = storage.getItem(LOCAL_STORAGE_KEY);
  return parseStacks(raw);
}

export function writeLocalResearchStacks(stacks: ResearchStack[]): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stacks));
  } catch {
    // Ignore write failures so the UI keeps working in-memory.
  }
}

function clearLocalResearchStacks(): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(LOCAL_STORAGE_KEY);
  } catch {
    // Ignore cleanup failures.
  }
}

const LOCAL_RESEARCH_STORAGE_KEY = LOCAL_STORAGE_KEY;
