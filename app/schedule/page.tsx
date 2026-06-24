import type { Metadata } from "next";
import { ScheduleClient } from "@/components/schedule-client";

export const metadata: Metadata = {
  title: "Schedule — Blueprint AI",
  description: "Assign crew to jobs by day.",
};

export default function SchedulePage() {
  return <ScheduleClient />;
}
