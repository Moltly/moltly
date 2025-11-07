import { Schema, model, models, Types } from "mongoose";

export type SpeciesSuggestionStatus = "pending" | "approved" | "rejected" | "removed";

export interface SpeciesSuggestionDoc {
  _id: Types.ObjectId;
  fullName: string;
  fullNameLC: string;
  genus?: string;
  species?: string;
  subspecies?: string;
  family?: string;
  status: SpeciesSuggestionStatus;
  submittedBy?: Types.ObjectId | string;
  submittedAt: Date;
  reviewedBy?: Types.ObjectId | string;
  reviewedAt?: Date;
  reason?: string;
}

const SpeciesSuggestionSchema = new Schema<SpeciesSuggestionDoc>(
  {
    fullName: { type: String, required: true, trim: true },
    fullNameLC: { type: String, required: true },
    genus: { type: String, trim: true },
    species: { type: String, trim: true },
    subspecies: { type: String, trim: true },
    family: { type: String, trim: true },
    status: { type: String, enum: ["pending", "approved", "rejected", "removed"], default: "pending", index: true },
    submittedBy: { type: Schema.Types.Mixed },
    submittedAt: { type: Date, default: () => new Date(), index: true },
    reviewedBy: { type: Schema.Types.Mixed },
    reviewedAt: { type: Date },
    reason: { type: String, trim: true },
  },
  { timestamps: false, collection: "species_suggestions" }
);

SpeciesSuggestionSchema.index({ fullNameLC: 1 }, { unique: true });

const SpeciesSuggestionModel = models.SpeciesSuggestion || model("SpeciesSuggestion", SpeciesSuggestionSchema);

export default SpeciesSuggestionModel;
