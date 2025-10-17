"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <div className="app">
      <Suspense
        fallback={
          <section className="auth-card">
            <h2>Sign in to Moltly</h2>
          </section>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
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
      callbackUrl
    });
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.push(callbackUrl);
  };

  return (
    <section className="auth-card">
      <h2>Sign in to Moltly</h2>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Your password"
          />
        </label>
        {error && <p style={{ color: "#ff9a9a", margin: 0 }}>{error}</p>}
        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>
      <button type="button" className="btn btn--ghost" onClick={() => signIn("discord", { callbackUrl })}>
        Continue with Discord
      </button>
      <p className="auth-switch">
        Need an account? <Link href="/register">Create one</Link>
      </p>
    </section>
  );
}
