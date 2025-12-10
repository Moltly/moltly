"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserPlus, Mail, Lock, User, CheckCircle2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";
import LogoMark from "@/components/layout/LogoMark";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!normalizedUsername) {
      setError("Username is required.");
      return;
    }
    if (!/^[a-zA-Z0-9]{2,32}$/.test(normalizedUsername)) {
      setError("Username must be 2-32 characters (letters and numbers only).");
      return;
    }
    if (normalizedEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: normalizedEmail || undefined,
          password,
          username: normalizedUsername
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Registration failed.");
      }
      const message =
        typeof data.message === "string"
          ? data.message
          : "If the email is eligible, you can sign in with your credentials.";
      setSuccess(message);
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to register.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 animate-scale-in">
        {/* Logo/Header */}
        <div className="flex flex-col items-center mb-8">
          <LogoMark size={64} className="mb-4" />
          <h1 className="text-2xl font-bold text-[rgb(var(--text))]">Create Account</h1>
          <p className="text-sm text-[rgb(var(--text-soft))] mt-1">
            Join Moltly to start tracking your tarantulas
          </p>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-6 p-4 rounded-[var(--radius)] bg-[rgb(var(--success-soft))] text-[rgb(var(--success))] flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">Account created!</p>
              <p className="text-sm">{success}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
              Name <span className="text-[rgb(var(--text-subtle))]">(optional)</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-subtle))]" />
              <Input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                className="pl-10"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
              Username <span className="text-[rgb(var(--danger))]">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-subtle))]" />
              <Input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="letters and numbers only"
                className="pl-10"
                required
                minLength={2}
                maxLength={32}
              />
            </div>
            <p className="text-xs text-[rgb(var(--text-subtle))] mt-1">Pick a unique username (no special symbols).</p>
          </div>

          <div>
            <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
              Email <span className="text-[rgb(var(--text-subtle))]">(optional)</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-subtle))]" />
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="pl-10"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-subtle))]" />
              <Input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                className="pl-10"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-subtle))]" />
              <Input
                type="password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter password"
                minLength={8}
                className="pl-10"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-[var(--radius)] bg-[rgb(var(--danger-soft))] text-[rgb(var(--danger))] text-sm">
              {error}
            </div>
          )}

          {/* Legal consent */}
          <p className="text-xs text-[rgb(var(--text-subtle))] text-center">
            By creating an account, you agree to our{" "}
            <a
              href="https://raw.githubusercontent.com/Moltly/moltly/refs/heads/main/TERMS.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[rgb(var(--primary))] hover:underline"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="https://raw.githubusercontent.com/Moltly/moltly/refs/heads/main/PRIVACY.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[rgb(var(--primary))] hover:underline"
            >
              Privacy Policy
            </a>
            .
          </p>

          <Button
            type="submit"
            variant="primary"
            disabled={loading || !!success}
            className="w-full gap-2"
          >
            <UserPlus className="w-4 h-4" />
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        {/* Sign In Link */}
        <p className="text-center text-sm text-[rgb(var(--text-soft))] mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-[rgb(var(--primary))] hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
