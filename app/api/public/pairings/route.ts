export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { filterPublicPairingListings, getPublicPairingListings } from "@/lib/pairing-listings";
import type { PairingStatus, SpecimenSex } from "@/types/molt";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

const allowedStatuses = new Set<PairingStatus>(["none", "seeking_male", "seeking_female", "open_to_offers"]);
const allowedSexes = new Set<SpecimenSex>(["Male", "Female", "Unknown", "Unsexed"]);

const parsePositiveInt = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseNonNegativeInt = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const origin = url.origin;
    const rawStatus = url.searchParams.get("status");
    const rawSex = url.searchParams.get("sex");
    const status = rawStatus && allowedStatuses.has(rawStatus as PairingStatus) ? (rawStatus as PairingStatus) : undefined;
    const sex = rawSex && allowedSexes.has(rawSex as SpecimenSex) ? (rawSex as SpecimenSex) : undefined;
    const species = url.searchParams.get("species")?.trim() || undefined;
    const ownerId = url.searchParams.get("ownerId")?.trim() || undefined;
    const search = url.searchParams.get("search")?.trim() || undefined;
    const limit = Math.min(parsePositiveInt(url.searchParams.get("limit"), 50), 100);
    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const explicitOffset = url.searchParams.get("offset");
    const offset = explicitOffset !== null ? parseNonNegativeInt(explicitOffset, 0) : (page - 1) * limit;

    const listings = await getPublicPairingListings(origin);
    const filteredListings = filterPublicPairingListings(listings, {
      species,
      status,
      sex,
      ownerId,
      search,
    });
    const paginatedListings = filteredListings.slice(offset, offset + limit);

    return NextResponse.json(
      {
        data: paginatedListings,
        meta: {
          count: paginatedListings.length,
          total: filteredListings.length,
          limit,
          offset,
          page: explicitOffset !== null ? undefined : page,
          hasMore: offset + paginatedListings.length < filteredListings.length,
          generatedAt: new Date().toISOString(),
          readOnly: true,
          includesImages: true,
          filters: {
            species,
            status,
            sex,
            ownerId,
            search,
          },
        },
      },
      {
        headers: corsHeaders,
      }
    );
  } catch (error) {
    console.error("Failed to load public pairing listings", error);
    return NextResponse.json({ error: "Failed to load public pairing listings" }, { status: 500, headers: corsHeaders });
  }
}
