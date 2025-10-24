"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, Mail, Lock } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Suspense
        fallback={
          <Card className="w-full max-w-md p-8">
            <h2 className="text-2xl font-bold text-center">Sign in to Moltly</h2>
          </Card>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}

function sanitizeCallbackPath(raw: string | null): string {
  if (!raw) {
    return "/";
  }

  if (/^\/(?!\/)/.test(raw)) {
    return raw;
  }

  try {
    if (typeof window === "undefined") {
      return "/";
    }
    const origin = window.location.origin;
    const url = new URL(raw, origin);
    if (url.origin !== origin) {
      return "/";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackParam = searchParams.get("callbackUrl");
  const callbackPath = useMemo(() => sanitizeCallbackPath(callbackParam), [callbackParam]);
  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return callbackPath;
    }
    return new URL(callbackPath, window.location.origin).toString();
  }, [callbackPath]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.push(callbackPath);
  };

  return (
    <Card className="w-full max-w-md p-8 animate-scale-in">
      {/* Logo/Header */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[rgb(var(--primary))] to-[rgb(var(--primary-strong))] flex items-center justify-center text-white font-bold text-2xl mb-4">
          M
        </div>
        <h1 className="text-2xl font-bold text-[rgb(var(--text))]">Welcome Back</h1>
        <p className="text-sm text-[rgb(var(--text-soft))] mt-1">
          Sign in to continue to Moltly
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-subtle))]" />
            <Input
              type="email"
              required
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
              placeholder="Your password"
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
          <LogIn className="w-4 h-4" />
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </form>

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[rgb(var(--border))]" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-[rgb(var(--surface))] px-2 text-[rgb(var(--text-subtle))]">
            Or continue with
          </span>
        </div>
      </div>

      {/* Discord OAuth */}
      <Button
        type="button"
        variant="secondary"
        onClick={() => signIn("discord", { callbackUrl })}
        className="w-full gap-2"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
        </svg>
        Continue with Discord
      </Button>

      {/* Sign Up Link */}
      <p className="text-center text-sm text-[rgb(var(--text-soft))] mt-6">
        Need an account?{" "}
        <Link href="/register" className="text-[rgb(var(--primary))] hover:underline font-medium">
          Create one
        </Link>
      </p>
    </Card>
  );
}
