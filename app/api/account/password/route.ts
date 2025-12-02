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
    let user = await User.findById(session.user.id).select("+password email _id username passkeys");
    let hasPassword = Boolean(user?.password);
    let hasUsername = Boolean(user?.username);
    let passkeyCount = Array.isArray(user?.passkeys) ? user.passkeys.length : 0;

    // If not found or missing password, try by email (handles adapter/user id mismatches)
    if (!hasPassword && !user && (session.user as any)?.email) {
      user = await User.findOne({ email: (session.user as any).email.toLowerCase() }).select("+password email _id username passkeys");
      hasPassword = Boolean(user?.password);
      hasUsername = Boolean(user?.username);
      passkeyCount = Array.isArray(user?.passkeys) ? user.passkeys.length : passkeyCount;
    }

    return NextResponse.json({ hasPassword, hasUsername, passkeyCount });
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
    const body = await req.json().catch(() => null) as { currentPassword?: string; newPassword?: string; username?: string } | null;
    const currentPassword = body?.currentPassword ?? "";
    const newPassword = body?.newPassword ?? "";
    const incomingUsername = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";

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
    let user = await User.findById(session.user.id).select("+password email username");
    if (!user && (session.user as any)?.email) {
      user = await User.findOne({ email: (session.user as any).email.toLowerCase() }).select("+password email username");
    }
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const hasExistingPassword = Boolean(user.password);
    const hasUsername = Boolean(user.username);

    if (!hasExistingPassword) {
      const usernameToSet = hasUsername ? user.username : incomingUsername;
      if (!usernameToSet) {
        return NextResponse.json({ error: "Username is required to add a password login." }, { status: 400 });
      }
      if (!/^[a-z0-9]{2,32}$/.test(usernameToSet)) {
        return NextResponse.json(
          { error: "Username must be 2-32 characters and use letters or numbers only." },
          { status: 400 }
        );
      }
      const usernameOwner = await User.findOne({ username: usernameToSet.toLowerCase() });
      if (usernameOwner && !usernameOwner._id.equals(user._id)) {
        return NextResponse.json({ error: "Username is already taken." }, { status: 409 });
      }
      user.username = usernameToSet.toLowerCase();
    }

    if (hasExistingPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Current password is required." }, { status: 400 });
      }
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
      }
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    user.password = hashed;
    await user.save();

    return NextResponse.json({ success: true, hasPassword: true, mode: hasExistingPassword ? "updated" : "created" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to change password." }, { status: 500 });
  }
}
