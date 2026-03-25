import type { Metadata } from "next";
import { WorkCalendarClient } from "@/components/work-calendar-client";

export const metadata: Metadata = {
  title: "Work calendar",
  description: "Team work and time off calendar.",
};

export default function WorkCalendarPage() {
  return <WorkCalendarClient />;
}
