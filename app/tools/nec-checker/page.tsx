import type { Metadata } from "next";
import { NecCheckerClient } from "./nec-checker-client";

export const metadata: Metadata = {
  title: "NEC Code Checker — Blueprint AI",
  description:
    "NEC 2023 checklist for receptacles, AFCI, kitchen, bathrooms, service, and EV charging.",
};

export default function NecCheckerPage() {
  return <NecCheckerClient />;
}
