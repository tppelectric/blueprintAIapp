"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "blueprint-ai-theme";

export type ThemeMode = "dark" | "light";

type Ctx = {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<Ctx | null>(null);

function readStored(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" ? "light" : "dark";
}

function applyDom(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = readStored();
    setThemeState(t);
    applyDom(t);
    setReady(true);
  }, []);

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    applyDom(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      applyDom(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme: ready ? theme : "dark",
      setTheme,
      toggleTheme,
    }),
    [theme, ready, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "dark" as ThemeMode,
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}

/** Page root wrapper classes (tool pages, etc.). */
export function useThemedPageShell() {
  const { theme } = useTheme();
  return theme === "light"
    ? "min-h-screen bg-slate-100 text-slate-900 antialiased"
    : "min-h-screen bg-[#0a1628] text-white antialiased";
}
