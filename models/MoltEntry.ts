import { Schema, model, models, Types } from "mongoose";
import { AttachmentSchema } from "./shared";

const MoltEntrySchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    specimen: { type: String, trim: true },
    species: { type: String, trim: true },
    date: { type: Date, required: true },
    entryType: {
      type: String,
      trim: true,
      default: "molt",
      index: true
    },
    stage: {
      type: String,
      enum: ["Pre-molt", "Molt", "Post-molt"],
      default: function () {
        return (this as { entryType?: string }).entryType === "molt" ? "Molt" : undefined;
      },
      required: function () {
        return (this as { entryType?: string }).entryType === "molt";
      }
    },
    oldSize: Number,
    newSize: Number,
    humidity: Number,
    temperature: Number,
    temperatureUnit: {
      type: String,
      enum: ["C", "F"],
    },
    reminderDate: Date,
    notes: String,
    feedingPrey: String,
    feedingOutcome: {
      type: String,
      enum: ["Offered", "Ate", "Refused", "Not Observed"]
    },
    feedingAmount: String,
    attachments: [AttachmentSchema]
  },
  { timestamps: true, collection: "moltEntries" }
);

const MoltEntryModel = models.MoltEntry || model("MoltEntry", MoltEntrySchema);

export default MoltEntryModel;
