export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import MoltEntry from "../../../models/MoltEntry";
import ResearchStack from "../../../models/ResearchStack";
import User from "../../../models/User";

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    await connectMongoose();

    await Promise.all([
      MoltEntry.deleteMany({ userId }),
      ResearchStack.deleteMany({ userId })
    ]);

    if (authOptions.adapter?.deleteUser) {
      await authOptions.adapter.deleteUser(userId);
    }

    await User.deleteOne({ _id: userId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to delete account." }, { status: 500 });
  }
}
