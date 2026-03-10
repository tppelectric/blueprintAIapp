"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignInPage() {
  const router = useRouter();
  const [companyId, setCompanyId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (!companyId.trim() || !email.trim() || !password) {
      setStatus("Enter company ID, email, and password.");
      return;
    }

    setBusy(true);
    setStatus("Signing in...");

    try {
      const loginResponse = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: companyId.trim(),
          email: email.trim(),
          password
        })
      });
      const loginPayload = (await loginResponse.json().catch(() => ({}))) as {
        message?: string;
        company?: { id: string; displayName: string };
        user?: { fullName: string; email: string; role: string };
      };

      if (!loginResponse.ok || !loginPayload.company || !loginPayload.user) {
        setBusy(false);
        setStatus(loginPayload.message ?? "Sign-in failed.");
        return;
      }

      const sessionResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: loginPayload.company.id,
          companyName: loginPayload.company.displayName,
          userName: loginPayload.user.fullName,
          userRole: loginPayload.user.role,
          userEmail: loginPayload.user.email
        })
      });

      if (!sessionResponse.ok) {
        const sessionPayload = (await sessionResponse.json().catch(() => ({}))) as { message?: string };
        setBusy(false);
        setStatus(sessionPayload.message ?? "Could not start session.");
        return;
      }

      setBusy(false);
      router.push("/");
      router.refresh();
    } catch (error) {
      setBusy(false);
      setStatus((error as Error).message || "Network error while signing in.");
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <section className="card card-accent">
        <h1>Company Sign In</h1>
        <p className="muted section-gap">Sign in with your company ID, user email, and password.</p>
        <div className="form-grid">
          <label className="field">
            Company ID
            <input
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
              placeholder="tpp-general-electrical"
              autoComplete="organization"
            />
          </label>
          <label className="field">
            User Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@company.com"
              autoComplete="email"
            />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </label>
        </div>
        <div className="row actions">
          <button type="button" onClick={() => void signIn()} disabled={busy}>
            Sign In
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
                return;
              }
              window.location.href = "/";
            }}
          >
            Back
          </button>
          <Link className="button-link secondary" href="/">
            Return Home
          </Link>
          <Link className="button-link secondary" href="/auth/onboarding">
            Create Company Admin
          </Link>
          <Link className="button-link secondary" href="/auth/reset-password">
            Reset Password
          </Link>
        </div>
        {status && <p className="status-text">{status}</p>}
      </section>
    </main>
  );
}
