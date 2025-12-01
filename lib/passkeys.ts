import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import type { Types } from "mongoose";

const rpID = (() => {
  try {
    const url = new URL(process.env.NEXTAUTH_URL || "http://localhost:3000");
    return url.hostname;
  } catch {
    return "localhost";
  }
})();

const expectedOrigin = (() => {
  try {
    const url = new URL(process.env.NEXTAUTH_URL || "http://localhost:3000");
    return `${url.protocol}//${url.host}`;
  } catch {
    return "http://localhost:3000";
  }
})();

const rpName = process.env.NEXTAUTH_RP_NAME || "Moltly";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;

/**
 * Coerce a credential identifier (or similar binary blob) into a Buffer.
 * Handles plain base64url, base64, UTF-8 strings, and the accidental
 * double-encoding we previously stored (base64url of a base64url string).
 */
export function credentialIdToBuffer(value: string | ArrayBuffer | Uint8Array): Buffer {
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  const trimmed = (value ?? "").toString().trim();
  const attempts: Buffer[] = [];

  if (trimmed) {
    try {
      attempts.push(Buffer.from(trimmed, "base64url"));
    } catch {}
    try {
      attempts.push(Buffer.from(trimmed, "base64"));
    } catch {}
    try {
      attempts.push(Buffer.from(trimmed, "utf8"));
    } catch {}
  }

  let candidate = attempts.find((buf) => buf.length > 0) ?? Buffer.alloc(0);
  const maybeString = candidate.toString("utf8");
  if (maybeString && BASE64URL_PATTERN.test(maybeString)) {
    try {
      const nested = Buffer.from(maybeString, "base64url");
      if (nested.length > 0) {
        candidate = nested;
      }
    } catch {}
  }

  return candidate.length > 0 ? candidate : Buffer.from(trimmed, "utf8");
}

export function normalizeCredentialId(value: string | ArrayBuffer | Uint8Array): string | null {
  if (value === null || value === undefined) return null;
  try {
    const buf = credentialIdToBuffer(value);
    return buf.length ? buf.toString("base64url") : null;
  } catch {
    return null;
  }
}

export async function getPasskeyRegistrationOptions(user: { id: Types.ObjectId; username?: string | null; email?: string | null; passkeys?: { credentialId: string }[] }): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpID,
    rpName,
    userName: user.username || user.email || user.id.toString(),
    userID: Buffer.from(user.id.toString()),
    excludeCredentials: (user.passkeys || []).map((pk) => ({
      id: normalizeCredentialId(pk.credentialId) || pk.credentialId,
      type: "public-key",
    })),
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred"
    },
  });
}

export async function getPasskeyAuthenticationOptions(user: { passkeys?: { credentialId: string }[] }): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const hasPasskeys = Array.isArray(user.passkeys) && user.passkeys.length > 0;
  return generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    // Allow the platform to surface discoverable credentials (passkeys) without constraining transports.
    allowCredentials: hasPasskeys ? undefined : [],
  });
}

type StoredPasskey = {
  credentialId: string;
  publicKey: string;
  counter?: number;
  transports?: string[];
};

export async function verifyPasskeyRegistration(responseJSON: any, expectedChallenge: string) {
  const verification = await verifyRegistrationResponse({
    response: responseJSON,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Passkey verification failed.");
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const { id: credentialID, publicKey: credentialPublicKey, counter } = credential;
  const transports =
    Array.isArray(credential.transports) && credential.transports.length > 0
      ? credential.transports
      : undefined;

  const normalizedCredentialId = normalizeCredentialId(credentialID);
  if (!normalizedCredentialId) {
    throw new Error("Invalid credential identifier.");
  }

  return {
    credentialId: normalizedCredentialId,
    publicKey: credentialIdToBuffer(credentialPublicKey).toString("base64url"),
    counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    transports,
  };
}

export async function verifyPasskeyAuthentication(responseJSON: any, passkey: StoredPasskey, expectedChallenge: string) {
  const normalizedId = normalizeCredentialId(passkey.credentialId);
  if (!normalizedId) {
    throw new Error("Stored credential ID is invalid.");
  }
  const verification = await verifyAuthenticationResponse({
    response: responseJSON,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: normalizedId,
      publicKey: new Uint8Array(credentialIdToBuffer(passkey.publicKey)),
      counter: passkey.counter || 0,
      transports: Array.isArray(passkey.transports)
        ? (passkey.transports.filter((t) => typeof t === "string") as any)
        : undefined,
    },
  });

  if (!verification.verified || !verification.authenticationInfo) {
    throw new Error("Passkey verification failed.");
  }

  const { newCounter } = verification.authenticationInfo;
  return { newCounter };
}

export { rpID, expectedOrigin, rpName };
