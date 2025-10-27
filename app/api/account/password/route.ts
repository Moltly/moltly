export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth-options";
import { connectMongoose } from "../../../../lib/mongoose";
import User from "../../../../models/User";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectMongoose();
    // Try by id first
    let user = await User.findById(session.user.id).select("+password email _id");
    let hasPassword = Boolean(user?.password);

    // If not found or missing password, try by email (handles adapter/user id mismatches)
    if (!hasPassword && !user && (session.user as any)?.email) {
      user = await User.findOne({ email: (session.user as any).email.toLowerCase() }).select("+password email _id");
      hasPassword = Boolean(user?.password);
    }

    return NextResponse.json({ hasPassword });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to determine password status." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null) as { currentPassword?: string; newPassword?: string } | null;
    const currentPassword = body?.currentPassword ?? "";
    const newPassword = body?.newPassword ?? "";

    if (!newPassword) {
      return NextResponse.json({ error: "New password is required." }, { status: 400 });
    }

    // Basic password rules: 8+ chars, at least one letter and one number
    if (typeof newPassword !== "string" || newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters and include letters and numbers." },
        { status: 400 }
      );
    }

    await connectMongoose();
    let user = await User.findById(session.user.id).select("+password email");
    if (!user && (session.user as any)?.email) {
      user = await User.findOne({ email: (session.user as any).email.toLowerCase() }).select("+password email");
    }
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Only allow change if the user has a local password (email/password accounts)
    if (!user.password) {
      return NextResponse.json({ error: "Password change is only available for email/password accounts." }, { status: 400 });
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    user.password = hashed;
    await user.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to change password." }, { status: 500 });
  }
}
