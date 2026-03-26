import type { Metadata } from "next";
import { TeamClockPageClient } from "@/components/team-clock-page-client";

export const metadata: Metadata = {
  title: "Team Time Clock",
  description: "Live team punch status and history for administrators.",
};

export default function TeamClockPage() {
  return <TeamClockPageClient />;
}
