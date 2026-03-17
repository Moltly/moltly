export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import Favorite from "../../../models/Favorite";
import {
  trySyncFavoriteToWSCA,
  tryRemoveFavoriteOnWSCA,
} from "../../../lib/wsca-collections-sync";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongoose();
  const favorites = await Favorite.find({ userId: session.user.id }).sort({ createdAt: -1 });

  return NextResponse.json(
    favorites.map((f) => ({
      id: f._id.toString(),
      species: f.species,
      lsid: f.lsid,
      family: f.family,
      author: f.author,
      rank: f.rank,
      createdAt: f.createdAt,
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
    const favorite = await Favorite.findOneAndUpdate(
      { userId: session.user.id, species },
      {
        $set: {
          lsid: data.lsid || undefined,
          family: data.family || undefined,
          author: data.author || undefined,
          rank: data.rank || "species",
        },
        $setOnInsert: {
          userId: session.user.id,
          species,
        },
      },
      { upsert: true, new: true }
    );

    trySyncFavoriteToWSCA(session.user.id, { species, lsid: data.lsid }).catch(() => undefined);

    return NextResponse.json(
      {
        id: favorite._id.toString(),
        species: favorite.species,
        lsid: favorite.lsid,
        family: favorite.family,
        author: favorite.author,
        rank: favorite.rank,
        createdAt: favorite.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[/api/favorites POST]", error);
    return NextResponse.json({ error: "Unable to add favorite." }, { status: 500 });
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

    const doc = await Favorite.findOneAndDelete(query);
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    tryRemoveFavoriteOnWSCA(session.user.id, {
      species: doc.species,
      lsid: doc.lsid,
    }).catch(() => undefined);

    return NextResponse.json({ status: "deleted" });
  } catch (error) {
    console.error("[/api/favorites DELETE]", error);
    return NextResponse.json({ error: "Unable to remove favorite." }, { status: 500 });
  }
}
