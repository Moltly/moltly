"use client";

import Link from "next/link";
import { useState } from "react";
import { Mail, ArrowLeft } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";
import LogoMark from "@/components/layout/LogoMark";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            const res = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Something went wrong.");
            }

            setMessage(data.message);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <Card className="w-full max-w-md p-8 animate-scale-in">
                <div className="flex flex-col items-center mb-8">
                    <LogoMark size={64} className="mb-4" />
                    <h1 className="text-2xl font-bold text-[rgb(var(--text))]">Reset Password</h1>
                    <p className="text-sm text-[rgb(var(--text-soft))] mt-1 text-center">
                        Enter your email to receive a password reset link
                    </p>
                </div>

                {message ? (
                    <div className="text-center space-y-4">
                        <div className="p-4 rounded-[var(--radius)] bg-[rgb(var(--success-soft))] text-[rgb(var(--success-strong))] border border-[rgb(var(--success))] text-sm">
                            {message}
                        </div>
                        <Link href="/login">
                            <Button variant="secondary" className="w-full">
                                Return to Login
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                                Email Address
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-subtle))]" />
                                <Input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter your email"
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 rounded-[var(--radius)] bg-[rgb(var(--danger-soft))] text-[rgb(var(--danger))] text-sm">
                                {error}
                            </div>
                        )}

                        <Button type="submit" variant="primary" disabled={loading} className="w-full gap-2">
                            {loading ? "Sending Link..." : "Send Reset Link"}
                        </Button>

                        <div className="pt-4 text-center">
                            <Link href="/login" className="text-sm text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))] flex items-center justify-center gap-2 transition-colors">
                                <ArrowLeft className="w-4 h-4" />
                                Back to Login
                            </Link>
                        </div>
                    </form>
                )}
            </Card>
        </div>
    );
}
