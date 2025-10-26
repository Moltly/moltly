import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  const teamId = process.env.APPLE_TEAM_ID || "TEAMID_PLACEHOLDER";
  const bundleId = "xyz.moltly.app";

  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [
            `${teamId}.${bundleId}`,
          ],
          components: [
            { 
              "/": "/api/auth/*",
              comment: "OAuth callbacks for NextAuth",
            },
          ],
        },
      ],
    },
  };

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}

