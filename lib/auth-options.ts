import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";
import AppleProvider from "next-auth/providers/apple";
import getMongoClientPromise from "./mongodb";
import fs from "node:fs";
import path from "node:path";
import { SignJWT, importPKCS8 } from "jose";
import { connectMongoose } from "./mongoose";
import User from "../models/User";
import { clearLoginAttempts, evaluateLoginRateLimit, recordFailedLoginAttempt } from "./login-rate-limit";

type UserRecord = {
  _id: Types.ObjectId;
  email: string;
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
    // Email/password credentials
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials.password) {
          throw new Error("Missing email or password.");
        }

        const rateLimitKey = buildRateLimitKey(credentials.email, req);
        const rateLimitState = evaluateLoginRateLimit(rateLimitKey);

        if (!rateLimitState.allowed) {
          throw new Error(rateLimitState.message);
        }

        await connectMongoose();
        const user = await User.findOne({ email: credentials.email.toLowerCase() })
          .select("+password")
          .lean<UserRecord | null>();
        if (!user?.password) {
          recordFailedLoginAttempt(rateLimitKey);
          throw new Error("Invalid credentials.");
        }
        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          recordFailedLoginAttempt(rateLimitKey);
          throw new Error("Invalid credentials.");
        }
        clearLoginAttempts(rateLimitKey);
        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name ?? user.email,
          image: user.image ?? null
        };
      }
    })
  ],
  callbacks: {
    async session({ session, user, token }) {
      if (session.user) {
        if (user?.id) {
          session.user.id = user.id;
        } else if (token?.sub) {
          session.user.id = token.sub;
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
        if (!account || !["discord", "apple"].includes(account.provider)) {
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

function buildRateLimitKey(email: string, req?: { headers?: HeadersLike }): string {
  const normalizedEmail = email.trim().toLowerCase() || "unknown";
  const headers = req?.headers;
  const forwarded = readHeader(headers, "x-forwarded-for");
  const realIp = readHeader(headers, "x-real-ip");
  const ipCandidate = forwarded?.split(",")[0]?.trim() || realIp?.trim() || "unknown";

  return `${normalizedEmail}|${ipCandidate}`;
}
