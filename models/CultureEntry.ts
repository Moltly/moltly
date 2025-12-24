import { Schema, model, models, Types } from "mongoose";
import { AttachmentSchema } from "./shared";

const CultureEntrySchema = new Schema(
    {
        userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
        name: { type: String, required: true, trim: true },
        cultureType: {
            type: String,
            enum: ["roach", "isopod", "cricket", "mealworm", "superworm", "other"],
            required: true
        },
        species: { type: String, trim: true },
        quantity: Number,
        purchaseDate: Date,
        lastFed: Date,
        lastCleaned: Date,
        temperature: Number,
        temperatureUnit: {
            type: String,
            enum: ["C", "F"]
        },
        humidity: Number,
        notes: String,
        attachments: [AttachmentSchema]
    },
    { timestamps: true, collection: "cultureEntries" }
);

const CultureEntryModel = models.CultureEntry || model("CultureEntry", CultureEntrySchema);

export default CultureEntryModel;
