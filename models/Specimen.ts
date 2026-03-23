import { Schema, model, models, Types } from "mongoose";
import { AttachmentSchema } from "./shared";

const pairingStatuses = ["none", "seeking_male", "seeking_female", "has_male", "has_female", "open_to_offers"] as const;

const SpecimenSchema = new Schema(
    {
        userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
        name: { type: String, required: true, trim: true },
        species: { type: String, trim: true },
        sex: { type: String, enum: ["Male", "Female", "Unknown", "Unsexed"] },
        imageUrl: { type: String },
        notes: { type: String },
        pairingStatus: { type: String, enum: pairingStatuses, default: "none", index: true },
        availableForPairing: { type: Boolean, default: false, index: true },
        pairingNotes: { type: String, trim: true, maxlength: 500 },
        attachments: [AttachmentSchema],
        archived: { type: Boolean, default: false, index: true },
        archivedAt: { type: Date },
        archivedReason: { type: String, trim: true }
    },
    { timestamps: true, collection: "specimens" }
);

// Index for efficient lookups by user
SpecimenSchema.index({ userId: 1, name: 1 });

const SpecimenModel = models.Specimen || model("Specimen", SpecimenSchema);

export default SpecimenModel;
