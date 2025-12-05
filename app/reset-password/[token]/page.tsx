"use client";

import Link from "next/link";
import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { Lock, ArrowLeft } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";
import LogoMark from "@/components/layout/LogoMark";

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
    const router = useRouter();
    const { token } = use(params);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        setError(null);

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            setLoading(false);
            return;
        }

        try {
            const res = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Something went wrong.");
            }

            setSuccess(true);
            setTimeout(() => {
                router.push("/login");
            }, 3000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Card className="w-full max-w-md p-8 animate-scale-in text-center">
                    <div className="flex justify-center mb-6">
                        <LogoMark size={64} />
                    </div>
                    <h2 className="text-2xl font-bold text-[rgb(var(--text))] mb-2">Password Reset Successful!</h2>
                    <p className="text-[rgb(var(--text-soft))] mb-6">You will be redirected to the login page shortly.</p>
                    <Link href="/login">
                        <Button variant="primary" className="w-full">Go to Login</Button>
                    </Link>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <Card className="w-full max-w-md p-8 animate-scale-in">
                <div className="flex flex-col items-center mb-8">
                    <LogoMark size={64} className="mb-4" />
                    <h1 className="text-2xl font-bold text-[rgb(var(--text))]">Set New Password</h1>
                    <p className="text-sm text-[rgb(var(--text-soft))] mt-1">
                        Please enter your new password below
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                            New Password
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-subtle))]" />
                            <Input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="New password"
                                className="pl-10"
                                minLength={8}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
                            Confirm New Password
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-subtle))]" />
                            <Input
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm new password"
                                className="pl-10"
                                minLength={8}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 rounded-[var(--radius)] bg-[rgb(var(--danger-soft))] text-[rgb(var(--danger))] text-sm">
                            {error}
                        </div>
                    )}

                    <Button type="submit" variant="primary" disabled={loading} className="w-full gap-2">
                        {loading ? "Resetting..." : "Reset Password"}
                    </Button>

                    <div className="pt-2 text-center">
                        <Link href="/login" className="text-sm text-[rgb(var(--text-soft))] hover:text-[rgb(var(--text))] flex items-center justify-center gap-2 transition-colors">
                            <ArrowLeft className="w-4 h-4" />
                            Back to Login
                        </Link>
                    </div>
                </form>
            </Card>
        </div>
    );
}
