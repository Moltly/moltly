import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";
import getMongoClientPromise from "./mongodb";
import { connectMongoose } from "./mongoose";
import User from "../models/User";

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          throw new Error("Missing email or password.");
        }
        await connectMongoose();
        const user = await User.findOne({ email: credentials.email.toLowerCase() })
          .select("+password")
          .lean<UserRecord | null>();
        if (!user?.password) {
          throw new Error("Invalid credentials.");
        }
        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          throw new Error("Invalid credentials.");
        }
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
