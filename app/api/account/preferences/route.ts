
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import connectDB from "@/lib/mongodb";
import UserModel from "@/models/User";
import { type NextRequest, NextResponse } from "next/server";

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

    // We can add validation here if needed, but for now we'll trust the partial update
    const update: Record<string, any> = {};
    if (actionButtons) {
        update["preferences.actionButtons"] = actionButtons;
    }

    if (Object.keys(update).length === 0) {
        return NextResponse.json({ message: "No changes" });
    }

    const user = await UserModel.findByIdAndUpdate(
        session.user.id,
        { $set: update },
        { new: true, runValidators: true }
    ).select("preferences");

    return NextResponse.json(user?.preferences || {});
}
