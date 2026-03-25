import type { Metadata } from "next";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = {
  title: "Project Dashboard — Blueprint AI",
  description:
    "Project dashboard: view and open your uploaded electrical blueprint projects.",
};

export default function DashboardPage() {
  return <DashboardClient />;
}
