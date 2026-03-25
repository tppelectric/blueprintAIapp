import type { Metadata } from "next";
import { TimesheetsClient } from "@/components/timesheets-client";

export const metadata: Metadata = {
  title: "Timesheets",
  description: "Weekly timesheets, approvals, and payroll export.",
};

export default function TimesheetsPage() {
  return <TimesheetsClient />;
}
