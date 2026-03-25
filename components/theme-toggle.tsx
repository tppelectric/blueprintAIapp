"use client";

import { useTheme } from "@/lib/theme-context";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`rounded-lg border border-[#E8C84A]/40 bg-[#071422]/80 px-2.5 py-1.5 text-sm text-[#E8C84A] transition-colors hover:bg-[#E8C84A]/15 ${className}`}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
