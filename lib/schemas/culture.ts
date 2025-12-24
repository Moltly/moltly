import { z } from "zod";
import { AttachmentInputSchema } from "./attachments";
import {
    optionalDateString,
    optionalNumber,
    optionalTrimmedString
} from "./common";

const cultureTypeEnum = z.enum(["roach", "isopod", "cricket", "mealworm", "superworm", "other"]);
const temperatureUnitEnum = z.enum(["C", "F"]);

export const CultureEntryBaseSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(160),
    cultureType: cultureTypeEnum,
    species: optionalTrimmedString(160),
    quantity: optionalNumber,
    purchaseDate: optionalDateString,
    lastFed: optionalDateString,
    lastCleaned: optionalDateString,
    temperature: optionalNumber,
    temperatureUnit: temperatureUnitEnum.optional(),
    humidity: optionalNumber,
    notes: optionalTrimmedString(4000),
    attachments: z.array(AttachmentInputSchema).optional()
});

export const CultureEntryCreateSchema = CultureEntryBaseSchema.transform((data) => ({
    name: data.name,
    cultureType: data.cultureType,
    species: data.species,
    quantity: data.quantity,
    purchaseDate: data.purchaseDate,
    lastFed: data.lastFed,
    lastCleaned: data.lastCleaned,
    temperature: data.temperature,
    temperatureUnit: data.temperatureUnit,
    humidity: data.humidity,
    notes: data.notes,
    attachments: data.attachments ?? []
}));

export const CultureEntryUpdateSchema = CultureEntryBaseSchema.partial();
