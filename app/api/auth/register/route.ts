import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { connectMongoose } from "../../../../lib/mongoose";
import User from "../../../../models/User";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, password } = body;
    const rawEmail = typeof body?.email === "string" ? body.email : "";
    const email = rawEmail.trim().toLowerCase();
    const usernameRaw = typeof body?.username === "string" ? body.username : "";
    const username = usernameRaw.trim().toLowerCase();

    if (!username) {
      return NextResponse.json({ error: "Username is required." }, { status: 400 });
    }

    if (!/^[a-z0-9]{2,32}$/.test(username)) {
      return NextResponse.json(
        { error: "Username must be 2-32 characters and use letters or numbers only." },
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }

    if (typeof password !== "string" || password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters and include both letters and numbers." },
        { status: 400 }
      );
    }

    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    await connectMongoose();

    const usernameInUse = await User.findOne({ username });
    if (usernameInUse) {
      return NextResponse.json({ error: "Username is already taken." }, { status: 409 });
    }

    if (email) {
      const existing = await User.findOne({ email });
      if (existing) {
        return NextResponse.json({ error: "Email is already in use." }, { status: 409 });
      }
    }

    const hashed = await bcrypt.hash(password, 12);
    await User.create({
      name,
      email: email || undefined,
      username,
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
