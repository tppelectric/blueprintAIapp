import type { Metadata } from "next";
import { Suspense } from "react";
import { DailyLogsNewClient } from "@/components/daily-logs-new-client";

export const metadata: Metadata = {
  title: "New daily log",
  description: "Create a JobTread-style daily field log.",
};

function NewLogFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center text-white/50">
      Loading…
    </div>
  );
}

export default function NewDailyLogPage() {
  return (
    <Suspense fallback={<NewLogFallback />}>
      <DailyLogsNewClient />
    </Suspense>
  );
}
