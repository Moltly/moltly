import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";
import AppleProvider from "next-auth/providers/apple";
import GoogleProvider from "next-auth/providers/google";
import getMongoClientPromise from "./mongodb";
import fs from "node:fs";
import path from "node:path";
import { SignJWT, importPKCS8 } from "jose";
import { connectMongoose } from "./mongoose";
import User from "../models/User";
import { clearLoginAttempts, evaluateLoginRateLimit, recordFailedLoginAttempt } from "./login-rate-limit";
import { normalizeCredentialId, verifyPasskeyAuthentication } from "./passkeys";
import PasskeyAuthSession from "@/models/PasskeyAuthSession";

type UserRecord = {
  _id: Types.ObjectId;
  email?: string;
  username?: string | null;
  password?: string;
  name?: string | null;
  image?: string | null;
};

const hasMongo = Boolean(process.env.MONGODB_URI);
const adapter = hasMongo ? MongoDBAdapter(getMongoClientPromise()) : undefined;

async function generateAppleClientSecretFromEnv(): Promise<string | undefined> {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const clientId = process.env.APPLE_CLIENT_ID;
  let privateKey = process.env.APPLE_PRIVATE_KEY;
  const privateKeyPath = process.env.APPLE_PRIVATE_KEY_PATH;

  if (!teamId || !keyId || !clientId) return undefined;
  if (!privateKey && privateKeyPath) {
    try {
      privateKey = fs.readFileSync(path.resolve(privateKeyPath), "utf8");
    } catch {
      return undefined;
    }
  }
  if (!privateKey) return undefined;

  const alg = "ES256" as const;
  const normalizedKey = privateKey.includes("-----BEGIN") ? privateKey : privateKey.replace(/\\n/g, "\n");
  try {
    const pk = await importPKCS8(normalizedKey, alg);
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60 * 24 * 180 - 60; // ~6 months
    const token = await new SignJWT({})
      .setProtectedHeader({ alg, kid: keyId })
      .setIssuer(teamId)
      .setAudience("https://appleid.apple.com")
      .setSubject(clientId)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(pk);
    return token;
  } catch {
    return undefined;
  }
}

let resolvedAppleSecret: string | undefined = process.env.APPLE_CLIENT_SECRET;
if (!resolvedAppleSecret) {
  try {
    const maybe = await generateAppleClientSecretFromEnv();
    if (maybe) resolvedAppleSecret = maybe;
  } catch {}
}

