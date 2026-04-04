import { Suspense } from "react";
import type { Metadata } from "next";
import { CrewsAdminClient } from "./crews-admin-client";

export const metadata: Metadata = {
  title: "Crew Management",
};

export default function AdminCrewsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0a1628] text-white/50">
          Loading…
        </div>
      }
    >
      <CrewsAdminClient />
    </Suspense>
  );
}
