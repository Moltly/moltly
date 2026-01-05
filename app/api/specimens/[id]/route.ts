export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { connectMongoose } from "@/lib/mongoose";
import Specimen from "@/models/Specimen";
import MoltEntry from "@/models/MoltEntry";
import HealthEntry from "@/models/HealthEntry";
import BreedingEntry from "@/models/BreedingEntry";
import { z } from "zod";
import { Types } from "mongoose";

const sexEnum = z.enum(["Male", "Female", "Unknown", "Unsexed"]);

const SpecimenUpdateSchema = z.object({
    name: z.string().trim().min(1).max(160).optional(),
    species: z.string().trim().max(160).optional(),
    sex: sexEnum.optional().nullable(),
    imageUrl: z.string().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    archived: z.boolean().optional(),
    archivedReason: z.string().trim().max(200).optional().nullable()
});

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ error: "Invalid specimen ID" }, { status: 400 });
    }

    await connectMongoose();
    const specimen = await Specimen.findOne({ _id: id, userId: session.user.id });

    if (!specimen) {
        return NextResponse.json({ error: "Specimen not found" }, { status: 404 });
    }

    return NextResponse.json({
        id: specimen._id.toString(),
        name: specimen.name,
        species: specimen.species,
        sex: specimen.sex,
        imageUrl: specimen.imageUrl,
        notes: specimen.notes,
        archived: specimen.archived ?? false,
        archivedAt: specimen.archivedAt?.toISOString(),
        archivedReason: specimen.archivedReason,
        createdAt: specimen.createdAt?.toISOString(),
        updatedAt: specimen.updatedAt?.toISOString()
    });
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ error: "Invalid specimen ID" }, { status: 400 });
    }

    try {
        const body = await request.json();
        const parsed = SpecimenUpdateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid request body", details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        await connectMongoose();

        const updates: Record<string, unknown> = {};
        if (parsed.data.name !== undefined) updates.name = parsed.data.name;
        if (parsed.data.species !== undefined) updates.species = parsed.data.species;
        if (parsed.data.sex !== undefined) updates.sex = parsed.data.sex;
        if (parsed.data.imageUrl !== undefined) updates.imageUrl = parsed.data.imageUrl;
        if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

        // Handle archive state changes
        if (parsed.data.archived === true) {
            updates.archived = true;
            updates.archivedAt = new Date();
            if (parsed.data.archivedReason !== undefined) {
                updates.archivedReason = parsed.data.archivedReason;
            }
        } else if (parsed.data.archived === false) {
            updates.archived = false;
            updates.archivedAt = null;
            updates.archivedReason = null;
        } else if (parsed.data.archivedReason !== undefined) {
            // Allow updating reason without changing archived state
            updates.archivedReason = parsed.data.archivedReason;
        }

        const specimen = await Specimen.findOneAndUpdate(
            { _id: id, userId: session.user.id },
            { $set: updates },
            { new: true }
        );

        if (!specimen) {
            return NextResponse.json({ error: "Specimen not found" }, { status: 404 });
        }

        return NextResponse.json({
            id: specimen._id.toString(),
            name: specimen.name,
            species: specimen.species,
            sex: specimen.sex,
            imageUrl: specimen.imageUrl,
            notes: specimen.notes,
            archived: specimen.archived ?? false,
            archivedAt: specimen.archivedAt?.toISOString(),
            archivedReason: specimen.archivedReason,
            createdAt: specimen.createdAt?.toISOString(),
            updatedAt: specimen.updatedAt?.toISOString()
        });
    } catch (err) {
        console.error("Failed to update specimen", err);
        return NextResponse.json({ error: "Failed to update specimen" }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ error: "Invalid specimen ID" }, { status: 400 });
    }

    await connectMongoose();

    // Check if specimen exists
    const specimen = await Specimen.findOne({ _id: id, userId: session.user.id });
    if (!specimen) {
        return NextResponse.json({ error: "Specimen not found" }, { status: 404 });
    }

    // Remove specimenId references from entries (but keep specimen name for history)
    await MoltEntry.updateMany(
        { specimenId: id, userId: session.user.id },
        { $unset: { specimenId: "" } }
    );
    await HealthEntry.updateMany(
        { specimenId: id, userId: session.user.id },
        { $unset: { specimenId: "" } }
    );
    await BreedingEntry.updateMany(
        { $or: [{ femaleSpecimenId: id }, { maleSpecimenId: id }], userId: session.user.id },
        { $unset: { femaleSpecimenId: "", maleSpecimenId: "" } }
    );

    await Specimen.deleteOne({ _id: id, userId: session.user.id });

    return NextResponse.json({ ok: true });
}
