"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import { TPP_COMPANY_FULL } from "@/lib/tpp-branding";
import { createBrowserClient } from "@/lib/supabase/client";

export function ResetPasswordClient() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = createBrowserClient();
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!cancelled) {
        setHasSession(Boolean(session));
        setSessionReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
      setBusy(true);
      try {
        const sb = createBrowserClient();
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (!session) {
          setError("This link is invalid or has expired. Request a new reset email.");
          return;
        }
        const { error: upErr } = await sb.auth.updateUser({ password });
        if (upErr) {
          setError(upErr.message);
          return;
        }
        router.refresh();
        router.push("/dashboard");
      } catch (ex) {
        setError(ex instanceof Error ? ex.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
    },
    [password, confirm, router],
  );

  if (!sessionReady) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col px-6 py-16 text-center text-sm text-white/60">
        Loading…
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col px-6 py-16">
        <div className="flex flex-col items-center text-center">
          <TppLogoPill size="header" />
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-white">
            Reset link needed
          </h1>
          <p className="mt-4 text-sm text-white/65">
            Open the password reset link from your email, or request a new one
            from the sign-in page.
          </p>
          <Link
            href="/login"
            className="mt-6 text-sm font-semibold text-[#E8C84A] hover:underline"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-6 py-16">
      <div className="flex flex-col items-center text-center">
        <TppLogoPill size="header" />
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-white">
          Set new password
        </h1>
        <p className="mt-2 text-sm font-medium text-[#E8C84A]">
          {TPP_COMPANY_FULL}
        </p>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="mt-10 space-y-4 rounded-2xl border border-[#E8C84A]/25 bg-[#071422]/90 p-6 shadow-lg shadow-black/30"
      >
        {error ? (
          <p className="rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        <label className="block text-sm text-white/80">
          New password
          <input
            type="password"
            autoComplete="new-password"
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
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2.5 text-white"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-[#E8C84A] py-3 text-sm font-bold text-[#0a1628] disabled:opacity-50"
        >
          {busy ? "Saving…" : "Update password"}
        </button>
        <p className="text-center text-sm text-white/55">
          <Link href="/login" className="text-[#E8C84A] hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
