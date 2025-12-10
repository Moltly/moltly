import { Schema, model, models, Types } from "mongoose";

type ResearchNoteDocument = {
  id: string;
  title: string;
  individualLabel?: string;
  content?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  externalSource?: string;
  externalId?: string;
  entryType?: string;
  url?: string;
  sourceMessageId?: string;
  sourceChannelId?: string;
  sourceGuildId?: string;
  authorId?: string;
  // E2E encryption fields
  isEncrypted?: boolean;
  encryptionSalt?: string;
  encryptionIV?: string;
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
    },
    externalSource: { type: String, trim: true },
    externalId: { type: String, trim: true },
    entryType: { type: String, trim: true },
    url: { type: String, trim: true },
    sourceMessageId: { type: String, trim: true },
    sourceChannelId: { type: String, trim: true },
    sourceGuildId: { type: String, trim: true },
    authorId: { type: String, trim: true },
    // E2E encryption fields
    isEncrypted: { type: Boolean, default: false },
    encryptionSalt: { type: String, trim: true },
    encryptionIV: { type: String, trim: true }
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
    externalSource: { type: String, trim: true },
    externalId: { type: String, trim: true, index: true },
    isPublic: { type: Boolean },
    alias: { type: String, trim: true },
    saveCount: { type: Number, default: 0 },
    // E2E encryption: when true, all notes in this stack are encrypted
    isEncryptedStack: { type: Boolean, default: false },
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
