export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import WishlistItem from "../../../models/WishlistItem";
import {
  trySyncWishlistToWSCA,
  tryRemoveWishlistOnWSCA,
} from "../../../lib/wsca-collections-sync";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongoose();
  const items = await WishlistItem.find({ userId: session.user.id }).sort({ createdAt: -1 });

  return NextResponse.json(
    items.map((w) => ({
      id: w._id.toString(),
      species: w.species,
      lsid: w.lsid,
      family: w.family,
      author: w.author,
      rank: w.rank,
      notes: w.notes,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    }))
  );
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await request.json();
    const species = String(data.species || "").trim();
    if (!species) {
      return NextResponse.json({ error: "species is required" }, { status: 400 });
    }

    await connectMongoose();
    const item = await WishlistItem.findOneAndUpdate(
      { userId: session.user.id, species },
      {
        $set: {
          lsid: data.lsid || undefined,
          family: data.family || undefined,
          author: data.author || undefined,
          rank: data.rank || "species",
          notes: data.notes || undefined,
        },
        $setOnInsert: {
          userId: session.user.id,
          species,
        },
      },
      { upsert: true, new: true }
    );

    trySyncWishlistToWSCA(session.user.id, {
      species,
      lsid: data.lsid,
      notes: data.notes,
    }).catch(() => undefined);

    return NextResponse.json(
      {
        id: item._id.toString(),
        species: item.species,
        lsid: item.lsid,
        family: item.family,
        author: item.author,
        rank: item.rank,
        notes: item.notes,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[/api/wishlists POST]", error);
    return NextResponse.json({ error: "Unable to add to wishlist." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await request.json();
    const species = String(data.species || "").trim();
    const lsid = String(data.lsid || "").trim();
    if (!species && !lsid) {
      return NextResponse.json({ error: "species or lsid is required" }, { status: 400 });
    }

    await connectMongoose();
    const query: Record<string, any> = { userId: session.user.id };
    if (species) {
      query.species = { $regex: new RegExp(`^${species.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
    } else {
      query.lsid = lsid;
    }

    const doc = await WishlistItem.findOneAndDelete(query);
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    tryRemoveWishlistOnWSCA(session.user.id, {
      species: doc.species,
      lsid: doc.lsid,
    }).catch(() => undefined);

    return NextResponse.json({ status: "deleted" });
  } catch (error) {
    console.error("[/api/wishlists DELETE]", error);
    return NextResponse.json({ error: "Unable to remove from wishlist." }, { status: 500 });
  }
}
