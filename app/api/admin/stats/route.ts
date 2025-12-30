export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { connectMongoose } from "@/lib/mongoose";
import UserModel from "@/models/User";

export async function GET() {
    const { ok } = await requireAdminSession();
    if (!ok) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await connectMongoose();

    const totalUsers = await UserModel.countDocuments();

    // Get users registered in the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const newUsersLast7Days = await UserModel.countDocuments({
        createdAt: { $gte: sevenDaysAgo }
    });

    // Get users registered in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsersLast30Days = await UserModel.countDocuments({
        createdAt: { $gte: thirtyDaysAgo }
    });

    return NextResponse.json({
        totalUsers,
        newUsersLast7Days,
        newUsersLast30Days,
    });
}
