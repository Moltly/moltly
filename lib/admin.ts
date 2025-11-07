import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";
import getMongoClientPromise from "./mongodb";

export function isEmailAdmin(email?: string | null): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

export async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  const byEmail = isEmailAdmin(email);
  const byDiscord = await isDiscordAdmin(session?.user?.id);
  if (!byEmail && !byDiscord) {
    return { ok: false as const, session: null as any };
  }
  return { ok: true as const, session };
}

export async function isDiscordAdmin(userId?: string | null): Promise<boolean> {
  if (!userId) return false;
  const ids = (process.env.ADMIN_DISCORD_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return false;
  try {
    const client = await getMongoClientPromise();
    const db = client.db();
    const accounts = db.collection("accounts");
    const { ObjectId } = await import("mongodb");
    const account = await accounts.findOne({
      provider: "discord",
      $or: [
        { userId: new ObjectId(userId) },
        { userId },
      ],
    });
    if (!account?.providerAccountId) return false;
    return ids.includes(String(account.providerAccountId));
  } catch {
    return false;
  }
}
