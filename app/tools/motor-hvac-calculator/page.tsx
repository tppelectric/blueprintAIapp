import type { Metadata } from "next";
import { MotorHvacCalculatorClient } from "./motor-hvac-calculator-client";

export const metadata: Metadata = {
  title: "Motor & HVAC Calculator — Blueprint AI",
  description:
    "NEC 430 FLA, HVAC MCA/MOCP, transformers, and generator sizing (rule-based).",
};

export default function MotorHvacCalculatorPage() {
  return <MotorHvacCalculatorClient />;
}
