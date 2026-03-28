import type { Metadata } from "next";
import { RequestsAdminListClient } from "@/components/requests-admin-list-client";

export const metadata: Metadata = {
  title: "Internal requests",
  description: "Admin queue for employee requests and tickets.",
};

export default function RequestsAdminPage() {
  return <RequestsAdminListClient />;
}
