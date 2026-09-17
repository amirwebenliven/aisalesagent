"use client";

import Link from "next/link";
import { useState } from "react";

type Errors = {
  form?: string;
  name?: string;
  email?: string;
  password?: string;
  businessName?: string;
};

const MIN_PASSWORD_LENGTH = 8; // mirrors lib/auth.ts; the server is the authority

export default function SignupPage() {
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    // Client-side check is a convenience only — trim here the same way the
    // server does, so a name of one space fails here instead of silently
    // becoming a workspace called " ".
    const next: Errors = {};
    if (!businessName.trim()) next.businessName = "Business name is required.";
    else if (businessName.trim().length < 2) next.businessName = "Use at least 2 characters.";
    if (!email.trim()) next.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()))
      next.email = "That does not look like an email address.";
    if (!password) next.password = "Password is required.";
    else if (password.length < MIN_PASSWORD_LENGTH)
      next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (Object.keys(next).length > 0) return setErrors(next);

    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, businessName, email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
      };

      if (!res.ok) {
        setErrors({ ...(data.fields ?? {}), form: data.error ?? `Signup failed (${res.status}).` });
        return;
      }

      // Full page load so the server layout reads the new session cookie.
      // /dashboard, not "/" — the root is the public marketing page.
      window.location.assign("/dashboard");
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Network error. Check your connection." });
    } finally {
      setSubmitting(false);
    }
  }

  const clear = (k: keyof Errors) => setErrors((p) => ({ ...p, [k]: undefined }));

  return (
    <main style={wrap}>
      <div style={{ width: "100%", maxWidth: 372 }}>
        <div style={brand}>
          <span style={mark} aria-hidden="true">AI</span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Agent Platform</span>
        </div>

        <div className="card card-p">
          <h1 style={h1}>Create your workspace</h1>
          <p className="dim small" style={{ marginBottom: 18 }}>
            One workspace per business. You can invite your team afterwards.
          </p>

          {errors.form && <div style={alert} role="alert">{errors.form}</div>}

          {/* noValidate — see the note in app/login/page.tsx. */}
          <form onSubmit={onSubmit} noValidate>
            <div className="field">
              <label htmlFor="businessName">Business name</label>
              <input
                id="businessName"
                autoComplete="organization"
                value={businessName}
                onChange={(e) => {
                  setBusinessName(e.target.value);
                  clear("businessName");
                }}
                style={errors.businessName ? inputErr : undefined}
                aria-invalid={!!errors.businessName}
              />
              {errors.businessName ? (
                <span style={fieldErr}>{errors.businessName}</span>
              ) : (
                <span className="hint">Shown to your team and used for your workspace URL.</span>
              )}
            </div>

            <div className="field">
              <label htmlFor="name">Your name <span className="dim">(optional)</span></label>
              <input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clear("email");
                }}
                style={errors.email ? inputErr : undefined}
                aria-invalid={!!errors.email}
              />
              {errors.email && <span style={fieldErr}>{errors.email}</span>}
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clear("password");
                }}
                style={errors.password ? inputErr : undefined}
                aria-invalid={!!errors.password}
              />
              {errors.password ? (
                <span style={fieldErr}>{errors.password}</span>
              ) : (
                <span className="hint">At least {MIN_PASSWORD_LENGTH} characters.</span>
              )}
            </div>

            <button className="btn primary" type="submit" disabled={submitting} style={submit}>
              {submitting ? "Creating workspace…" : "Create workspace"}
            </button>
          </form>
        </div>

        <p className="dim small" style={{ textAlign: "center", marginTop: 16 }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--accent)", fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "48px 20px",
};
const brand: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  justifyContent: "center",
  marginBottom: 18,
};
// Copies .brand .mark from globals.css — that rule is scoped to .sidebar's
// .brand wrapper, which this page deliberately does not use.
const mark: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 6,
  background: "var(--accent)",
  color: "#fff",
  display: "grid",
  placeItems: "center",
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: "-0.02em",
};
const h1: React.CSSProperties = { fontSize: 17, fontWeight: 600, margin: "0 0 4px", letterSpacing: "-0.01em" };
const alert: React.CSSProperties = {
  background: "var(--err-wash)",
  color: "var(--err)",
  border: "1px solid color-mix(in srgb, var(--err) 35%, transparent)",
  borderRadius: 5,
  padding: "9px 11px",
  fontSize: 12.5,
  marginBottom: 16,
};
const fieldErr: React.CSSProperties = { fontSize: 11.5, color: "var(--err)" };
const inputErr: React.CSSProperties = { borderColor: "var(--err)" };
const submit: React.CSSProperties = {
  width: "100%",
  justifyContent: "center",
  padding: "9px 12px",
  fontSize: 13,
};
