import type { Metadata } from "next";
import { LicensesListClient } from "@/components/licenses-list-client";

export const metadata: Metadata = {
  title: "Licenses & certifications",
  description: "Company and employee license tracking, CE, and renewals.",
};

export default function LicensesPage() {
  return <LicensesListClient />;
}
