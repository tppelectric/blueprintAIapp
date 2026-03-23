import type { Metadata } from "next";
import { WifiAnalyzerClient } from "./wifi-analyzer-client";

export const metadata: Metadata = {
  title: "Wi-Fi Analyzer — Blueprint AI",
  description:
    "Coverage planning, AP counts, and low-voltage takeoff for Wi-Fi installations.",
};

export default function WifiAnalyzerPage() {
  return <WifiAnalyzerClient />;
}
