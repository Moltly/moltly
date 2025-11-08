export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import { authOptions } from "@/lib/auth-options";
import getMongoClientPromise from "@/lib/mongodb";
import { connectMongoose } from "@/lib/mongoose";
import MoltEntry from "@/models/MoltEntry";

const WSC_API_KEY = process.env.WSC_API_KEY?.trim();
const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const NEGATIVE_CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

type CacheEntry<T> = { data: T; expires: number };

const wscCache = new Map<string, CacheEntry<any>>();

function getCached<T>(store: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = store.get(key);
  if (entry && entry.expires > Date.now()) {
    return entry.data;
  }
  if (entry) store.delete(key);
  return null;
}

function setCached<T>(store: Map<string, CacheEntry<T>>, key: string, data: T, ttlMs: number = DEFAULT_CACHE_TTL_MS) {
  store.set(key, { data, expires: Date.now() + ttlMs });
}

async function fetchJson(url: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<any | null> {
  const { timeoutMs = 8000, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWscTaxon(lsid?: string | null) {
  if (!lsid || !WSC_API_KEY) return null;
  const cached = getCached(wscCache, lsid);
  if (cached !== null) return cached;
  const url = `https://wsc.nmbe.ch/api/lsid/${encodeURIComponent(lsid)}?apiKey=${encodeURIComponent(WSC_API_KEY)}`;
  const data = await fetchJson(url);
  const taxon = data?.taxon ?? data?.validTaxon ?? null;
  if (taxon) {
    setCached(wscCache, lsid, taxon);
    return taxon;
  }
  setCached(wscCache, lsid, null, NEGATIVE_CACHE_TTL_MS);
  return null;
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildWscLinks(fullName: string, opts?: { lsid?: string | null; speciesId?: string | number | null }) {
  const q = (fullName || "").trim();
  // Prefer direct species page using the WSC speciesId column from our catalog
  let speciesUrl: string | undefined = undefined;
  const speciesIdRaw = opts?.speciesId;
  if (speciesIdRaw !== undefined && speciesIdRaw !== null && String(speciesIdRaw).trim().length > 0) {
    const idNum = Number.parseInt(String(speciesIdRaw), 10);
    if (Number.isFinite(idNum) && idNum > 0) {
      speciesUrl = `https://wsc.nmbe.ch/species/${idNum}`;
    }
  }
  // Fallback: derive from LSID (not always identical to page id; use only if no speciesId)
  if (!speciesUrl && opts?.lsid) {
    const m = String(opts.lsid).match(/spidersp:(\d+)/);
    if (m && m[1]) {
      speciesUrl = `https://wsc.nmbe.ch/species/${parseInt(m[1], 10)}`;
    }
  }
  // Fallback to a generic search page for the name
  const searchUrl = `https://wsc.nmbe.ch/search?q=${encodeURIComponent(q)}`;
  const lsidUrl = opts?.lsid ? `https://lsid.tdwg.org/lsid/${encodeURIComponent(opts.lsid)}` : undefined;
  return { speciesUrl, searchUrl, lsidUrl };
}

// No GBIF or iNaturalist API calls; we rely on WSC only now.

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = (searchParams.get("name") || "").trim();
    if (!raw) {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    const client = await getMongoClientPromise();
    const db = client.db();
    const speciesCol = db.collection("species");

    const fullNameLC = raw.toLowerCase();
    let doc = await speciesCol.findOne({ fullNameLC });

    if (!doc) {
      // Try case-insensitive exact match on genus/species/subspecies
      const tokens = raw.split(/\s+/).filter(Boolean);
      const [genus, species, ...rest] = tokens;
      if (genus && species) {
        const subspecies = rest.length > 0 ? rest.join(" ") : undefined;
        const query: Record<string, any> = {
          genus: { $regex: new RegExp(`^${escapeRegExp(genus)}$`, "i") },
          species: { $regex: new RegExp(`^${escapeRegExp(species)}$`, "i") },
        };
        if (subspecies) {
          query.subspecies = { $regex: new RegExp(`^${escapeRegExp(subspecies)}$`, "i") };
        }
        doc = await speciesCol.findOne(query);
      }
    }

    if (!doc) {
      return NextResponse.json({ error: "Species not found" }, { status: 404 });
    }

    const base = {
      fullName: (doc as any).fullName as string,
      genus: (doc as any).genus as string | undefined,
      species: (doc as any).species as string | undefined,
      subspecies: (doc as any).subspecies as string | undefined,
      family: (doc as any).family as string | undefined,
      author: (doc as any).author as string | undefined,
      year: (doc as any).year as string | number | undefined,
      parentheses: (doc as any).parentheses as string | number | undefined,
      distribution: (doc as any).distribution as string | undefined,
      speciesId: (doc as any).speciesId as number | string | undefined,
      species_lsid: (doc as any).species_lsid as string | undefined,
    };

    const { speciesUrl, searchUrl, lsidUrl } = buildWscLinks(base.fullName, { lsid: base.species_lsid, speciesId: base.speciesId as any });
    const wscPromise = fetchWscTaxon(base.species_lsid);

    // Try to enrich with user-local history if signed in
    const session = await getServerSession(authOptions);
    let user = null as null | Record<string, any>;
    if (session?.user?.id) {
      await connectMongoose();
      const uid = new Types.ObjectId(session.user.id);
      // Case-insensitive exact match to be tolerant of capitalization
      const nameRegex = new RegExp(`^${escapeRegExp(base.fullName)}$`, "i");
      const entries = await MoltEntry.find({ userId: uid, species: { $regex: nameRegex } })
        .select({ entryType: 1, stage: 1, date: 1, attachments: 1, createdAt: 1 })
        .sort({ date: 1 })
        .lean();

      const nowYear = new Date().getFullYear();
      let totalMolts = 0;
      let totalFeedings = 0;
      const stageCounts: Record<string, number> = { "Pre-molt": 0, Molt: 0, "Post-molt": 0 };
      let firstMoltDate: string | null = null;
      let lastMoltDate: string | null = null;
      let yearMolts = 0;
      let attachmentsCount = 0;

      for (const e of entries) {
        attachmentsCount += Array.isArray((e as any).attachments) ? (e as any).attachments.length : 0;
        if ((e as any).entryType === "molt") {
          totalMolts += 1;
          const d = new Date((e as any).date);
          if (d.getFullYear() === nowYear) yearMolts += 1;
          const iso = d.toISOString();
          if (!firstMoltDate || d < new Date(firstMoltDate)) firstMoltDate = iso;
          if (!lastMoltDate || d > new Date(lastMoltDate)) lastMoltDate = iso;
          const s = (e as any).stage;
          if (s && typeof s === "string" && s in stageCounts) stageCounts[s] += 1;
        } else if ((e as any).entryType === "feeding") {
          totalFeedings += 1;
        }
      }

      // Recent activity sample (most recent first, limited)
      const recent = entries
        .slice()
        .sort((a, b) => new Date((b as any).date).getTime() - new Date((a as any).date).getTime())
        .slice(0, 10)
        .map((e: any) => ({ entryType: e.entryType, stage: e.stage ?? null, date: e.date }));

      user = {
        totalMolts,
        totalFeedings,
        stageCounts,
        firstMoltDate,
        lastMoltDate,
        yearMolts,
        attachmentsCount,
        recent,
      };
    }

    const [wscTaxon] = await Promise.all([wscPromise]);

    return NextResponse.json({
      species: {
        ...base,
        wscUrl: speciesUrl,
        wscSearchUrl: searchUrl,
        lsidUrl,
      },
      user,
      wscTaxon: wscTaxon ?? null,
    });
  } catch (error) {
    console.error("/api/species/info error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
