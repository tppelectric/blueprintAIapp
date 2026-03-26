import type { Metadata } from "next";
import { Suspense } from "react";
import { FieldClient } from "./field-client";

export const metadata: Metadata = {
  title: "Time Clock — Blueprint AI",
  description: "Punch in and out for field time tracking.",
};

export default function FieldPage() {
  return (
    <Suspense
      fallback={
        <div className="app-page-shell p-10 text-[var(--foreground-muted)]">
          Loading…
        </div>
      }
    >
      <FieldClient />
    </Suspense>
  );
}
