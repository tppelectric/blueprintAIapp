import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginClient } from "./login-client";

export const metadata: Metadata = {
  title: "Sign In — Blueprint AI",
  description: "TPP Electric internal access",
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="p-16 text-center text-sm text-white/60">Loading…</div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
