import { Schema, model, models } from "mongoose";

const UserSchema = new Schema(
  {
    name: { type: String, trim: true },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      index: true
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 32,
      match: /^[a-z0-9]{3,32}$/i,
    },
    password: { type: String, select: false },
    image: { type: String },
    passkeys: [
      {
        credentialId: { type: String, required: true },
        publicKey: { type: String, required: true },
        counter: { type: Number, default: 0 },
        transports: [{ type: String }],
        friendlyName: { type: String, trim: true },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    passkeyChallenge: { type: String, select: false },
    passkeyChallengeExpires: { type: Date, select: false }
  },
  { timestamps: true, collection: "users" }
);

UserSchema.index({ "passkeys.credentialId": 1 }, { unique: true, sparse: true });

const UserModel = models.User || model("User", UserSchema);

export default UserModel;
