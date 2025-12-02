export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { connectMongoose } from "@/lib/mongoose";
import { getUsernamelessPasskeyAuthenticationOptions } from "@/lib/passkeys";
import PasskeyAuthSession from "@/models/PasskeyAuthSession";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function POST() {
  try {
    await connectMongoose();

    const options = await getUsernamelessPasskeyAuthenticationOptions();
    const sessionId = crypto.randomUUID();

    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

    await PasskeyAuthSession.create({
      sessionId,
      challenge: options.challenge,
      expiresAt,
    });

    return NextResponse.json({
      options,
      sessionId,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to start passkey sign-in." }, { status: 500 });
  }
}

