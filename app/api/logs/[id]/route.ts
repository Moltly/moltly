export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import { authOptions } from "../../../../lib/auth-options";
import { connectMongoose } from "../../../../lib/mongoose";
import MoltEntry from "../../../../models/MoltEntry";
import getMongoClientPromise from "../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import path from "path";
import { unlink } from "fs/promises";
import { isS3Configured, keyFromS3Url, deleteObject } from "../../../../lib/s3";

type RouteContext = {
  params: Promise<{ id?: string | string[] }>;
};

function ensureObjectId(id: string) {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid entry id.");
  }
  return new Types.ObjectId(id);
}

function assertId(raw: string | string[] | undefined) {
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) {
    throw new Error("Missing entry id.");
  }
  return id;
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = await context.params;
    const id = assertId(params.id);
    const updates = await request.json();
    await connectMongoose();
    const entry = await MoltEntry.findOne({ _id: ensureObjectId(id), userId: session.user.id });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    const allowedEntryTypes = new Set(["molt", "feeding", "water"]);
    const allowedStages = new Set(["Pre-molt", "Molt", "Post-molt"]);
    const allowedOutcomes = new Set(["Offered", "Ate", "Refused", "Not Observed"]);

    // Capture previous key for WSCA sync if this was a molt
    const prevType: "molt" | "feeding" | "water" = (entry.entryType as any) ?? "molt";
    const prevSpecies = entry.species as string | undefined;
    const prevSpecimen = entry.specimen as string | undefined;
    const prevDateIso = new Date(entry.date).toISOString().slice(0, 10);
    const prevStage = entry.stage as string | undefined;

    let effectiveEntryType: "molt" | "feeding" | "water" = prevType;
    if (typeof updates.entryType === "string" && allowedEntryTypes.has(updates.entryType)) {
      effectiveEntryType = updates.entryType as "molt" | "feeding" | "water";
    }
    entry.entryType = effectiveEntryType;

    if ("specimen" in updates) {
      if (typeof updates.specimen === "string") {
        const trimmedSpecimen = updates.specimen.trim();
        entry.specimen = trimmedSpecimen.length > 0 ? trimmedSpecimen : undefined;
      } else if (updates.specimen === null) {
        entry.specimen = undefined;
      }
    }

    if ("species" in updates) {
      entry.species = typeof updates.species === "string" && updates.species.trim().length > 0 ? updates.species.trim() : undefined;
    }

    if (updates.date) {
      const nextDate = new Date(updates.date);
      if (!Number.isNaN(nextDate.getTime())) {
        entry.date = nextDate;
      }
    }

    if ("stage" in updates || effectiveEntryType !== "molt") {
      if (effectiveEntryType !== "molt") {
        entry.stage = undefined;
      } else if (typeof updates.stage === "string" && allowedStages.has(updates.stage)) {
        entry.stage = updates.stage;
      } else if (updates.stage !== undefined) {
        entry.stage = "Molt";
      }
    }

    if ("oldSize" in updates) {
      entry.oldSize = typeof updates.oldSize === "number" && Number.isFinite(updates.oldSize) ? updates.oldSize : undefined;
    }

    if ("newSize" in updates) {
      entry.newSize = typeof updates.newSize === "number" && Number.isFinite(updates.newSize) ? updates.newSize : undefined;
    }

    if ("humidity" in updates) {
      entry.humidity = typeof updates.humidity === "number" && Number.isFinite(updates.humidity) ? updates.humidity : undefined;
    }

    if ("temperature" in updates) {
      entry.temperature =
        typeof updates.temperature === "number" && Number.isFinite(updates.temperature) ? updates.temperature : undefined;
    }

    if ("temperatureUnit" in updates) {
      if (updates.temperatureUnit === "C" || updates.temperatureUnit === "F") {
        entry.temperatureUnit = updates.temperatureUnit;
      } else if (updates.temperatureUnit === null) {
        entry.temperatureUnit = undefined;
      }
    }

    if ("notes" in updates) {
      entry.notes = typeof updates.notes === "string" && updates.notes.trim().length > 0 ? updates.notes.trim() : undefined;
    }

    if ("reminderDate" in updates) {
      if (typeof updates.reminderDate === "string" && updates.reminderDate.length > 0) {
        const reminder = new Date(updates.reminderDate);
        entry.reminderDate = Number.isNaN(reminder.getTime()) ? undefined : reminder;
      } else {
        entry.reminderDate = undefined;
      }
    }

    if ("feedingPrey" in updates) {
      entry.feedingPrey =
        effectiveEntryType === "feeding" && typeof updates.feedingPrey === "string" && updates.feedingPrey.trim().length > 0
          ? updates.feedingPrey.trim()
          : undefined;
    }

    if ("feedingAmount" in updates) {
      entry.feedingAmount =
        effectiveEntryType === "feeding" && typeof updates.feedingAmount === "string" && updates.feedingAmount.trim().length > 0
          ? updates.feedingAmount.trim()
          : undefined;
    }

    if ("feedingOutcome" in updates) {
      entry.feedingOutcome =
        effectiveEntryType === "feeding" &&
        typeof updates.feedingOutcome === "string" &&
        allowedOutcomes.has(updates.feedingOutcome)
          ? updates.feedingOutcome
          : undefined;
    }

    let removedAttachmentUrls: string[] = [];
    if (Array.isArray(updates.attachments)) {
      const prevUrls = (entry.attachments || []).map((a: any) => a.url).filter(Boolean);
      const nextUrls = (updates.attachments || []).map((a: any) => a.url).filter(Boolean);
      removedAttachmentUrls = prevUrls.filter((u: string) => !nextUrls.includes(u));
      entry.attachments = updates.attachments;
    }

    if (effectiveEntryType !== "feeding") {
      entry.feedingPrey = undefined;
      entry.feedingOutcome = undefined;
      entry.feedingAmount = undefined;
    }

    if (effectiveEntryType === "molt" && !entry.species) {
      return NextResponse.json({ error: "Species is required for molt entries." }, { status: 400 });
    }

    await entry.save();

    // Outbound WSCA sync logic
    try {
      const syncUrl = process.env.WSCA_SYNC_URL;
      const syncSecret = process.env.WSCA_SYNC_SECRET;
      if (syncUrl && syncSecret) {
        const client = await getMongoClientPromise();
        const db = client.db();
        const accounts = db.collection("accounts");
        const account =
          (await accounts.findOne({ provider: "discord", userId: new ObjectId(session.user.id) })) ||
          (await accounts.findOne({ provider: "discord", userId: session.user.id })) ||
          null;
        const discordId = account?.providerAccountId;
        if (discordId) {
          const newDateIso = new Date(entry.date).toISOString().slice(0, 10);
          if (prevType === "molt" && effectiveEntryType !== "molt") {
            // If changed from molt -> not molt, delete on WSCA
            const res = await fetch(syncUrl, {
              method: "DELETE",
              headers: { "content-type": "application/json", "X-Sync-Secret": syncSecret },
              body: JSON.stringify({
                discord_user_id: String(discordId),
                canonical: prevSpecies,
                specimen_name: prevSpecimen ?? undefined,
                date: prevDateIso,
                stage: prevStage ?? undefined,
              }),
            }).catch((err) => { if (process.env.WSCA_SYNC_DEBUG === "true") console.error("[WSCA_SYNC] DELETE failed:", err); return undefined as any; });
            if (process.env.WSCA_SYNC_DEBUG === "true" && res) { try { console.log("[WSCA_SYNC] DELETE status=", res.status, await res.text()); } catch {} }
          } else if (prevType !== "molt" && effectiveEntryType === "molt") {
            // not molt -> molt, create on WSCA
            const res = await fetch(syncUrl, {
              method: "POST",
              headers: { "content-type": "application/json", "X-Sync-Secret": syncSecret },
              body: JSON.stringify({
                discord_user_id: String(discordId),
                canonical: entry.species,
                specimen_name: entry.specimen ?? undefined,
                date: newDateIso,
                stage: entry.stage ?? undefined,
                notes: entry.notes ?? undefined,
              }),
            }).catch((err) => { if (process.env.WSCA_SYNC_DEBUG === "true") console.error("[WSCA_SYNC] POST failed:", err); return undefined as any; });
            if (process.env.WSCA_SYNC_DEBUG === "true" && res) { try { console.log("[WSCA_SYNC] POST status=", res.status, await res.text()); } catch {} }
          } else if (effectiveEntryType === "molt") {
            // molt -> molt, update key fields
            const res = await fetch(syncUrl, {
              method: "PUT",
              headers: { "content-type": "application/json", "X-Sync-Secret": syncSecret },
              body: JSON.stringify({
                discord_user_id: String(discordId),
                old: {
                  canonical: prevSpecies,
                  specimen_name: prevSpecimen ?? undefined,
                  date: prevDateIso,
                  stage: prevStage ?? undefined,
                },
                new: {
                  canonical: entry.species,
                  specimen_name: entry.specimen ?? undefined,
                  date: newDateIso,
                  stage: entry.stage ?? undefined,
                  notes: entry.notes ?? undefined,
                },
              }),
            }).catch((err) => { if (process.env.WSCA_SYNC_DEBUG === "true") console.error("[WSCA_SYNC] PUT failed:", err); return undefined as any; });
            if (process.env.WSCA_SYNC_DEBUG === "true" && res) { try { console.log("[WSCA_SYNC] PUT status=", res.status, await res.text()); } catch {} }
          }
        }
      }
    } catch {}

    if (removedAttachmentUrls.length > 0) {
      const useS3 = isS3Configured();
      await Promise.all(
        removedAttachmentUrls.map(async (url) => {
          if (useS3) {
            const key = keyFromS3Url(url);
            if (key) {
              try { await deleteObject(key); } catch {}
            }
          } else if (url.startsWith("/uploads/")) {
            const file = path.join(process.cwd(), "public", url);
            try { await unlink(file); } catch {}
          }
        })
      );
    }

    return NextResponse.json({
      ...entry.toObject(),
      id: entry._id.toString(),
      userId: entry.userId.toString()
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update entry." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = await context.params;
    const id = assertId(params.id);
    await connectMongoose();
    const entry = await MoltEntry.findOneAndDelete({
      _id: ensureObjectId(id),
      userId: session.user.id
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    try {
      const urls: string[] = (entry.attachments || []).map((a: any) => a.url).filter(Boolean);
      const useS3 = isS3Configured();
      await Promise.all(
        urls.map(async (url) => {
          if (useS3) {
            const key = keyFromS3Url(url);
            if (key) {
              try { await deleteObject(key); } catch {}
            }
          } else if (url.startsWith("/uploads/")) {
            const file = path.join(process.cwd(), "public", url);
            try { await unlink(file); } catch {}
          }
        })
      );
    } catch {}

    // Sync delete to WSCA if it was a molt
    try {
            if (entry.entryType === "molt") {
              const syncUrl = process.env.WSCA_SYNC_URL;
              const syncSecret = process.env.WSCA_SYNC_SECRET;
              if (syncUrl && syncSecret) {
          const client = await getMongoClientPromise();
          const db = client.db();
          const accounts = db.collection("accounts");
          const account =
            (await accounts.findOne({ provider: "discord", userId: new ObjectId(session.user.id) })) ||
            (await accounts.findOne({ provider: "discord", userId: session.user.id })) ||
            null;
          const discordId = account?.providerAccountId;
          if (discordId) {
                const res = await fetch(syncUrl, {
                  method: "DELETE",
                  headers: { "content-type": "application/json", "X-Sync-Secret": syncSecret },
                  body: JSON.stringify({
                    discord_user_id: String(discordId),
                    canonical: entry.species,
                    specimen_name: entry.specimen ?? undefined,
                    date: new Date(entry.date).toISOString().slice(0, 10),
                    stage: entry.stage ?? undefined,
                  }),
                }).catch((err) => { if (process.env.WSCA_SYNC_DEBUG === "true") console.error("[WSCA_SYNC] DELETE failed:", err); return undefined as any; });
                if (process.env.WSCA_SYNC_DEBUG === "true" && res) { try { console.log("[WSCA_SYNC] DELETE status=", res.status, await res.text()); } catch {} }
          }
        }
      }
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to delete entry." }, { status: 500 });
  }
}
