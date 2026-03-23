import type { Metadata } from "next";
import { LoadCalculatorClient } from "./load-calculator-client";

export const metadata: Metadata = {
  title: "Electrical Load Calculator — Blueprint AI",
  description:
    "NEC Article 220 residential and commercial load calculator (2023 edition).",
};

export default function LoadCalculatorPage() {
  return <LoadCalculatorClient />;
}
