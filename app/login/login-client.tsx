"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { TppLogoPill } from "@/components/tpp-logo-pill";
import { TPP_COMPANY_FULL } from "@/lib/tpp-branding";
import { createBrowserClient } from "@/lib/supabase/client";
import { resolvePostLoginRedirect } from "@/lib/post-login-redirect";

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const postLoginPath = resolvePostLoginRedirect(searchParams.get("next"));
  const errQ = searchParams.get("error");
  const noticeQ = searchParams.get("notice");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusHint, setStatusHint] = useState<string | null>(null);
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
      setStatusHint(null);
      const trimmedEmail = email.trim();
      const safe = postLoginPath;

      const sleep = (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms));

      let leaveBusyUntilNavigate = false;
      try {
        const sb = createBrowserClient();
        if (process.env.NODE_ENV === "development") {
          console.log("Sign in attempt:", trimmedEmail);
        }

        let data: Awaited<
          ReturnType<typeof sb.auth.signInWithPassword>
        >["data"] | null = null;
        let signErr: Awaited<
          ReturnType<typeof sb.auth.signInWithPassword>
        >["error"] | null = null;

        for (let attempt = 1; attempt <= 2; attempt++) {
          if (attempt === 2) {
            setStatusHint("Retrying…");
          }

          const res = await sb.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          });
          data = res.data;
          signErr = res.error;

          if (process.env.NODE_ENV === "development") {
            console.log("Full Supabase signInWithPassword response:", res);
            console.log("Auth response summary:", {
              hasSession: Boolean(res.data?.session),
              userId: res.data?.session?.user?.id ?? null,
              error: res.error,
            });
          }

          if (signErr) {
            setError(signErr.message || "Sign-in failed.");
            return;
          }

          if (res.data?.session) {
            break;
          }

          if (attempt === 1) {
            continue;
          }

          setError("Login failed — please try again");
          return;
        }

        if (!data?.session) {
          setError("Login failed — please try again");
          return;
        }

        setStatusHint(null);
        router.refresh();
        await sleep(500);
        router.push(safe);
        leaveBusyUntilNavigate = true;
      } catch (ex) {
        const msg =
          ex instanceof Error ? ex.message : "Sign-in failed unexpectedly.";
        if (process.env.NODE_ENV === "development") {
          console.error("Sign-in exception:", ex);
        }
        setError(msg);
      } finally {
        setStatusHint(null);
        if (!leaveBusyUntilNavigate) {
          setBusy(false);
        }
      }
    },
    [email, password, postLoginPath, router],
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
        redirectTo: `${origin}/auth/callback?next=/reset-password`,
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
          <div className="relative mt-1">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2.5 pr-11 text-white"
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                  <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                  <line x1="2" x2="22" y1="2" y2="22" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </label>

        {noticeQ === "admin_created" ? (
          <p className="text-sm text-emerald-300/95" role="status">
            Admin account created. Sign in below.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg border-2 border-[#E8C84A]/60 bg-[#0d2847] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#123a5c] disabled:opacity-50"
        >
          {busy
            ? statusHint === "Retrying…"
              ? "Retrying…"
              : "Signing in…"
            : "Sign In"}
        </button>

        {statusHint && !error ? (
          <p className="text-center text-sm text-amber-200/90" role="status">
            {statusHint}
          </p>
        ) : null}

        {error ? (
          <p
            className="text-center text-sm font-medium text-red-400"
            role="alert"
          >
            {error}
          </p>
        ) : null}

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
