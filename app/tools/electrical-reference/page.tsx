import type { Metadata } from "next";
import { ElectricalReferenceClient } from "./electrical-reference-client";

export const metadata: Metadata = {
  title: "Electrical Reference — Blueprint AI",
  description:
    "Wire ampacity, conduit fill, voltage drop, and NEC-oriented cheat sheets (field reference).",
};

export default function ElectricalReferencePage() {
  return <ElectricalReferenceClient />;
}
