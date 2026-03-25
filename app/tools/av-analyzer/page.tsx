import type { Metadata } from "next";
import { AvAnalyzerClient } from "./av-analyzer-client";

export const metadata: Metadata = {
  title: "AV Analyzer — Blueprint AI",
  description:
    "Audio/video system planning, speaker counts, display sizing, and project breakdown.",
};

export default function AvAnalyzerPage() {
  return <AvAnalyzerClient />;
}
