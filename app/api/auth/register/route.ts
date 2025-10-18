import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { connectMongoose } from "../../../../lib/mongoose";
import User from "../../../../models/User";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    if (typeof password !== "string" || password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters and include both letters and numbers." },
        { status: 400 }
      );
    }

    await connectMongoose();

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return NextResponse.json(
        {
          success: true,
          message: "If that email is already registered, you can sign in with your existing credentials."
        },
        { status: 200 }
      );
    }

    const hashed = await bcrypt.hash(password, 12);
    await User.create({
      name,
      email: email.toLowerCase(),
      password: hashed
    });

    return NextResponse.json(
      {
        success: true,
        message: "Your account has been created. You can sign in now."
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to register." }, { status: 500 });
  }
}
