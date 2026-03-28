import type { Metadata } from "next";
import { LicensesNewClient } from "@/components/licenses-new-client";

export const metadata: Metadata = {
  title: "New license",
  description: "Add a company or employee license or certification.",
};

export default function LicensesNewPage() {
  return <LicensesNewClient />;
}