export const authOptions: NextAuthOptions = {
  adapter,
  session: {
    // Credentials-based auth relies on JWT sessions; database sessions would drop users back to the login page.
    strategy: "jwt"
  },
  providers: [
    ...(process.env.APPLE_CLIENT_ID && (process.env.APPLE_CLIENT_SECRET || resolvedAppleSecret)
      ? [
          AppleProvider({
            clientId: process.env.APPLE_CLIENT_ID,
            clientSecret: (process.env.APPLE_CLIENT_SECRET || resolvedAppleSecret) as string,
            authorization: { params: { scope: "name email", response_mode: "form_post" } },
          }),
        ]
      : []),
    // Discord OAuth
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
      authorization: { params: { scope: "identify email" } }
    }),
    // Google OAuth
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    // Username or email + password credentials
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: { label: "Username or email", type: "text" },
        password: { label: "Password", type: "password" },
        passkeyResponse: { label: "Passkey response", type: "text" },
        passkeySessionId: { label: "Passkey session ID", type: "text" }
      },
      async authorize(credentials, req) {
        const rawIdentifier = credentials?.identifier ?? "";
        const identifier = rawIdentifier.trim().toLowerCase();
        const passkeyResponseJson = credentials?.passkeyResponse;
        const passkeyResponse = passkeyResponseJson ? JSON.parse(passkeyResponseJson) : null;
        const passkeySessionId = credentials?.passkeySessionId?.toString().trim() || null;

        const rateLimitKey = buildRateLimitKey(identifier || "passkey", req);
        const rateLimitState = evaluateLoginRateLimit(rateLimitKey);

        if (!rateLimitState.allowed) {
          throw new Error(rateLimitState.message);
        }

        if (passkeyResponse) {
          await connectMongoose();

          const responseId =
            typeof (passkeyResponse as any).rawId === "string"
              ? (passkeyResponse as any).rawId
              : passkeyResponse.id;
          const normalizedResponseId = normalizeCredentialId(responseId);
          const normalizedAlternateId = normalizeCredentialId(passkeyResponse.id);

          if (identifier) {
            const user = await User.findOne({
              $or: [{ email: identifier }, { username: identifier }]
            }).select("+passkeyChallenge +passkeyChallengeExpires passkeys username email name image");
            if (!user || !user.passkeys?.length) {
              throw new Error("Passkey login is not available for this account.");
            }
            if (!user.passkeyChallenge || (user.passkeyChallengeExpires && user.passkeyChallengeExpires.getTime() < Date.now())) {
              throw new Error("Passkey challenge expired. Please try again.");
            }

            const match = Array.isArray(user.passkeys)
              ? user.passkeys.find((pk: { credentialId: string }) => {
                  return (
                    credentialIdsEqual(pk.credentialId, responseId) ||
                    credentialIdsEqual(pk.credentialId, passkeyResponse.id) ||
                    credentialIdsEqual(pk.credentialId, passkeyResponse.rawId)
                  );
                })
              : undefined;
            if (!match) {
              try {
                  console.warn("[Passkey auth] No match", {
                    user: user._id?.toString?.(),
                    identifier,
                    responseId,
                    stored: (user.passkeys || []).map((p: any) => p.credentialId),
                    normalizedResponseId,
                    normalizedAltId: normalizedAlternateId,
                    normalizedStored: (user.passkeys || []).map((p: any) => normalizeCredentialId(p.credentialId)),
                  });
              } catch {}
              throw new Error("Passkey not recognized.");
            }
            const normalizedStoredId = normalizeCredentialId(match.credentialId);
            if (normalizedStoredId && normalizedStoredId !== match.credentialId) {
              match.credentialId = normalizedStoredId;
            }
            const { newCounter } = await verifyPasskeyAuthentication(passkeyResponse, match, user.passkeyChallenge);
            match.counter = newCounter;
            user.passkeyChallenge = undefined;
            user.passkeyChallengeExpires = undefined;
            await user.save();

            clearLoginAttempts(rateLimitKey);
            return {
              id: user._id.toString(),
              email: user.email ?? null,
              username: user.username ?? undefined,
              name: user.name ?? user.username ?? user.email ?? null,
              image: user.image ?? null
            };
          }

          if (!passkeySessionId) {
            throw new Error("Missing passkey session. Please try again.");
          }

          const session = await PasskeyAuthSession.findOne({ sessionId: passkeySessionId });
          if (!session) {
            throw new Error("Passkey session not found or expired. Please try again.");
          }
          if (session.expiresAt.getTime() < Date.now()) {
            await session.deleteOne().catch(() => {});
            throw new Error("Passkey session expired. Please try again.");
          }

          const candidateIds: string[] = [];
          if (typeof responseId === "string" && responseId) candidateIds.push(responseId);
          if (typeof passkeyResponse.id === "string" && passkeyResponse.id) candidateIds.push(passkeyResponse.id);
          if (typeof passkeyResponse.rawId === "string" && passkeyResponse.rawId) candidateIds.push(passkeyResponse.rawId);
          if (normalizedResponseId && !candidateIds.includes(normalizedResponseId)) {
            candidateIds.push(normalizedResponseId);
          }
          if (normalizedAlternateId && !candidateIds.includes(normalizedAlternateId)) {
            candidateIds.push(normalizedAlternateId);
          }

          const user = await User.findOne({
            "passkeys.credentialId": { $in: candidateIds }
          }).select("passkeys username email name image");
          if (!user || !user.passkeys?.length) {
            try {
              console.warn("[Passkey auth] No user for credential", {
                responseId,
                candidateIds,
                normalizedResponseId,
                normalizedAltId: normalizedAlternateId,
              });
            } catch {}
            throw new Error("Passkey not recognized.");
          }

          const match = Array.isArray(user.passkeys)
            ? user.passkeys.find((pk: { credentialId: string }) => {
                return (
                  credentialIdsEqual(pk.credentialId, responseId) ||
                  credentialIdsEqual(pk.credentialId, passkeyResponse.id) ||
                  credentialIdsEqual(pk.credentialId, passkeyResponse.rawId)
                );
              })
            : undefined;
          if (!match) {
            try {
              console.warn("[Passkey auth] No matching credential on user", {
                user: user._id?.toString?.(),
                responseId,
                candidateIds,
                normalizedResponseId,
                normalizedAltId: normalizedAlternateId,
                stored: (user.passkeys || []).map((p: any) => p.credentialId),
                normalizedStored: (user.passkeys || []).map((p: any) => normalizeCredentialId(p.credentialId)),
              });
            } catch {}
            throw new Error("Passkey not recognized.");
          }

          const normalizedStoredId = normalizeCredentialId(match.credentialId);
          if (normalizedStoredId && normalizedStoredId !== match.credentialId) {
            match.credentialId = normalizedStoredId;
          }

          const { newCounter } = await verifyPasskeyAuthentication(passkeyResponse, match, session.challenge);
          match.counter = newCounter;
          await user.save();
          await session.deleteOne().catch(() => {});

          clearLoginAttempts(rateLimitKey);
          return {
            id: user._id.toString(),
            email: user.email ?? null,
            username: user.username ?? undefined,
            name: user.name ?? user.username ?? user.email ?? null,
            image: user.image ?? null
          };
        } else {
          if (!identifier) {
            throw new Error("Missing username or email.");
          }

          const password = credentials?.password;
          if (!password) {
            throw new Error("Missing password.");
          }

          const user = await User.findOne({
            $or: [{ email: identifier }, { username: identifier }]
          })
            .select("+password")
            .lean<UserRecord | null>();
          if (!user?.password) {
            recordFailedLoginAttempt(rateLimitKey);
            throw new Error("Invalid credentials.");
          }
          const isValid = await bcrypt.compare(password, user.password);
          if (!isValid) {
            recordFailedLoginAttempt(rateLimitKey);
            throw new Error("Invalid credentials.");
          }
          clearLoginAttempts(rateLimitKey);
          return {
            id: user._id.toString(),
            email: user.email ?? null,
            username: user.username ?? undefined,
            name: user.name ?? user.username ?? user.email ?? null,
            image: user.image ?? null
          };
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        if ((user as any).username) token.username = (user as any).username;
        if (user.email !== undefined) token.email = user.email;
        if (user.name) token.name = user.name;
      }
      return token;
    },
    async session({ session, user, token }) {
      if (session.user) {
        if (user?.id) {
          session.user.id = user.id;
        } else if (token?.sub) {
          session.user.id = token.sub;
        }
        const username = (user as any)?.username ?? (token as any)?.username;
        if (username) {
          (session.user as any).username = username;
          if (!session.user.name || session.user.name === session.user.email) {
            session.user.name = username;
          }
        }
      }
      return session;
    }
  },
  pages: {
    signIn: "/login"
  },
  cookies: (() => {
    const isSecure = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
    return {
      pkceCodeVerifier: {
        name: isSecure ? "__Secure-next-auth.pkce.code_verifier" : "next-auth.pkce.code_verifier",
        options: {
          httpOnly: true,
          sameSite: isSecure ? "none" : "lax",
          path: "/",
          secure: isSecure,
        },
      },
      state: {
        name: isSecure ? "__Secure-next-auth.state" : "next-auth.state",
        options: {
          httpOnly: true,
          sameSite: isSecure ? "none" : "lax",
          path: "/",
          secure: isSecure,
        },
      },
      nonce: {
        name: isSecure ? "__Secure-next-auth.nonce" : "next-auth.nonce",
        options: {
          httpOnly: true,
          sameSite: isSecure ? "none" : "lax",
          path: "/",
          secure: isSecure,
        },
      },
    } as const;
  })(),
  events: {
    async signIn({ user, account }) {
      try {
        if (!account || !["discord", "apple", "google"].includes(account.provider)) {
          return;
        }
        if (!user.email) {
          console.warn(`${account.provider} sign-in missing email; skipping user upsert.`);
          return;
        }

        await connectMongoose();
        await User.findOneAndUpdate(
          { email: user.email.toLowerCase() },
          { $setOnInsert: { name: user.name, image: user.image } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (error) {
        console.error("NextAuth signIn event error:", error);
      }
    }
  },
  debug: process.env.NEXTAUTH_DEBUG === "true",
  secret: process.env.NEXTAUTH_SECRET
};

type HeadersLike = Headers | Record<string, string | string[] | undefined> | undefined;

function readHeader(headers: HeadersLike, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  const lowerName = name.toLowerCase();
  const direct = headers[name] ?? headers[lowerName];
  if (Array.isArray(direct)) {
    return direct[0];
  }
  return direct;
}

function buildRateLimitKey(identifier: string, req?: { headers?: HeadersLike }): string {
  const normalizedIdentifier = identifier.trim().toLowerCase() || "unknown";
  const headers = req?.headers;
  const forwarded = readHeader(headers, "x-forwarded-for");
  const realIp = readHeader(headers, "x-real-ip");
  const ipCandidate = forwarded?.split(",")[0]?.trim() || realIp?.trim() || "unknown";

  return `${normalizedIdentifier}|${ipCandidate}`;
}

function credentialIdsEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const normA = normalizeCredentialId(a);
  const normB = normalizeCredentialId(b);
  if (normA && normB && normA === normB) return true;
  if (normA && normB) {
    try {
      return Buffer.from(normA, "base64url").equals(Buffer.from(normB, "base64url"));
    } catch {}
  }
  return false;
}
