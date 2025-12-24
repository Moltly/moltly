import { Schema, model, models, Types } from "mongoose";
import { AttachmentSchema } from "./shared";

const HealthEntrySchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    specimenId: { type: Types.ObjectId, ref: "Specimen", index: true },
    specimen: { type: String, trim: true },
    species: { type: String, trim: true },
    date: { type: Date, required: true },
    weight: Number,
    weightUnit: { type: String, enum: ["g", "oz"], default: "g" },
    temperature: Number,
    temperatureUnit: { type: String, enum: ["C", "F"] },
    humidity: Number,
    condition: {
      type: String,
      enum: ["Stable", "Observation", "Critical"],
      default: "Stable"
    },
    behavior: String,
    healthIssues: String,
    treatment: String,
    followUpDate: Date,
    notes: String,
    attachments: [AttachmentSchema]
  },
  { timestamps: true, collection: "healthEntries" }
);

const HealthEntryModel = models.HealthEntry || model("HealthEntry", HealthEntrySchema);

export default HealthEntryModel;
