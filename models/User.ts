import { Schema, model, models } from "mongoose";

const UserSchema = new Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    password: { type: String, select: false },
    image: { type: String }
  },
  { timestamps: true, collection: "users" }
);

const UserModel = models.User || model("User", UserSchema);

export default UserModel;
