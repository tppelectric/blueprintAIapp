import type { Metadata } from "next";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = {
  title: "My Projects — Blueprint AI",
  description: "View your uploaded electrical blueprint projects.",
};

export default function DashboardPage() {
  return <DashboardClient />;
}
