export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectMongoose } from "@/lib/mongoose";
import User from "@/models/User";
import { getPasskeyAuthenticationOptions } from "@/lib/passkeys";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { identifier?: string } | null;
    const identifier = body?.identifier?.trim().toLowerCase();
    if (!identifier) {
      return NextResponse.json({ error: "Username or email is required." }, { status: 400 });
    }

    await connectMongoose();
    const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] }).select("+passkeyChallenge +passkeyChallengeExpires");
    if (!user || !user.passkeys?.length) {
      return NextResponse.json({ error: "Passkey not found for this user." }, { status: 404 });
    }

    const options = await getPasskeyAuthenticationOptions(user);
    user.passkeyChallenge = options.challenge;
    user.passkeyChallengeExpires = new Date(Date.now() + CHALLENGE_TTL_MS);
    await user.save();

    return NextResponse.json(options);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to start passkey sign-in." }, { status: 500 });
  }
}
