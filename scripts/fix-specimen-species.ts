/**
 * Fix script for specimens with same name but different species.
 * 
 * This script:
 * 1. Finds entries grouped by userId + specimen name + species
 * 2. Creates separate Specimen records for each unique combination
 * 3. Updates entries to link to the correct specimen
 * 
 * Run with: npx tsx scripts/fix-specimen-species.ts
 */

import { connectMongoose } from "../lib/mongoose";
import Specimen from "../models/Specimen";
import MoltEntry from "../models/MoltEntry";
import HealthEntry from "../models/HealthEntry";
import BreedingEntry from "../models/BreedingEntry";
import SpecimenCover from "../models/SpecimenCover";
import { Types } from "mongoose";

async function fixSpecimenSpecies() {
    console.log("[fix-specimen-species] Connecting to database...");
    await connectMongoose();

    // Get specimen covers for image URLs
    const covers = await SpecimenCover.find({});
    const coverMap = new Map<string, string>();
    for (const c of covers) {
        const key = `${c.userId}-${c.key}`;
        coverMap.set(key, c.imageUrl as string);
    }

    // Collect unique specimens from ALL entries (by userId + name + species)
    type SpecInfo = {
        userId: Types.ObjectId;
        name: string;
        species?: string;
        existingSpecimenId?: Types.ObjectId;
    };
    const uniqueSpecimens = new Map<string, SpecInfo>();

    console.log("[fix-specimen-species] Scanning molt entries...");
    const moltEntries = await MoltEntry.find({
        specimen: { $exists: true, $nin: [null, ""] }
    });

    for (const entry of moltEntries) {
        const e = entry as { userId: Types.ObjectId; specimen?: string; species?: string; specimenId?: Types.ObjectId };
        const name = (e.specimen || "").trim();
        if (!name) continue;
        const species = (e.species || "").trim();
        const key = `${e.userId}-${name}-${species}`;
        if (!uniqueSpecimens.has(key)) {
            uniqueSpecimens.set(key, {
                userId: e.userId,
                name,
                species: species || undefined,
                existingSpecimenId: e.specimenId
            });
        }
    }

    console.log("[fix-specimen-species] Scanning health entries...");
    const healthEntries = await HealthEntry.find({
        specimen: { $exists: true, $nin: [null, ""] }
    });

    for (const entry of healthEntries) {
        const e = entry as { userId: Types.ObjectId; specimen?: string; species?: string; specimenId?: Types.ObjectId };
        const name = (e.specimen || "").trim();
        if (!name) continue;
        const species = (e.species || "").trim();
        const key = `${e.userId}-${name}-${species}`;
        if (!uniqueSpecimens.has(key)) {
            uniqueSpecimens.set(key, {
                userId: e.userId,
                name,
                species: species || undefined,
                existingSpecimenId: e.specimenId
            });
        }
    }

    console.log("[fix-specimen-species] Scanning breeding entries...");
    const breedingEntries = await BreedingEntry.find({
        $or: [
            { femaleSpecimen: { $exists: true, $nin: [null, ""] } },
            { maleSpecimen: { $exists: true, $nin: [null, ""] } }
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

    console.log(`[fix-specimen-species] Found ${uniqueSpecimens.size} unique specimen combinations.`);

    // Build map of what specimens already exist (keyed by userId-name-species)
    const existingSpecimens = await Specimen.find({});
    const specimenMap = new Map<string, Types.ObjectId>();
    for (const spec of existingSpecimens) {
        const key = `${spec.userId}-${spec.name}-${spec.species || ''}`;
        specimenMap.set(key, spec._id as Types.ObjectId);
    }

    console.log(`[fix-specimen-species] Found ${existingSpecimens.length} existing specimen records.`);

    // Create missing Specimen records
    let created = 0;
    for (const [key, info] of uniqueSpecimens) {
        if (!specimenMap.has(key)) {
            const coverKey = `${info.userId}-${info.name}`;
            const imageUrl = coverMap.get(coverKey);

            console.log(`[fix-specimen-species] Creating specimen: "${info.name}" (${info.species || 'no species'})`);
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
    console.log(`[fix-specimen-species] Created ${created} new Specimen records.`);

    // Update entries to point to correct specimens
    let updated = 0;

    console.log("[fix-specimen-species] Updating molt entries...");
    for (const entry of moltEntries) {
        const e = entry as { _id: Types.ObjectId; userId: Types.ObjectId; specimen?: string; species?: string; specimenId?: Types.ObjectId };
        const name = (e.specimen || "").trim();
        if (!name) continue;
        const species = (e.species || "").trim();
        const key = `${e.userId}-${name}-${species}`;
        const correctSpecimenId = specimenMap.get(key);

        if (correctSpecimenId && (!e.specimenId || !e.specimenId.equals(correctSpecimenId))) {
            await MoltEntry.updateOne({ _id: e._id }, { $set: { specimenId: correctSpecimenId } });
            updated++;
        }
    }

    console.log("[fix-specimen-species] Updating health entries...");
    for (const entry of healthEntries) {
        const e = entry as { _id: Types.ObjectId; userId: Types.ObjectId; specimen?: string; species?: string; specimenId?: Types.ObjectId };
        const name = (e.specimen || "").trim();
        if (!name) continue;
        const species = (e.species || "").trim();
        const key = `${e.userId}-${name}-${species}`;
        const correctSpecimenId = specimenMap.get(key);

        if (correctSpecimenId && (!e.specimenId || !e.specimenId.equals(correctSpecimenId))) {
            await HealthEntry.updateOne({ _id: e._id }, { $set: { specimenId: correctSpecimenId } });
            updated++;
        }
    }

    console.log("[fix-specimen-species] Updating breeding entries...");
    for (const entry of breedingEntries) {
        const e = entry as {
            _id: Types.ObjectId;
            userId: Types.ObjectId;
            femaleSpecimen?: string;
            maleSpecimen?: string;
            species?: string;
            femaleSpecimenId?: Types.ObjectId;
            maleSpecimenId?: Types.ObjectId;
        };
        const species = (e.species || "").trim();
        const updates: Record<string, Types.ObjectId> = {};

        const fName = (e.femaleSpecimen || "").trim();
        if (fName) {
            const key = `${e.userId}-${fName}-${species}`;
            const correctId = specimenMap.get(key);
            if (correctId && (!e.femaleSpecimenId || !e.femaleSpecimenId.equals(correctId))) {
                updates.femaleSpecimenId = correctId;
            }
        }

        const mName = (e.maleSpecimen || "").trim();
        if (mName) {
            const key = `${e.userId}-${mName}-${species}`;
            const correctId = specimenMap.get(key);
            if (correctId && (!e.maleSpecimenId || !e.maleSpecimenId.equals(correctId))) {
                updates.maleSpecimenId = correctId;
            }
        }

        if (Object.keys(updates).length > 0) {
            await BreedingEntry.updateOne({ _id: e._id }, { $set: updates });
            updated++;
        }
    }

    console.log(`[fix-specimen-species] Updated ${updated} entries.`);

    // Clean up orphaned specimens (specimens with no entries pointing to them)
    console.log("[fix-specimen-species] Checking for orphaned specimens...");
    const usedSpecimenIds = new Set<string>();

    for (const entry of moltEntries) {
        const e = entry as { specimenId?: Types.ObjectId };
        if (e.specimenId) usedSpecimenIds.add(e.specimenId.toString());
    }
    for (const entry of healthEntries) {
        const e = entry as { specimenId?: Types.ObjectId };
        if (e.specimenId) usedSpecimenIds.add(e.specimenId.toString());
    }
    for (const entry of breedingEntries) {
        const e = entry as { femaleSpecimenId?: Types.ObjectId; maleSpecimenId?: Types.ObjectId };
        if (e.femaleSpecimenId) usedSpecimenIds.add(e.femaleSpecimenId.toString());
        if (e.maleSpecimenId) usedSpecimenIds.add(e.maleSpecimenId.toString());
    }

    // Re-fetch to get updated specimenIds
    const updatedMoltEntries = await MoltEntry.find({ specimenId: { $exists: true } });
    const updatedHealthEntries = await HealthEntry.find({ specimenId: { $exists: true } });
    const updatedBreedingEntries = await BreedingEntry.find({
        $or: [
            { femaleSpecimenId: { $exists: true } },
            { maleSpecimenId: { $exists: true } }
        ]
    });

    usedSpecimenIds.clear();
    for (const entry of updatedMoltEntries) {
        const e = entry as { specimenId?: Types.ObjectId };
        if (e.specimenId) usedSpecimenIds.add(e.specimenId.toString());
    }
    for (const entry of updatedHealthEntries) {
        const e = entry as { specimenId?: Types.ObjectId };
        if (e.specimenId) usedSpecimenIds.add(e.specimenId.toString());
    }
    for (const entry of updatedBreedingEntries) {
        const e = entry as { femaleSpecimenId?: Types.ObjectId; maleSpecimenId?: Types.ObjectId };
        if (e.femaleSpecimenId) usedSpecimenIds.add(e.femaleSpecimenId.toString());
        if (e.maleSpecimenId) usedSpecimenIds.add(e.maleSpecimenId.toString());
    }

    let orphaned = 0;
    for (const spec of existingSpecimens) {
        if (!usedSpecimenIds.has(spec._id.toString())) {
            console.log(`[fix-specimen-species] Orphaned specimen: "${spec.name}" (${spec.species || 'no species'}) - ID: ${spec._id}`);
            orphaned++;
        }
    }

    if (orphaned > 0) {
        console.log(`[fix-specimen-species] Found ${orphaned} orphaned specimens. You may want to delete them manually if they're not needed.`);
    }

    console.log("[fix-specimen-species] Done!");
    process.exit(0);
}

fixSpecimenSpecies().catch((err) => {
    console.error("[fix-specimen-species] Error:", err);
    process.exit(1);
});
