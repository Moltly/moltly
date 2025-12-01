export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { connectMongoose } from "@/lib/mongoose";
import User from "@/models/User";
import { normalizeCredentialId, verifyPasskeyRegistration } from "@/lib/passkeys";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null) as { credential?: any; friendlyName?: string } | null;
    if (!body?.credential) {
      return NextResponse.json({ error: "Missing credential." }, { status: 400 });
    }

    await connectMongoose();
    const user = await User.findById(session.user.id).select("+passkeyChallenge +passkeyChallengeExpires");
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (!user.passkeyChallenge || (user.passkeyChallengeExpires && user.passkeyChallengeExpires.getTime() < Date.now())) {
      return NextResponse.json({ error: "Passkey challenge expired. Please try again." }, { status: 400 });
    }

    const result = await verifyPasskeyRegistration(body.credential, user.passkeyChallenge);

    const normalizedNewId = normalizeCredentialId(result.credentialId);
    const alreadyExists = Array.isArray(user.passkeys)
      ? user.passkeys.some((pk: { credentialId: string }) => {
          const normalizedExisting = normalizeCredentialId(pk.credentialId);
          return normalizedExisting && normalizedNewId && normalizedExisting === normalizedNewId;
        })
      : false;
    if (alreadyExists) {
      return NextResponse.json({ error: "Passkey already registered." }, { status: 409 });
    }

    user.passkeys = user.passkeys || [];
    const transports =
      (Array.isArray(result.transports) && result.transports.length > 0
        ? result.transports
        : Array.isArray(body.credential?.response?.transports)
          ? body.credential.response.transports
          : undefined);

    user.passkeys.push({
      credentialId: normalizedNewId || result.credentialId,
      publicKey: result.publicKey,
      counter: result.counter,
      transports,
      friendlyName: body.friendlyName?.toString().slice(0, 64) || undefined,
    });
    user.passkeyChallenge = undefined;
    user.passkeyChallengeExpires = undefined;
    await user.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Passkey registration verification failed", error);
    const message =
      error instanceof Error ? error.message : "Unable to verify passkey.";
    const status = message.toLowerCase().includes("verification")
      || message.toLowerCase().includes("origin")
      || message.toLowerCase().includes("challenge")
      || message.toLowerCase().includes("user")
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
