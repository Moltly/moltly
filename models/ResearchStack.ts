import { Schema, model, models, Types } from "mongoose";

type ResearchNoteDocument = {
  id: string;
  title: string;
  individualLabel?: string;
  content?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
};

const ResearchNoteSchema = new Schema<ResearchNoteDocument>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    individualLabel: { type: String, trim: true },
    content: { type: String, default: "" },
    tags: {
      type: [String],
      default: []
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const ResearchStackSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    species: { type: String, trim: true },
    category: { type: String, trim: true },
    description: { type: String, trim: true },
    tags: {
      type: [String],
      default: []
    },
    notes: {
      type: [ResearchNoteSchema],
      default: []
    }
  },
  {
    timestamps: true,
    collection: "researchStacks"
  }
);

const ResearchStackModel = models.ResearchStack || model("ResearchStack", ResearchStackSchema);

export default ResearchStackModel;
