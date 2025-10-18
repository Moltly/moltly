import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";
import getMongoClientPromise from "./mongodb";
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

export const authOptions: NextAuthOptions = {
  adapter,
  session: {
    // Credentials-based auth relies on JWT sessions; database sessions would drop users back to the login page.
    strategy: "jwt"
  },
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? ""
    }),
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
  events: {
    async signIn({ user, account }) {
      if (!account || account.provider !== "discord") {
        return;
      }
      await connectMongoose();
      await User.findOneAndUpdate(
        { email: user.email?.toLowerCase() },
        { $setOnInsert: { name: user.name, image: user.image } },
        { upsert: true, new: true }
      );
    }
  },
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
