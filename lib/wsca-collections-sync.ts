import { ObjectId } from "mongodb";
import getMongoClientPromise from "./mongodb";

const SYNC_URL = process.env.WSCA_SYNC_URL || "";
const SYNC_SECRET = process.env.WSCA_SYNC_SECRET || "";

function deriveBotUrl(path: string): string | null {
  if (!SYNC_URL) return null;
  try {
    const url = new URL(SYNC_URL);
    url.pathname = path;
    return url.toString();
  } catch {
    return null;
  }
}

async function findDiscordAccountId(userId: string): Promise<string | undefined> {
  const client = await getMongoClientPromise();
  const db = client.db();
  const accounts = db.collection("accounts");
  const asObjectId = (() => {
    try {
      return new ObjectId(userId);
    } catch {
      return null;
    }
  })();

  const account =
    (asObjectId && (await accounts.findOne({ provider: "discord", userId: asObjectId }))) ||
    (await accounts.findOne({ provider: "discord", userId })) ||
    null;

  const discordId = account?.providerAccountId;
  return discordId ? String(discordId) : undefined;
}

async function sendToBot(
  path: string,
  method: string,
  body: Record<string, any>
): Promise<void> {
  const url = deriveBotUrl(path);
  if (!url || !SYNC_SECRET) return;

  await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "X-Sync-Secret": SYNC_SECRET,
    },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

export async function trySyncFavoriteToWSCA(
  userId: string,
  data: { species: string; lsid?: string | null }
) {
  try {
    const discordId = await findDiscordAccountId(userId);
    if (!discordId) return;
    await sendToBot("/sync/favorite", "POST", {
      discord_user_id: discordId,
      canonical: data.species,
      lsid: data.lsid || undefined,
    });
  } catch {
    // best-effort
  }
}

export async function tryRemoveFavoriteOnWSCA(
  userId: string,
  data: { species: string; lsid?: string | null }
) {
  try {
    const discordId = await findDiscordAccountId(userId);
    if (!discordId) return;
    await sendToBot("/sync/favorite", "DELETE", {
      discord_user_id: discordId,
      canonical: data.species,
      lsid: data.lsid || undefined,
    });
  } catch {
    // best-effort
  }
}

export async function trySyncWishlistToWSCA(
  userId: string,
  data: { species: string; lsid?: string | null; notes?: string | null }
) {
  try {
    const discordId = await findDiscordAccountId(userId);
    if (!discordId) return;
    await sendToBot("/sync/wishlist", "POST", {
      discord_user_id: discordId,
      canonical: data.species,
      lsid: data.lsid || undefined,
      notes: data.notes || undefined,
    });
  } catch {
    // best-effort
  }
}

export async function tryRemoveWishlistOnWSCA(
  userId: string,
  data: { species: string; lsid?: string | null }
) {
  try {
    const discordId = await findDiscordAccountId(userId);
    if (!discordId) return;
    await sendToBot("/sync/wishlist", "DELETE", {
      discord_user_id: discordId,
      canonical: data.species,
      lsid: data.lsid || undefined,
    });
  } catch {
    // best-effort
  }
}
