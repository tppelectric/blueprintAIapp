"use client";

import Link from "next/link";
import { useState } from "react";

export default function ResetPasswordPage() {
  const [companyId, setCompanyId] = useState("");
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestReset() {
    setBusy(true);
    setStatus("Requesting reset token...");
    const response = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: companyId.trim(),
        email: email.trim()
      })
    });
    const payload = (await response.json().catch(() => ({}))) as { message?: string; resetToken?: string | null };
    if (!response.ok) {
      setBusy(false);
      setStatus(payload.message ?? "Could not request reset token.");
      return;
    }

    if (payload.resetToken) {
      setResetToken(payload.resetToken);
      setStatus("Reset token created. Use it below to set a new password.");
    } else {
      setStatus(payload.message ?? "If the account exists, a reset token has been created.");
    }
    setBusy(false);
  }

  async function confirmReset() {
    setBusy(true);
    setStatus("Updating password...");
    const response = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: companyId.trim(),
        email: email.trim(),
        resetToken: resetToken.trim(),
        newPassword
      })
    });
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setBusy(false);
      setStatus(payload.message ?? "Could not reset password.");
      return;
    }
    setBusy(false);
    setStatus(payload.message ?? "Password updated successfully.");
  }

  return (
    <main style={{ maxWidth: 840, margin: "2rem auto", padding: "0 1rem" }}>
      <section className="card card-accent">
        <h1>Reset Password</h1>
        <p className="muted section-gap">Request a reset token, then set a new password.</p>
        <div className="form-grid">
          <label className="field">
            Company ID
            <input value={companyId} onChange={(event) => setCompanyId(event.target.value)} />
          </label>
          <label className="field">
            User Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
        </div>
        <div className="row actions">
          <button type="button" onClick={() => void requestReset()} disabled={busy}>
            Request Reset Token
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
        </div>
      </section>

      <section className="card section-gap">
        <h3>Confirm New Password</h3>
        <div className="form-grid">
          <label className="field">
            Reset Token
            <input value={resetToken} onChange={(event) => setResetToken(event.target.value)} />
          </label>
          <label className="field">
            New Password
            <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </label>
        </div>
        <div className="row actions">
          <button type="button" onClick={() => void confirmReset()} disabled={busy}>
            Set New Password
          </button>
          <Link className="button-link secondary" href="/auth/sign-in">
            Back to Sign In
          </Link>
        </div>
        {status && <p className="status-text">{status}</p>}
      </section>
    </main>
  );
}
