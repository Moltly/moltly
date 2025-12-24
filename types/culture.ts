import type { Attachment } from "./molt";

export type CultureType = "roach" | "isopod" | "cricket" | "mealworm" | "superworm" | "other";

export type CultureEntry = {
    id: string;
    name: string;
    cultureType: CultureType;
    species?: string;
    quantity?: number;
    purchaseDate?: string;
    lastFed?: string;
    lastCleaned?: string;
    temperature?: number;
    temperatureUnit?: "C" | "F";
    humidity?: number;
    notes?: string;
    attachments?: Attachment[];
    createdAt: string;
    updatedAt: string;
};

export type CultureFormState = {
    name: string;
    cultureType: CultureType;
    species: string;
    quantity: string;
    purchaseDate: string;
    lastFed: string;
    lastCleaned: string;
    temperature: string;
    temperatureUnit: "C" | "F";
    humidity: string;
    notes: string;
};
