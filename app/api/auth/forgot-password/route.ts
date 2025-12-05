import { NextRequest, NextResponse } from "next/server";
import { connectMongoose } from "@/lib/mongoose";
import User from "@/models/User";
import { sendEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        await connectMongoose();
        // Use findOne to get the document, select +resetPasswordToken isn't strictly needed if we just overwrite it,
        // but good to know it exists.
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Return 200 even if user not found to prevent enumeration
            return NextResponse.json({ message: "If an account exists, an email has been sent." });
        }

        // Generate token
        const token = crypto.randomBytes(32).toString("hex");
        const expiry = new Date(Date.now() + 3600000); // 1 hour

        // Save token to user
        user.resetPasswordToken = token;
        user.resetPasswordExpires = expiry;
        await user.save();

        // Send email
        const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password/${token}`;

        await sendEmail({
            to: user.email,
            subject: "Password Reset Request",
            text: `You requested a password reset. Click this link to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.\nIf you did not request this, please ignore this email.`,
            html: `
        <p>You requested a password reset.</p>
        <p>Click this link to reset your password:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>This link expires in 1 hour.</p>
        <p>If you did not request this, please ignore this email.</p>
      `,
        });

        return NextResponse.json({ message: "If an account exists, an email has been sent." });
    } catch (error) {
        console.error("Password reset request error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
