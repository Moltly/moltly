import { Schema, model, models, Types } from "mongoose";

const FavoriteSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    species: { type: String, required: true, trim: true },
    lsid: { type: String, trim: true },
    family: { type: String, trim: true },
    author: { type: String, trim: true },
    rank: { type: String, trim: true, default: "species" },
    externalSource: { type: String, trim: true },
  },
  { timestamps: true, collection: "favorites" }
);

FavoriteSchema.index({ userId: 1, species: 1 }, { unique: true });
FavoriteSchema.index({ userId: 1, lsid: 1 }, { unique: true, sparse: true });

const FavoriteModel = models.Favorite || model("Favorite", FavoriteSchema);

export default FavoriteModel;
