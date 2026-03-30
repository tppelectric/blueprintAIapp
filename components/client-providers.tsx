"use client";

import { ThemeProvider } from "@/lib/theme-context";
import { FloatingAIAssistant } from "@/components/floating-ai-assistant";
import { FloatingCalculatorWidget } from "@/components/floating-calculator-widget";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { UserRoleProvider } from "@/components/user-role-provider";
import { ToastProvider } from "@/components/toast-provider";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <UserRoleProvider>
          <div className="app-mobile-main-pad flex min-h-full flex-1 flex-col">
            {children}
          </div>
          <MobileBottomNav />
          <FloatingCalculatorWidget />
          <FloatingAIAssistant />
        </UserRoleProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
