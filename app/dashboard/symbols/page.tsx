import type { Metadata } from "next";
import { SymbolsClient } from "./symbols-client";

export const metadata: Metadata = {
  title: "Symbol Library — Blueprint AI",
  description: "Reusable captured symbols across projects.",
};

export default function SymbolsPage() {
  return <SymbolsClient />;
}
