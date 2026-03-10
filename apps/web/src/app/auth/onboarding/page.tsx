"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ValidationIssues = {
  fieldErrors?: Record<string, string[] | undefined>;
  formErrors?: string[];
};

export default function OnboardingPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  function formatValidationMessage(issues: ValidationIssues | undefined): string {
    if (!issues) {
      return "";
    }
    const lines: string[] = [];
    for (const [field, entries] of Object.entries(issues.fieldErrors ?? {})) {
      if (entries && entries.length > 0) {
        lines.push(`${field}: ${entries.join(", ")}`);
      }
    }
    for (const formError of issues.formErrors ?? []) {
      lines.push(formError);
    }
    return lines.join(" | ");
  }

  async function onboard() {
    if (!companyName.trim() || !fullName.trim() || !email.trim() || password.length < 10) {
      setStatus("Please complete all required fields. Password must be at least 10 characters.");
      return;
    }

    setBusy(true);
    setStatus("Creating company admin...");

    const response = await fetch("/api/auth/onboard-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: companyName.trim(),
        companyId: companyId.trim() || undefined,
        fullName: fullName.trim(),
        email: email.trim(),
        password
      })
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      issues?: ValidationIssues;
      company?: { id: string; displayName: string };
      user?: { fullName: string; email: string; role: string };
    };

    if (!response.ok || !payload.company || !payload.user) {
      setBusy(false);
      const validation = formatValidationMessage(payload.issues);
      setStatus(validation || payload.message || "Could not create company admin.");
      return;
    }

    const sessionResponse = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: payload.company.id,
        companyName: payload.company.displayName,
        userName: payload.user.fullName,
        userRole: payload.user.role,
        userEmail: payload.user.email
      })
    });

    if (!sessionResponse.ok) {
      const sessionPayload = (await sessionResponse.json().catch(() => ({}))) as { message?: string };
      setBusy(false);
      setStatus(sessionPayload.message ?? "Company created but session setup failed.");
      return;
    }

    setBusy(false);
    router.push("/");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 860, margin: "2rem auto", padding: "0 1rem" }}>
      <section className="card card-accent">
        <h1>Admin Onboarding</h1>
        <p className="muted section-gap">
          Company creation is restricted to admin onboarding. This creates the company and the first admin account.
        </p>
        <div className="form-grid">
          <label className="field">
            Company Name
            <input
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="TPP General & Electrical Contractors, Inc"
            />
          </label>
          <label className="field">
            Company ID (Optional)
            <input
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
              placeholder="tpp-general-electrical"
            />
          </label>
          <label className="field">
            Admin Full Name
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Owner / Admin Name" />
          </label>
          <label className="field">
            Admin Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@company.com" />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 10 characters"
              autoComplete="new-password"
            />
          </label>
        </div>
        <div className="row actions">
          <button type="button" onClick={() => void onboard()} disabled={busy}>
            Create Company Admin
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
          <Link className="button-link secondary" href="/auth/sign-in">
            Back to Sign In
          </Link>
        </div>
        {status && <p className="status-text">{status}</p>}
      </section>
    </main>
  );
}
