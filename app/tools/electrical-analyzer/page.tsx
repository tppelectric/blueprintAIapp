import type { Metadata } from "next";
import { ElectricalAnalyzerClient } from "./electrical-analyzer-client";

export const metadata: Metadata = {
  title: "Electrical Project Analyzer — Blueprint AI",
  description:
    "Room-by-room electrical planning, NEC-oriented estimates, panel schedule, and project breakdown.",
};

export default function ElectricalAnalyzerPage() {
  return <ElectricalAnalyzerClient />;
}
