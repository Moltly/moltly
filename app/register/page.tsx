"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Registration failed.");
      }
      setSuccess("Account created for Moltly. Redirecting to sign in…");
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to register.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <section className="auth-card">
        <h2>Create your Moltly account</h2>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
          <label className="field">
            <span>Name</span>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional" />
          </label>
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
              placeholder="At least 8 characters"
              minLength={8}
            />
          </label>
          <label className="field">
            <span>Confirm Password</span>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat password"
              minLength={8}
            />
          </label>
          {error && <p style={{ color: "#ff9a9a", margin: 0 }}>{error}</p>}
          {success && <p style={{ color: "#6fe0ba", margin: 0 }}>{success}</p>}
          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>
        <p className="auth-switch">
          Already registered? <Link href="/login">Sign in</Link>
        </p>
      </section>
    </div>
  );
}
