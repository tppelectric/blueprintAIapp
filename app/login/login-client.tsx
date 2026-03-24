"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import { TPP_COMPANY_FULL } from "@/lib/tpp-branding";
import { createBrowserClient } from "@/lib/supabase/client";

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/dashboard";
  const errQ = searchParams.get("error");
  const noticeQ = searchParams.get("notice");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    errQ ? decodeURIComponent(errQ) : null,
  );
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const sb = createBrowserClient();
        const { error: signErr } = await sb.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signErr) {
          setError(signErr.message);
          return;
        }
        const safe = nextPath.startsWith("/") ? nextPath : "/dashboard";
        router.replace(safe);
        router.refresh();
      } catch (ex) {
        setError(ex instanceof Error ? ex.message : "Sign-in failed.");
      } finally {
        setBusy(false);
      }
    },
    [email, password, nextPath, router],
  );

  const sendReset = useCallback(async () => {
    setForgotMsg(null);
    const em = forgotEmail.trim() || email.trim();
    if (!em) {
      setForgotMsg("Enter your email address.");
      return;
    }
    try {
      const sb = createBrowserClient();
      const origin = window.location.origin;
      const { error: rErr } = await sb.auth.resetPasswordForEmail(em, {
        redirectTo: `${origin}/auth/callback?next=/login`,
      });
      if (rErr) {
        setForgotMsg(rErr.message);
        return;
      }
      setForgotMsg("Check your email for a reset link.");
    } catch (ex) {
      setForgotMsg(ex instanceof Error ? ex.message : "Request failed.");
    }
  }, [email, forgotEmail]);

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-6 py-16">
      <div className="flex flex-col items-center text-center">
        <TppLogoPill size="header" />
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-white">
          Blueprint AI
        </h1>
        <p className="mt-2 text-sm font-medium text-[#E8C84A]">
          {TPP_COMPANY_FULL}
        </p>
        <p className="mt-4 max-w-sm text-sm text-white/60">
          Internal team access only. Authorized {TPP_COMPANY_FULL} personnel
          only.
        </p>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="mt-10 space-y-4 rounded-2xl border border-[#E8C84A]/25 bg-[#071422]/90 p-6 shadow-lg shadow-black/30"
      >
        <label className="block text-sm text-white/80">
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2.5 text-white"
          />
        </label>
        <label className="block text-sm text-white/80">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2.5 text-white"
          />
        </label>

        {noticeQ === "admin_created" ? (
          <p className="text-sm text-emerald-300/95" role="status">
            Admin account created. Sign in below.
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-300/95" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg border-2 border-[#E8C84A]/60 bg-[#0d2847] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#123a5c] disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign In"}
        </button>

        <button
          type="button"
          onClick={() => {
            setForgotOpen((v) => !v);
            setForgotMsg(null);
          }}
          className="w-full text-center text-sm text-[#E8C84A]/90 underline-offset-2 hover:underline"
        >
          Forgot password?
        </button>

        {forgotOpen ? (
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-left">
            <p className="text-xs text-white/60">
              We will email you a link to reset your password.
            </p>
            <input
              type="email"
              placeholder="Email for reset"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              className="mt-2 w-full rounded border border-white/15 bg-[#0a1628] px-2 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={() => void sendReset()}
              className="mt-2 text-sm font-semibold text-sky-300 hover:underline"
            >
              Send reset link
            </button>
            {forgotMsg ? (
              <p className="mt-2 text-xs text-emerald-300/90">{forgotMsg}</p>
            ) : null}
          </div>
        ) : null}
      </form>

      <p className="mt-8 text-center text-xs text-white/40">
        No public registration. Contact your administrator for access.
      </p>
      <p className="mt-4 text-center">
        <Link href="/setup" className="text-xs text-white/35 hover:text-white/55">
          First-time setup
        </Link>
      </p>
    </div>
  );
}
