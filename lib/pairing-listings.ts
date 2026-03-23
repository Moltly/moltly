import { keyFromS3Url } from "@/lib/s3";
import { connectMongoose } from "@/lib/mongoose";
import Specimen from "@/models/Specimen";
import UserModel from "@/models/User";
import type { PairingContactMethod, PairingStatus, SpecimenSex } from "@/types/molt";

type PairingContact = {
  method?: PairingContactMethod;
  value?: string;
  notes?: string;
};

type ListingUser = {
  _id: unknown;
  name?: string;
  username?: string;
  image?: string;
  preferences?: {
    pairingContact?: PairingContact;
  };
};

type ListingAttachment = {
  name?: string;
  url?: string;
  type?: string;
  addedAt?: Date | string | null;
};

type ListingSpecimen = {
  _id: unknown;
  userId: unknown;
  name: string;
  species?: string;
  sex?: SpecimenSex;
  imageUrl?: string;
  notes?: string;
  pairingStatus?: string | null;
  availableForPairing?: boolean | null;
  pairingNotes?: string;
  attachments?: ListingAttachment[];
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

export type PublicPairingImage = {
  kind: "cover" | "attachment";
  name?: string;
  type?: string;
  url: string;
  originalUrl?: string;
  addedAt?: string;
};

export type PublicPairingListing = {
  listingId: string;
  specimenId: string;
  specimenName: string;
  species?: string;
  sex?: SpecimenSex;
  imageUrl?: string;
  notes?: string;
  pairingStatus: PairingStatus;
  pairingNotes?: string;
  createdAt?: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string;
    username?: string;
    imageUrl?: string;
  };
  contact: {
    method: PairingContactMethod;
    value: string;
    notes?: string;
  };
  attachments: PublicPairingImage[];
  images: PublicPairingImage[];
  urls: {
    api: string;
    share: string;
  };
};

export type PublicPairingListingsQuery = {
  species?: string;
  status?: PairingStatus;
  sex?: SpecimenSex;
  ownerId?: string;
  search?: string;
};

const normalizePairingStatus = (specimen: {
  pairingStatus?: string | null;
  availableForPairing?: boolean | null;
  sex?: string | null;
}): PairingStatus => {
  switch (specimen.pairingStatus) {
    case "seeking_male":
    case "seeking_female":
    case "open_to_offers":
      return specimen.pairingStatus;
    case "has_male":
      return "seeking_female";
    case "has_female":
      return "seeking_male";
    case "none":
      return "none";
    default:
      return specimen.availableForPairing ? (specimen.sex === "Female" ? "seeking_male" : "seeking_female") : "none";
  }
};

