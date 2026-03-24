import type { Metadata } from "next";
import { SetupClient } from "./setup-client";

export const metadata: Metadata = {
  title: "Initial Setup — Blueprint AI",
  robots: { index: false, follow: false },
};

export default function SetupPage() {
  return <SetupClient />;
}
