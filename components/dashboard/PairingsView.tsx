"use client";

import { useEffect, useMemo, useState } from "react";
import { Megaphone, Mail, MessageCircle, RefreshCcw } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import CachedImage from "@/components/ui/CachedImage";
import SpeciesAutosuggest from "@/components/ui/SpeciesAutosuggest";
import type { PairingContactPreference, PairingStatus, Specimen } from "@/types/molt";
import { formatDate } from "@/lib/utils";

type PairingListing = {
  specimenId: string;
  specimenName: string;
  species?: string;
  sex?: Specimen["sex"];
  imageUrl?: string;
  notes?: string;
  pairingStatus: PairingStatus;
  pairingNotes?: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string;
  };
  contact: PairingContactPreference;
};

interface PairingsViewProps {
  specimens: Specimen[];
  isSync: boolean;
  currentUserId?: string;
  refreshToken?: number;
  pairingContactConfigured?: boolean;
}

const pairingStatusLabels: Record<PairingStatus, string> = {
  none: "Not advertised",
  seeking_male: "Seeking male",
  seeking_female: "Seeking female",
  open_to_offers: "Open to offers",
};

function pairingBadgeVariant(status: PairingStatus): "success" | "warning" | "primary" | "neutral" {
  switch (status) {
    case "seeking_male":
    case "seeking_female":
      return "warning";
    case "open_to_offers":
      return "primary";
    default:
      return "neutral";
  }
}

function formatContactLabel(method?: string) {
  switch (method) {
    case "email":
      return "Email";
    case "discord":
      return "Discord";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "telegram":
      return "Telegram";
    default:
      return "Contact";
  }
}

function buildSpecimenShareHref(listing: PairingListing) {
  const params = new URLSearchParams();
  params.set("view", "specimens");
  params.set("specimen", listing.specimenName);
  params.set("specimenId", listing.specimenId);
  params.set("owner", listing.owner.id);
  if (listing.species) {
    params.set("species", listing.species);
  }
  return `/?${params.toString()}`;
}

