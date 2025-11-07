export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isEmailAdmin, isDiscordAdmin } from "@/lib/admin";

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? null;
  const isAdmin = Boolean(isEmailAdmin(email)) || (await isDiscordAdmin(userId));
  return NextResponse.json({ isAdmin });
}

