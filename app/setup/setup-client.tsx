"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import { TPP_COMPANY_FULL } from "@/lib/tpp-branding";

export function SetupClient() {
  const router = useRouter();
  const [open, setOpen] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/setup-status")
      .then((r) => r.json())
      .then((j: { open?: boolean }) => {
        if (!cancelled) setOpen(Boolean(j.open));
      })
      .catch(() => {
        if (!cancelled) setOpen(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (open === false) {
      router.replace("/login");
    }
  }, [open, router]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/setup-first-admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        const j = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(j.error ?? "Setup failed.");
          return;
        }
        router.replace("/login?notice=admin_created");
      } catch (ex) {
        setError(ex instanceof Error ? ex.message : "Setup failed.");
      } finally {
        setBusy(false);
      }
    },
    [email, password, confirm, router],
  );

  if (open === null) {
    return (
      <div className="flex min-h-full items-center justify-center p-8 text-white/60">
        Checking setup…
      </div>
    );
  }

  if (!open) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-white/80">Redirecting to sign in…</p>
        <Link href="/login" className="text-[#E8C84A] underline">
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-6 py-16">
      <div className="flex flex-col items-center text-center">
        <TppLogoPill size="header" />
        <h1 className="mt-6 text-xl font-bold text-white">First admin account</h1>
        <p className="mt-2 text-sm text-[#E8C84A]">{TPP_COMPANY_FULL}</p>
        <p className="mt-4 text-sm text-white/60">
          This page is available only when no users exist. After you create the
          first account, setup closes permanently.
        </p>
      </div>

      <form
        onSubmit={(e) => void submit(e)}
        className="mt-10 space-y-4 rounded-2xl border border-[#E8C84A]/25 bg-[#071422]/90 p-6"
      >
        <label className="block text-sm text-white/80">
          Admin email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2.5 text-white"
          />
        </label>
        <label className="block text-sm text-white/80">
          Password (min 8 characters)
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2.5 text-white"
          />
        </label>
        <label className="block text-sm text-white/80">
          Confirm password
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2.5 text-white"
          />
        </label>
        {error ? (
          <p className="text-sm text-red-300/95" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-[#E8C84A] py-3 text-sm font-bold text-[#0a1628] disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create admin & lock setup"}
        </button>
      </form>

      <p className="mt-8 text-center">
        <Link href="/login" className="text-sm text-white/50 hover:text-white/75">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
