import { Schema, model, models, Types } from "mongoose";

const AttachmentSchema = new Schema(
  {
    name: String,
    url: String,
    type: String,
    addedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const MoltEntrySchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    specimen: { type: String, required: true },
    species: { type: String },
    date: { type: Date, required: true },
    stage: { type: String, enum: ["Pre-molt", "Molt", "Post-molt"], default: "Molt" },
    oldSize: Number,
    newSize: Number,
    humidity: Number,
    temperature: Number,
    reminderDate: Date,
    notes: String,
    attachments: [AttachmentSchema]
  },
  { timestamps: true, collection: "moltEntries" }
);

const MoltEntryModel = models.MoltEntry || model("MoltEntry", MoltEntrySchema);

export default MoltEntryModel;
