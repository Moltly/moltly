
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import connectDB from "@/lib/mongodb";
import UserModel from "@/models/User";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const pairingContactMethodSchema = z.enum(["email", "discord", "instagram", "facebook", "telegram", "other"]);

const pairingContactSchema = z.object({
    method: pairingContactMethodSchema,
    value: z.string().trim().min(1).max(160),
    notes: z.string().trim().max(300).optional(),
});

function normalizePairingContact(raw: unknown) {
    if (raw === undefined) return undefined;
    if (raw === null || typeof raw !== "object") {
        throw new Error("Invalid pairing contact");
    }

    const input = raw as Record<string, unknown>;
    const method = typeof input.method === "string" ? input.method.trim().toLowerCase() : "";
    const value = typeof input.value === "string" ? input.value.trim() : "";
    const notes = typeof input.notes === "string" ? input.notes.trim() : "";

    if (!method && !value && !notes) return null;

    const parsed = pairingContactSchema.safeParse({
        method,
        value,
        notes: notes || undefined,
    });

    if (!parsed.success) {
        throw new Error("Invalid pairing contact");
    }

    return parsed.data;
}

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const user = await UserModel.findById(session.user.id).select("preferences");

    return NextResponse.json(user?.preferences || {});
}

export async function PUT(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { actionButtons } = body;

    await connectDB();

    const update: Record<string, any> = {};
    const unset: Record<string, "" | 1> = {};
    if (actionButtons) {
        update["preferences.actionButtons"] = actionButtons;
    }

    try {
        const pairingContact = normalizePairingContact(body?.pairingContact);
        if (pairingContact === null) {
            unset["preferences.pairingContact"] = "";
        } else if (pairingContact !== undefined) {
            update["preferences.pairingContact"] = pairingContact;
        }
    } catch {
        return NextResponse.json({ error: "Invalid pairing contact" }, { status: 400 });
    }

    if (Object.keys(update).length === 0 && Object.keys(unset).length === 0) {
        return NextResponse.json({ message: "No changes" });
    }

    const user = await UserModel.findByIdAndUpdate(
        session.user.id,
        {
            ...(Object.keys(update).length > 0 ? { $set: update } : {}),
            ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
        },
        { returnDocument: 'after', runValidators: true }
    ).select("preferences");

    return NextResponse.json(user?.preferences || {});
}
