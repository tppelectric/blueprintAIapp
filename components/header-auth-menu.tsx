"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

export function HeaderAuthMenu() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb = createBrowserClient();
    let cancelled = false;
    void sb.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setEmail(data.session?.user?.email ?? null);
        setReady(true);
      }
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    if (
      !window.confirm(
        "Sign out of Blueprint AI? You will need to sign in again to continue.",
      )
    ) {
      return;
    }
    const sb = createBrowserClient();
    await sb.auth.signOut();
    window.location.href = "/login";
  }, []);

  if (!ready) {
    return (
      <div
        className="h-8 w-20 animate-pulse rounded bg-white/10"
        aria-hidden
      />
    );
  }

  if (!email) {
    return null;
  }

  return (
    <div className="flex max-w-[14rem] flex-col items-end gap-1 text-right sm:max-w-xs">
      <span
        className="truncate text-xs text-white/70"
        title={email}
      >
        {email}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        className="rounded border border-[#E8C84A]/40 bg-[#071422] px-2 py-1 text-[11px] font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/10"
      >
        Sign Out
      </button>
    </div>
  );
}
