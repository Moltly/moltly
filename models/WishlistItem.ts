import { Schema, model, models, Types } from "mongoose";

const WishlistItemSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    species: { type: String, required: true, trim: true },
    lsid: { type: String, trim: true },
    family: { type: String, trim: true },
    author: { type: String, trim: true },
    rank: { type: String, trim: true, default: "species" },
    notes: { type: String, trim: true },
    externalSource: { type: String, trim: true },
  },
  { timestamps: true, collection: "wishlistItems" }
);

WishlistItemSchema.index({ userId: 1, species: 1 }, { unique: true });
WishlistItemSchema.index({ userId: 1, lsid: 1 }, { unique: true, sparse: true });

const WishlistItemModel = models.WishlistItem || model("WishlistItem", WishlistItemSchema);

export default WishlistItemModel;