const toIsoString = (value?: Date | string | null) => {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const toAbsoluteUrl = (origin: string, value?: string | null) => {
  if (!value) return undefined;
  try {
    return new URL(value, origin).toString();
  } catch {
    return undefined;
  }
};

const resolvePublicOrigin = (requestOrigin: string) => {
  const configuredOrigin =
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    process.env.SITE_URL ||
    requestOrigin;

  try {
    return new URL(configuredOrigin).origin;
  } catch {
    return requestOrigin;
  }
};

const toPublicImage = (
  origin: string,
  image: { kind: "cover" | "attachment"; url?: string; name?: string; type?: string; addedAt?: Date | string | null }
): PublicPairingImage | null => {
  const absoluteOriginalUrl = toAbsoluteUrl(origin, image.url);
  if (!absoluteOriginalUrl) return null;

  const proxiedUrl = keyFromS3Url(absoluteOriginalUrl)
    ? new URL(`/api/image?url=${encodeURIComponent(absoluteOriginalUrl)}`, origin).toString()
    : undefined;

  return {
    kind: image.kind,
    name: image.name,
    type: image.type,
    url: proxiedUrl ?? absoluteOriginalUrl,
    originalUrl: proxiedUrl ? absoluteOriginalUrl : undefined,
    addedAt: toIsoString(image.addedAt),
  };
};

export async function getPublicPairingListings(origin: string): Promise<PublicPairingListing[]> {
  const publicOrigin = resolvePublicOrigin(origin);
  await connectMongoose();

  const specimens = (await Specimen.find({
    archived: { $ne: true },
    $or: [
      { pairingStatus: { $exists: true, $ne: "none" } },
      { availableForPairing: true },
    ],
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean()) as ListingSpecimen[];

  const userIds = Array.from(new Set(specimens.map((specimen) => String(specimen.userId))));
  const users = (await UserModel.find({ _id: { $in: userIds } })
    .select("name username image preferences.pairingContact")
    .lean()) as ListingUser[];

  const userById = new Map(
    users.map((user) => [
      String(user._id),
      {
        id: String(user._id),
        name:
          (typeof user.username === "string" && user.username.trim()) ||
          (typeof user.name === "string" && user.name.trim()) ||
          "Moltly user",
        username: typeof user.username === "string" && user.username.trim() ? user.username.trim() : undefined,
        imageUrl: toAbsoluteUrl(publicOrigin, user.image),
        pairingContact: user.preferences?.pairingContact,
      },
    ])
  );

  const listings = specimens
    .map<PublicPairingListing | null>((specimen) => {
      const owner = userById.get(String(specimen.userId));
      const contact = owner?.pairingContact;
      const pairingStatus = normalizePairingStatus(specimen);
      if (!owner || !contact?.method || !contact?.value) return null;
      if (pairingStatus === "none") return null;

      const coverImage = toPublicImage(publicOrigin, {
        kind: "cover",
        name: specimen.name,
        type: "image",
        url: specimen.imageUrl,
      });
      const attachmentImages = (specimen.attachments ?? [])
        .map((attachment) =>
          toPublicImage(publicOrigin, {
            kind: "attachment",
            name: attachment.name,
            type: attachment.type,
            url: attachment.url,
            addedAt: attachment.addedAt,
          })
        )
        .filter((image): image is PublicPairingImage => Boolean(image));

      const images = [...(coverImage ? [coverImage] : []), ...attachmentImages];
      const specimenId = String(specimen._id);

      return {
        listingId: specimenId,
        specimenId,
        specimenName: specimen.name,
        species: specimen.species,
        sex: specimen.sex,
        imageUrl: coverImage?.url,
        notes: specimen.notes,
        pairingStatus,
        pairingNotes: specimen.pairingNotes,
        createdAt: toIsoString(specimen.createdAt),
        updatedAt: toIsoString(specimen.updatedAt) ?? new Date().toISOString(),
        owner: {
          id: owner.id,
          name: owner.name,
          username: owner.username,
          imageUrl: owner.imageUrl,
        },
        contact: {
          method: contact.method,
          value: contact.value,
          notes: contact.notes,
        },
        attachments: attachmentImages,
        images,
        urls: {
          api: new URL(`/api/public/pairings/${specimenId}`, publicOrigin).toString(),
          share: new URL(
            `/?${new URLSearchParams({
              view: "specimens",
              specimen: specimen.name,
              specimenId,
              owner: owner.id,
              ...(specimen.species ? { species: specimen.species } : {}),
            }).toString()}`,
            publicOrigin
          ).toString(),
        },
      };
    })
    .filter((listing): listing is PublicPairingListing => listing !== null);

  return listings;
}

export function filterPublicPairingListings(
  listings: PublicPairingListing[],
  query: PublicPairingListingsQuery
): PublicPairingListing[] {
  const normalizedSpecies = query.species?.trim().toLowerCase();
  const normalizedSearch = query.search?.trim().toLowerCase();

  return listings.filter((listing) => {
    if (query.status && listing.pairingStatus !== query.status) return false;
    if (query.sex && listing.sex !== query.sex) return false;
    if (query.ownerId && listing.owner.id !== query.ownerId) return false;
    if (normalizedSpecies && (listing.species ?? "").trim().toLowerCase() !== normalizedSpecies) return false;

    if (!normalizedSearch) return true;

    return [
      listing.specimenName,
      listing.species,
      listing.owner.name,
      listing.owner.username,
      listing.contact.value,
      listing.pairingNotes,
      listing.notes,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch));
  });
}
