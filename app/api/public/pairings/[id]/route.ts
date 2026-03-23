export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getPublicPairingListings } from "@/lib/pairing-listings";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const origin = new URL(request.url).origin;
    const { id } = await params;
    const listings = await getPublicPairingListings(origin);
    const listing = listings.find((entry) => entry.specimenId === id);

    if (!listing) {
      return NextResponse.json({ error: "Pairing listing not found" }, { status: 404, headers: corsHeaders });
    }

    return NextResponse.json(listing, { headers: corsHeaders });
  } catch (error) {
    console.error("Failed to load public pairing listing", error);
    return NextResponse.json({ error: "Failed to load public pairing listing" }, { status: 500, headers: corsHeaders });
  }
}
