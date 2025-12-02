import { Schema, model, models } from "mongoose";

const PasskeyAuthSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    challenge: { type: String, required: true },
    expiresAt: {
      type: Date,
      required: true,
      // TTL index: document expires at the specified time.
      expires: 0,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "passkeyAuthSessions" }
);

const PasskeyAuthSessionModel =
  models.PasskeyAuthSession || model("PasskeyAuthSession", PasskeyAuthSessionSchema);

export default PasskeyAuthSessionModel;
