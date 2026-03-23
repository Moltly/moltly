export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getPublicPairingListings } from "@/lib/pairing-listings";

export async function GET(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    const listings = await getPublicPairingListings(origin);
    return NextResponse.json(listings);
  } catch (error) {
    console.error("Failed to load pairing listings", error);
    return NextResponse.json({ error: "Failed to load pairing listings" }, { status: 500 });
  }
}
