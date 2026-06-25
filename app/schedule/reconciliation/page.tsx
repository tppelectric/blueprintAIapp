import type { Metadata } from "next";
import { ScheduleReconciliationClient } from "@/components/schedule-reconciliation-client";

export const metadata: Metadata = {
  title: "Reconciliation — Blueprint AI",
  description: "Scheduled crew vs actual clocked hours.",
};

export default function ScheduleReconciliationPage() {
  return <ScheduleReconciliationClient />;
}
