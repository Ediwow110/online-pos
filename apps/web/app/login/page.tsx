"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (!response.ok) throw new Error("Invalid email or password.");
      window.location.assign("/dashboard");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <a className="brand" href="/"><span className="brand-mark">L</span><span>ledgerly</span></a>
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to your store.</h1>
        <p className="auth-copy">Access your sales, stock, shifts, and business overview.</p>
        <form onSubmit={submit}>
          <label>Email<input name="email" type="email" defaultValue="owner@valdez.store" required /></label>
          <label>Password<input name="password" type="password" defaultValue="ChangeMe123!" required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-dark" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"} <span>→</span></button>
        </form>
        <a className="back-link" href="/signup">Create a new store account →</a>
        <a className="back-link" href="/">← Back to home</a>
      </div>
    </main>
  );
}
