import type { Metadata } from "next";
import { TimeOffClient } from "@/components/time-off-client";

export const metadata: Metadata = {
  title: "Time off",
  description: "Request PTO and manage team time off approvals.",
};

export default function TimeOffPage() {
  return <TimeOffClient />;
}
