import { Schema, model, models, Types } from "mongoose";
import { AttachmentSchema } from "./shared";

const BreedingEntrySchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    femaleSpecimen: { type: String, trim: true },
    maleSpecimen: { type: String, trim: true },
    species: { type: String, trim: true },
    pairingDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["Planned", "Attempted", "Successful", "Failed", "Observation"],
      default: "Planned",
      index: true
    },
    pairingNotes: String,
    eggSacDate: Date,
    eggSacStatus: {
      type: String,
      enum: ["Not Laid", "Laid", "Pulled", "Failed", "Hatched"],
      default: "Not Laid"
    },
    eggSacCount: Number,
    hatchDate: Date,
    slingCount: Number,
    followUpDate: Date,
    notes: String,
    attachments: [AttachmentSchema]
  },
  { timestamps: true, collection: "breedingEntries" }
);

const BreedingEntryModel =
  models.BreedingEntry || model("BreedingEntry", BreedingEntrySchema);

export default BreedingEntryModel;