export default function PairingsView({
  specimens,
  isSync,
  currentUserId,
  refreshToken = 0,
  pairingContactConfigured = false,
}: PairingsViewProps) {
  const [listings, setListings] = useState<PairingListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reloadTick, setReloadTick] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"all" | PairingStatus>("all");
  const [sexFilter, setSexFilter] = useState<"all" | NonNullable<Specimen["sex"]>>("all");
  const [sortBy, setSortBy] = useState<"recent" | "species" | "species_sex">("species");
  const [speciesFilter, setSpeciesFilter] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/pairings", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load pairing listings");
        const data = (await res.json()) as PairingListing[];
        if (!cancelled) {
          setListings(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load pairing listings");
          setListings([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshToken, reloadTick]);

  const ownListingsCount = useMemo(
    () => specimens.filter((specimen) => specimen.pairingStatus && specimen.pairingStatus !== "none" && !specimen.archived).length,
    [specimens]
  );

  const filteredListings = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = listings.filter((listing) => {
      if (statusFilter !== "all" && listing.pairingStatus !== statusFilter) return false;
      if (sexFilter !== "all" && listing.sex !== sexFilter) return false;
      if (speciesFilter.trim()) {
        const normalizedSpeciesFilter = speciesFilter.trim().toLowerCase();
        if ((listing.species ?? "").toLowerCase() !== normalizedSpeciesFilter) return false;
      }
      if (!query) return true;
      return [listing.specimenName, listing.species, listing.owner.name, listing.contact?.value]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });

    const sexOrder = (sex?: Specimen["sex"]) => {
      switch (sex) {
        case "Male":
          return 0;
        case "Female":
          return 1;
        case "Unknown":
          return 2;
        case "Unsexed":
          return 3;
        default:
          return 4;
      }
    };

    return [...filtered].sort((a, b) => {
      if (sortBy === "recent") {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }

      const speciesCompare = (a.species ?? "zzz").localeCompare(b.species ?? "zzz");
      if (sortBy === "species" && speciesCompare !== 0) return speciesCompare;
      if (sortBy === "species_sex" && speciesCompare !== 0) return speciesCompare;

      if (sortBy === "species_sex") {
        const sexCompare = sexOrder(a.sex) - sexOrder(b.sex);
        if (sexCompare !== 0) return sexCompare;
      }

      return a.specimenName.localeCompare(b.specimenName);
    });
  }, [listings, search, sexFilter, sortBy, speciesFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-[rgb(var(--primary))]" />
              <h2 className="text-base font-semibold text-[rgb(var(--text))]">Pairing Ads</h2>
            </div>
            <p className="mt-1 text-sm text-[rgb(var(--text-soft))]">
              Browse specimens other keepers have listed as seeking or available for pairings.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setReloadTick((prev) => prev + 1);
            }}
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="primary">{listings.length} live ads</Badge>
          <Badge variant={ownListingsCount > 0 ? "success" : "neutral"}>
            {ownListingsCount} of yours
          </Badge>
          {isSync ? (
            <Badge variant={pairingContactConfigured ? "success" : "warning"}>
              {pairingContactConfigured ? "Contact ready" : "Contact not set"}
            </Badge>
          ) : (
            <Badge variant="warning">Guest mode cannot publish ads</Badge>
          )}
        </div>
        {isSync && ownListingsCount > 0 && !pairingContactConfigured ? (
          <p className="mt-3 text-sm text-[rgb(var(--warning))]">
            Your specimens have live pairing ads, but other keepers will not see them until you save a preferred contact method in the account panel.
          </p>
        ) : null}
      </Card>

      <div className="relative">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by specimen, species, owner, or contact..."
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--text-subtle))]">
            Filter by species
          </label>
          <div className="mt-1">
            <SpeciesAutosuggest
              value={speciesFilter}
              onChange={setSpeciesFilter}
              placeholder="Any species"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--text-subtle))]">
            Filter by ad type
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | PairingStatus)}
            className="mt-1 w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]"
          >
            <option value="all">All ad types</option>
            <option value="seeking_male">Seeking male</option>
            <option value="seeking_female">Seeking female</option>
            <option value="open_to_offers">Open to offers</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--text-subtle))]">
            Filter by sex
          </label>
          <select
            value={sexFilter}
            onChange={(e) => setSexFilter(e.target.value as "all" | NonNullable<Specimen["sex"]>)}
            className="mt-1 w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]"
          >
            <option value="all">All sexes</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Unknown">Unknown</option>
            <option value="Unsexed">Unsexed</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--text-subtle))]">
            Sort listings
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "recent" | "species" | "species_sex")}
            className="mt-1 w-full px-3 py-2 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]"
          >
            <option value="species">Species A-Z</option>
            <option value="species_sex">Species then sex</option>
            <option value="recent">Recently updated</option>
          </select>
        </div>
      </div>

      {loading ? (
        <Card className="p-6 text-sm text-[rgb(var(--text-soft))]">Loading pairing listings…</Card>
      ) : error ? (
        <Card className="p-6 text-sm text-[rgb(var(--danger))]">{error}</Card>
      ) : filteredListings.length === 0 ? (
        <Card className="p-6 text-sm text-[rgb(var(--text-soft))]">
          No pairing ads are live yet.
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredListings.map((listing) => {
            const isOwnListing = Boolean(currentUserId && currentUserId === listing.owner.id);
            const contactLabel = formatContactLabel(listing.contact?.method);
            const specimenHref = buildSpecimenShareHref(listing);

            return (
              <Card key={listing.specimenId} className="overflow-hidden">
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-4">
                    {listing.imageUrl ? (
                      <div className="w-20 h-20 rounded-[var(--radius)] overflow-hidden bg-[rgb(var(--bg-muted))] shrink-0">
                        <CachedImage
                          src={listing.imageUrl}
                          alt={`${listing.specimenName} photo`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={specimenHref}
                          className="text-lg font-semibold text-[rgb(var(--text))] hover:text-[rgb(var(--primary))] hover:underline"
                        >
                          {listing.specimenName}
                        </a>
                        <Badge variant={pairingBadgeVariant(listing.pairingStatus)}>{pairingStatusLabels[listing.pairingStatus]}</Badge>
                        {isOwnListing ? <Badge variant="primary">Your ad</Badge> : null}
                      </div>
                      {listing.species ? (
                        <p className="mt-1 text-sm italic text-[rgb(var(--text-soft))]">{listing.species}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[rgb(var(--text-subtle))]">
                        <span>Keeper: {listing.owner.name}</span>
                        {listing.sex ? <span>Sex: {listing.sex}</span> : null}
                        <span>Updated {formatDate(listing.updatedAt)}</span>
                        <a href={specimenHref} className="text-[rgb(var(--primary))] hover:underline">
                          View full specimen profile
                        </a>
                      </div>
                    </div>
                  </div>

                  {(listing.pairingNotes || listing.notes) ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {listing.pairingNotes ? (
                        <div className="rounded-[var(--radius)] bg-[rgb(var(--bg-muted))] p-3">
                          <p className="text-xs uppercase tracking-wide text-[rgb(var(--text-subtle))]">Pairing Notes</p>
                          <p className="mt-1 text-sm text-[rgb(var(--text))] whitespace-pre-wrap">{listing.pairingNotes}</p>
                        </div>
                      ) : null}
                      {listing.notes ? (
                        <div className="rounded-[var(--radius)] bg-[rgb(var(--bg-muted))] p-3">
                          <p className="text-xs uppercase tracking-wide text-[rgb(var(--text-subtle))]">Specimen Notes</p>
                          <p className="mt-1 text-sm text-[rgb(var(--text))] whitespace-pre-wrap">{listing.notes}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-[var(--radius)] border border-[rgb(var(--border))] p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--text))]">
                      {listing.contact?.method === "email" ? (
                        <Mail className="w-4 h-4 text-[rgb(var(--primary))]" />
                      ) : (
                        <MessageCircle className="w-4 h-4 text-[rgb(var(--primary))]" />
                      )}
                      <span>{contactLabel}</span>
                    </div>
                    <p className="mt-1 text-sm text-[rgb(var(--text))] break-words">{listing.contact?.value}</p>
                    {listing.contact?.notes ? (
                      <p className="mt-1 text-xs text-[rgb(var(--text-soft))] whitespace-pre-wrap">{listing.contact.notes}</p>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
