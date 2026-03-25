import type { Metadata } from "next";
import { DailyLogsClient } from "@/components/daily-logs-client";

export const metadata: Metadata = {
  title: "Daily logs",
  description:
    "Job daily logs: list, filter, import JobTread CSV, export, and hours summary.",
};

export default function DailyLogsPage() {
  return <DailyLogsClient />;
}
