export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth-options";
import { connectMongoose } from "../../../lib/mongoose";
import MoltEntry from "../../../models/MoltEntry";
import HealthEntry from "../../../models/HealthEntry";
import BreedingEntry from "../../../models/BreedingEntry";
import ResearchStack from "../../../models/ResearchStack";
import SpecimenCover from "../../../models/SpecimenCover";
import User from "../../../models/User";
import { deleteObject, isS3Configured, keyFromS3Url } from "../../../lib/s3";

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    await connectMongoose();

    // Collect all attachments from all entry types
    const [moltEntries, healthEntries, breedingEntries] = await Promise.all([
      MoltEntry.find({ userId }).select("attachments").lean(),
      HealthEntry.find({ userId }).select("attachments").lean(),
      BreedingEntry.find({ userId }).select("attachments").lean(),
    ]);

    const allEntries = [...moltEntries, ...healthEntries, ...breedingEntries];
    const attachmentUrls: string[] = [];

    for (const entry of allEntries) {
      const attachments = (entry as any).attachments;
      if (Array.isArray(attachments)) {
        for (const att of attachments) {
          if (att?.url && typeof att.url === "string") {
            attachmentUrls.push(att.url);
          }
        }
      }
    }

    // Delete attachments from S3/MinIO
    const useS3 = isS3Configured();
    if (useS3 && attachmentUrls.length > 0) {
      await Promise.all(
        attachmentUrls.map(async (url) => {
          const key = keyFromS3Url(url);
          if (key) {
            try {
              await deleteObject(key);
            } catch {
              // Ignore individual deletion errors
            }
          }
        })
      );
    }

    // Delete all user data from database
    await Promise.all([
      MoltEntry.deleteMany({ userId }),
      HealthEntry.deleteMany({ userId }),
      BreedingEntry.deleteMany({ userId }),
      ResearchStack.deleteMany({ userId }),
      SpecimenCover.deleteMany({ userId }),
    ]);

    if (authOptions.adapter?.deleteUser) {
      await authOptions.adapter.deleteUser(userId);
    }

    await User.deleteOne({ _id: userId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to delete account." }, { status: 500 });
  }
}
