export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { connectMongoose } from "@/lib/mongoose";
import User from "@/models/User";
import { getPasskeyRegistrationOptions } from "@/lib/passkeys";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectMongoose();
    const user = await User.findById(session.user.id).select("+passkeyChallenge +passkeyChallengeExpires");
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const options = await getPasskeyRegistrationOptions(user);
    user.passkeyChallenge = options.challenge;
    user.passkeyChallengeExpires = new Date(Date.now() + CHALLENGE_TTL_MS);
    await user.save();

    return NextResponse.json(options);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to start passkey registration." }, { status: 500 });
  }
}
