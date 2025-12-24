/**
 * Auto-migration for Specimen entities.
 * This runs on app startup to ensure existing data is migrated.
 * Safe to run multiple times (idempotent).
 */

import { connectMongoose } from "@/lib/mongoose";
import Specimen from "@/models/Specimen";
import MoltEntry from "@/models/MoltEntry";
import HealthEntry from "@/models/HealthEntry";
import BreedingEntry from "@/models/BreedingEntry";
import SpecimenCover from "@/models/SpecimenCover";
import { Types } from "mongoose";

let migrationRun = false;

export async function runSpecimenMigration(): Promise<void> {
    // Only run once per app lifecycle
    if (migrationRun) return;
    migrationRun = true;

    try {
        await connectMongoose();

        // Check if migration is needed (any entries without specimenId)
        const needsMigration = await MoltEntry.findOne({
            specimen: { $exists: true, $nin: [null, ""] },
            specimenId: { $exists: false }
        });

        if (!needsMigration) {
            console.log("[specimen-migration] No migration needed.");
            return;
        }

        console.log("[specimen-migration] Starting migration...");

        // Build map of existing specimens (key includes species for uniqueness)
        const existingSpecimens = await Specimen.find({});
        const specimenMap = new Map<string, Types.ObjectId>();
        for (const spec of existingSpecimens) {
            // Use name + species as key to distinguish specimens with same name but different species
            const key = `${spec.userId}-${spec.name}-${spec.species || ''}`;
            specimenMap.set(key, spec._id as Types.ObjectId);
        }

        // Get specimen covers for image URLs
        const covers = await SpecimenCover.find({});
        const coverMap = new Map<string, string>();
        for (const c of covers) {
            const key = `${c.userId}-${c.key}`;
            coverMap.set(key, c.imageUrl as string);
        }

        // Collect unique specimens from entries
        type SpecInfo = { userId: Types.ObjectId; name: string; species?: string };
        const uniqueSpecimens = new Map<string, SpecInfo>();

        // Process molt entries
        const moltEntries = await MoltEntry.find({
            specimen: { $exists: true, $nin: [null, ""] },
            specimenId: { $exists: false }
        });

        for (const entry of moltEntries) {
            const name = ((entry as { specimen?: string }).specimen || "").trim();
            if (!name) continue;
            const species = ((entry as { species?: string }).species || "").trim();
            const key = `${entry.userId}-${name}-${species}`;
            if (!uniqueSpecimens.has(key)) {
                uniqueSpecimens.set(key, {
                    userId: entry.userId as Types.ObjectId,
                    name,
                    species: species || undefined
                });
            }
        }

        // Process health entries
        const healthEntries = await HealthEntry.find({
            specimen: { $exists: true, $nin: [null, ""] },
            specimenId: { $exists: false }
        });

        for (const entry of healthEntries) {
            const name = ((entry as { specimen?: string }).specimen || "").trim();
            if (!name) continue;
            const species = ((entry as { species?: string }).species || "").trim();
            const key = `${entry.userId}-${name}-${species}`;
            if (!uniqueSpecimens.has(key)) {
                uniqueSpecimens.set(key, {
                    userId: entry.userId as Types.ObjectId,
                    name,
                    species: species || undefined
                });
            }
        }

        // Process breeding entries
        const breedingEntries = await BreedingEntry.find({
            $or: [
                { femaleSpecimen: { $exists: true, $nin: [null, ""] }, femaleSpecimenId: { $exists: false } },
                { maleSpecimen: { $exists: true, $nin: [null, ""] }, maleSpecimenId: { $exists: false } }
            ]
        });

        for (const entry of breedingEntries) {
            const e = entry as { userId: Types.ObjectId; femaleSpecimen?: string; maleSpecimen?: string; species?: string };
            const fName = (e.femaleSpecimen || "").trim();
            const mName = (e.maleSpecimen || "").trim();
            const species = (e.species || "").trim();
            if (fName) {
                const key = `${e.userId}-${fName}-${species}`;
                if (!uniqueSpecimens.has(key)) {
                    uniqueSpecimens.set(key, { userId: e.userId, name: fName, species: species || undefined });
                }
            }
            if (mName) {
                const key = `${e.userId}-${mName}-${species}`;
                if (!uniqueSpecimens.has(key)) {
                    uniqueSpecimens.set(key, { userId: e.userId, name: mName, species: species || undefined });
                }
            }
        }

        console.log(`[specimen-migration] Found ${uniqueSpecimens.size} unique specimens.`);

        // Create Specimen entities
        let created = 0;
        for (const [key, info] of uniqueSpecimens) {
            if (!specimenMap.has(key)) {
                const coverKey = `${info.userId}-${info.name}`;
                const imageUrl = coverMap.get(coverKey);
                const spec = await Specimen.create({
                    userId: info.userId,
                    name: info.name,
                    species: info.species,
                    imageUrl
                });
                specimenMap.set(key, spec._id as Types.ObjectId);
                created++;
            }
        }
        console.log(`[specimen-migration] Created ${created} Specimen entities.`);

        // Update entries with specimenId
        let updated = 0;
        for (const entry of moltEntries) {
            const name = ((entry as { specimen?: string }).specimen || "").trim();
            if (!name) continue;
            const species = ((entry as { species?: string }).species || "").trim();
            const key = `${entry.userId}-${name}-${species}`;
            const specimenId = specimenMap.get(key);
            if (specimenId) {
                await MoltEntry.updateOne({ _id: entry._id }, { $set: { specimenId } });
                updated++;
            }
        }

        for (const entry of healthEntries) {
            const name = ((entry as { specimen?: string }).specimen || "").trim();
            if (!name) continue;
            const species = ((entry as { species?: string }).species || "").trim();
            const key = `${entry.userId}-${name}-${species}`;
            const specimenId = specimenMap.get(key);
            if (specimenId) {
                await HealthEntry.updateOne({ _id: entry._id }, { $set: { specimenId } });
                updated++;
            }
        }

        for (const entry of breedingEntries) {
            const e = entry as { _id: Types.ObjectId; userId: Types.ObjectId; femaleSpecimen?: string; maleSpecimen?: string; species?: string };
            const updates: Record<string, Types.ObjectId> = {};
            const fName = (e.femaleSpecimen || "").trim();
            const mName = (e.maleSpecimen || "").trim();
            const species = (e.species || "").trim();

            if (fName) {
                const key = `${e.userId}-${fName}-${species}`;
                const id = specimenMap.get(key);
                if (id) updates.femaleSpecimenId = id;
            }
            if (mName) {
                const key = `${e.userId}-${mName}-${species}`;
                const id = specimenMap.get(key);
                if (id) updates.maleSpecimenId = id;
            }

            if (Object.keys(updates).length > 0) {
                await BreedingEntry.updateOne({ _id: e._id }, { $set: updates });
                updated++;
            }
        }

        console.log(`[specimen-migration] Updated ${updated} entries.`);
        console.log("[specimen-migration] Migration complete.");
    } catch (error) {
        console.error("[specimen-migration] Migration error:", error);
        // Don't throw - app should still start even if migration fails
    }
}
