import { requireAdminSession } from "@/lib/admin";
import { connectMongoose } from "@/lib/mongoose";
import UserModel from "@/models/User";
import Link from "next/link";
import { ArrowLeft, Users, UserPlus, TrendingUp, FileText } from "lucide-react";

export default async function AdminDashboard() {
    const { ok } = await requireAdminSession();
    if (!ok) {
        return (
            <div className="max-w-3xl mx-auto p-4">
                <h1 className="text-xl font-semibold mb-2">Unauthorized</h1>
                <p className="text-[rgb(var(--text-soft))]">You do not have access to this page.</p>
            </div>
        );
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

    return (
        <div className="max-w-3xl mx-auto p-4">
            <div className="flex items-center gap-3 mb-6">
                <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius)] border border-[rgb(var(--border))] text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-hover))] transition-colors"
                >
                    <ArrowLeft size={16} />
                    Back to Moltly
                </Link>
            </div>

            <h1 className="text-2xl font-semibold mb-6">Admin Dashboard</h1>

            {/* User Stats Section */}
            <section className="mb-8">
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <Users size={20} />
                    User Statistics
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
                        <div className="flex items-center gap-2 text-[rgb(var(--text-soft))] text-sm mb-1">
                            <Users size={16} />
                            Total Users
                        </div>
                        <div className="text-3xl font-bold text-[rgb(var(--text))]">
                            {totalUsers.toLocaleString()}
                        </div>
                    </div>
                    <div className="p-4 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
                        <div className="flex items-center gap-2 text-[rgb(var(--text-soft))] text-sm mb-1">
                            <UserPlus size={16} />
                            New (7 days)
                        </div>
                        <div className="text-3xl font-bold text-[rgb(var(--success))]">
                            +{newUsersLast7Days.toLocaleString()}
                        </div>
                    </div>
                    <div className="p-4 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
                        <div className="flex items-center gap-2 text-[rgb(var(--text-soft))] text-sm mb-1">
                            <TrendingUp size={16} />
                            New (30 days)
                        </div>
                        <div className="text-3xl font-bold text-[rgb(var(--primary))]">
                            +{newUsersLast30Days.toLocaleString()}
                        </div>
                    </div>
                </div>
            </section>

            {/* Quick Links Section */}
            <section>
                <h2 className="text-lg font-medium mb-4">Admin Actions</h2>
                <div className="flex flex-wrap gap-3">
                    <Link
                        href="/admin/species-suggestions"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:bg-[rgb(var(--surface-hover))] transition-colors"
                    >
                        <FileText size={18} />
                        Species Suggestions
                    </Link>
                </div>
            </section>
        </div>
    );
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
