export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import getMongoClientPromise from "../../../lib/mongodb";
import { connectMongoose } from "../../../lib/mongoose";
import WishlistItem from "../../../models/WishlistItem";

const SYNC_SECRET = process.env.WSCA_SYNC_SECRET || "";

function checkAuth(request: Request): boolean {
  const provided = request.headers.get("X-Sync-Secret");
  return Boolean(SYNC_SECRET && provided && provided === SYNC_SECRET);
}

async function findUserIdByDiscord(discordId: string): Promise<string | null> {
  const client = await getMongoClientPromise();
  const db = client.db();
  const account = await db.collection("accounts").findOne({
    provider: "discord",
    providerAccountId: discordId,
  });
  if (!account?.userId) return null;
  return account.userId instanceof ObjectId
    ? account.userId.toHexString()
    : String(account.userId);
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await request.json();
    const discordUserId = String(data.discord_user_id || "").trim();
    const species = String(data.canonical || "").trim();
    if (!discordUserId || !species) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const userId = await findUserIdByDiscord(discordUserId);
    if (!userId) {
      return NextResponse.json({ error: "User not linked" }, { status: 404 });
    }

    await connectMongoose();
    await WishlistItem.findOneAndUpdate(
      { userId: new ObjectId(userId), species },
      {
        $set: {
          lsid: data.lsid || undefined,
          family: data.family || undefined,
          author: data.author || undefined,
          rank: data.rank || "species",
          notes: data.notes || undefined,
          externalSource: "wsca",
        },
        $setOnInsert: {
          userId: new ObjectId(userId),
          species,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("[sync/wishlists POST] error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await request.json();
    const discordUserId = String(data.discord_user_id || "").trim();
    const species = String(data.canonical || "").trim();
    const lsid = String(data.lsid || "").trim();
    if (!discordUserId || (!species && !lsid)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const userId = await findUserIdByDiscord(discordUserId);
    if (!userId) {
      return NextResponse.json({ error: "User not linked" }, { status: 404 });
    }

    await connectMongoose();
    const query: Record<string, any> = { userId: new ObjectId(userId) };
    if (species) {
      query.species = { $regex: new RegExp(`^${species.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
    } else if (lsid) {
      query.lsid = lsid;
    }

    const result = await WishlistItem.deleteOne(query);
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ status: "deleted" });
  } catch (error) {
    console.error("[sync/wishlists DELETE] error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
