"use client";

import { ThemeProvider } from "@/lib/theme-context";
import { FloatingCalculatorWidget } from "@/components/floating-calculator-widget";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {children}
      <FloatingCalculatorWidget />
    </ThemeProvider>
  );
}
