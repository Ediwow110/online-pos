"use client";

import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function SignupPage() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password"), businessName: form.get("businessName") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error === "EMAIL_ALREADY_REGISTERED" ? "That email is already registered." : result.error === "REGISTRATION_RATE_LIMITED" ? "Too many attempts. Try again later." : "Please check your details and try again.");
      window.location.assign("/dashboard");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create your account.");
    } finally {
      setPending(false);
    }
  }
  return <main className="auth-page"><div className="auth-card"><a className="brand" href="/"><span className="brand-mark">L</span><span>ledgerly</span></a><p className="eyebrow">Start simply</p><h1>Set up your store.</h1><p className="auth-copy">Create your owner account and get a ready-to-use register workspace.</p><form onSubmit={submit}><label>Your name<input name="name" autoComplete="name" required /></label><label>Store name<input name="businessName" autoComplete="organization" required /></label><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" minLength={10} autoComplete="new-password" required /><small className="field-hint">Use at least 10 characters.</small></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark" type="submit" disabled={pending}>{pending ? "Creating store…" : "Create store"} <span>→</span></button></form><a className="back-link" href="/login">Already have an account? Sign in →</a></div></main>;
}
