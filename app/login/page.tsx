"use client";

import Link from "next/link";
import { useState } from "react";

type Errors = { form?: string; email?: string; password?: string };

/**
 * Where to go after signing in. Middleware puts the original path in ?next=.
 * It is user input, so it must be a same-site absolute path: "//evil.com" and
 * "https://evil.com" are both valid values of a redirect parameter and both
 * send our user somewhere that looks like us and asks for their password again.
 */
function safeNext(): string {
  if (typeof window === "undefined") return "/";
  const raw = new URLSearchParams(window.location.search).get("next");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const next: Errors = {};
    if (!email.trim()) next.email = "Email is required.";
    if (!password) next.password = "Password is required.";
    if (Object.keys(next).length > 0) return setErrors(next);

    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
      };

      if (!res.ok) {
        // Show the server's own words. Replacing a rate-limit or a
        // no-workspace message with "something went wrong" is how a working
        // system and a broken one become indistinguishable in a support ticket.
        setErrors({ ...(data.fields ?? {}), form: data.error ?? `Login failed (${res.status}).` });
        return;
      }

      // Hard navigation, not router.push: the session cookie has to be read by
      // the server layout, and a client-side push would render the cached
      // logged-out shell.
      window.location.assign(safeNext());
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Network error. Check your connection." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={wrap}>
      <div style={{ width: "100%", maxWidth: 372 }}>
        <div style={brand}>
          <span style={mark} aria-hidden="true">AI</span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Agent Platform</span>
        </div>

        <div className="card card-p">
          <h1 style={h1}>Sign in</h1>
          <p className="dim small" style={{ marginBottom: 18 }}>
            Welcome back. Use the email you signed up with.
          </p>

          {errors.form && <div style={alert} role="alert">{errors.form}</div>}

          {/* noValidate: our messages are the authority. Without it the browser
              cancels submit on an address it dislikes and the only feedback is a
              native tooltip that vanishes on the next click. */}
          <form onSubmit={onSubmit} noValidate>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((p) => ({ ...p, email: undefined }));
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((p) => ({ ...p, password: undefined }));
                }}
                style={errors.password ? inputErr : undefined}
                aria-invalid={!!errors.password}
              />
              {errors.password && <span style={fieldErr}>{errors.password}</span>}
            </div>

            {/* Disabled ONLY while submitting. A button greyed out because the
                form is invalid tells the visitor nothing about what is wrong. */}
            <button className="btn primary" type="submit" disabled={submitting} style={submit}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="dim small" style={{ textAlign: "center", marginTop: 16 }}>
          No account?{" "}
          <Link href="/signup" style={{ color: "var(--accent)", fontWeight: 600 }}>
            Create one
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
  opacity: 1,
};
