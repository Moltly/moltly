import { Schema, model, models, Types } from "mongoose";

const SpecimenCoverSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    key: { type: String, required: true },
    imageUrl: { type: String, required: true },
  },
  { timestamps: true, collection: "specimenCovers" }
);

SpecimenCoverSchema.index({ userId: 1, key: 1 }, { unique: true });

const SpecimenCoverModel = models.SpecimenCover || model("SpecimenCover", SpecimenCoverSchema);

export default SpecimenCoverModel;

