import { Schema } from "mongoose";

export const AttachmentSchema = new Schema(
  {
    name: String,
    url: String,
    type: String,
    addedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

