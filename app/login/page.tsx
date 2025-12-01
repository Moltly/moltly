"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, Lock, User as UserIcon, KeyRound } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";
import LogoMark from "@/components/layout/LogoMark";
import { decodeRequestOptions, serializePublicKeyCredential } from "@/lib/passkey-client";

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
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [providers, setProviders] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/providers")
      .then((res) => res.json())
      .then((data) => {
        if (active) setProviders(data || {});
      })
      .catch(() => {
        if (active) setProviders({});
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedIdentifier = identifier.trim();
    setLoading(true);
    setError(null);
    const result = await signIn("credentials", {
      identifier: normalizedIdentifier,
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
    router.refresh();
  };

  const handlePasskeySignIn = async () => {
    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) {
      setError("Enter your username or email to use a passkey.");
      return;
    }
    if (typeof window === "undefined" || !("credentials" in navigator)) {
      setError("Passkeys are not supported in this browser.");
      return;
    }
    setPasskeyLoading(true);
    setError(null);
    try {
      const optionsRes = await fetch("/api/auth/passkey/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: normalizedIdentifier })
      });
      if (!optionsRes.ok) {
        const body = await optionsRes.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error || "Unable to start passkey sign-in.");
      }
      const options = await optionsRes.json();
      const decoded = decodeRequestOptions(options);
      const assertion = (await navigator.credentials.get({ publicKey: decoded })) as PublicKeyCredential | null;
      if (!assertion) {
        throw new Error("Passkey sign-in was cancelled.");
      }
      const result = await signIn("credentials", {
        identifier: normalizedIdentifier,
        passkeyResponse: JSON.stringify(serializePublicKeyCredential(assertion)),
        redirect: false,
        callbackUrl,
      });
      if (result?.error) {
        throw new Error(result.error);
      }
      router.push(callbackPath);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Passkey sign-in failed.");
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md p-8 animate-scale-in">
      {/* Logo/Header */}
      <div className="flex flex-col items-center mb-8">
        <LogoMark size={64} className="mb-4" />
        <h1 className="text-2xl font-bold text-[rgb(var(--text))]">Welcome Back</h1>
        <p className="text-sm text-[rgb(var(--text-soft))] mt-1">
          Sign in to continue to Moltly
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-[rgb(var(--text))] mb-1.5 block">
            Username or email
          </label>
          <div className="relative">
            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-subtle))]" />
            <Input
              type="text"
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="username or email"
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
        <Button
          type="button"
          variant="secondary"
          disabled={passkeyLoading}
          className="w-full gap-2"
          onClick={() => void handlePasskeySignIn()}
        >
          <KeyRound className="w-4 h-4" />
          {passkeyLoading ? "Waiting for passkey..." : "Sign in with passkey"}
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

      {/* OAuth Providers */}
      {/* Apple OAuth */}
      {!!providers?.apple && (
      <Button
        type="button"
        variant="secondary"
        onClick={() => signIn("apple", { callbackUrl })}
        className="w-full gap-2 mb-2"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M16.365 1.43c0 1.14-.464 2.2-1.208 2.99-.77.82-1.99 1.41-3.2 1.33-.071-1.11.497-2.25 1.242-3.03C13.97 1.86 15.23 1.24 16.365 1.43m3.49 16.4c-.061.12-1.16 3.98-4.32 3.98-1.03 0-1.84-.35-2.62-.71-.76-.35-1.47-.67-2.37-.67-.94 0-1.69.33-2.45.67-.72.31-1.46.64-2.39.69-3.13.11-4.44-3.78-4.5-3.9-.25-.71-.46-1.46-.61-2.22-.52-2.64.18-5.39 1.86-7.27 1.04-1.18 2.43-1.92 3.83-1.92.74 0 1.48.39 2.32.75.71.32 1.46.65 2.31.65.81 0 1.44-.31 2.22-.68.86-.41 1.77-.84 2.8-.74 1.19.1 2.56.86 3.5 2.19-3.08 1.77-2.58 6.41.51 7.92M15.05 0c.07 0 .14 0 .21.01-.02.01-.03.01-.05.01.02 0 .03-.01.05-.01" />
        </svg>
        Continue with Apple
      </Button>
      )}

      {/* Google OAuth */}
      {!!providers?.google && (
      <Button
        type="button"
        variant="secondary"
        onClick={() => signIn("google", { callbackUrl })}
        className="w-full gap-2 mb-2"
      >
        {/* Google "G" icon */}
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
          <path fill="#EA4335" d="M12 10.2v3.84h5.38c-.24 1.26-.97 2.33-2.07 3.05l3.35 2.6c1.96-1.8 3.09-4.45 3.09-7.65c0-.74-.07-1.45-.21-2.14H12z"/>
          <path fill="#34A853" d="M6.64 14.32L5.8 14.96l-2.68 2.06C4.73 19.98 8.09 22 12 22c2.7 0 4.97-.89 6.63-2.41l-3.35-2.6c-.93.63-2.12 1.01-3.28 1.01c-2.52 0-4.66-1.7-5.36-4.01z"/>
          <path fill="#4A90E2" d="M3.12 7.02A9.98 9.98 0 0 0 2 12c0 1.73.42 3.36 1.16 4.78l3.48-2.7A5.95 5.95 0 0 1 6 12c0-.87.2-1.69.55-2.42z"/>
          <path fill="#FBBC05" d="M12 6.02c1.47 0 2.79.51 3.83 1.5l2.87-2.87C16.96 2.9 14.7 2 12 2C8.09 2 4.73 4.02 3.12 7.02l3.43 2.56C7.34 7.7 9.48 6.02 12 6.02z"/>
        </svg>
        Continue with Google
      </Button>
      )}

      {/* Discord OAuth */}
      {!!providers?.discord && (
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
      )}

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
