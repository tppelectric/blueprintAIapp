import type { Metadata } from "next";
import { SmartHomeAnalyzerClient } from "./smarthome-analyzer-client";

export const metadata: Metadata = {
  title: "Smart Home Analyzer — Blueprint AI",
  description:
    "Automation and control system planning with device takeoff and network guidance.",
};

export default function SmartHomeAnalyzerPage() {
  return <SmartHomeAnalyzerClient />;
}
