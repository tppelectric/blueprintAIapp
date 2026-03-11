"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

type NavItem = { href: string; label: string; tag: string };
type NavSection = { title: string; items: NavItem[] };
type ThemeMode = "dark" | "light";
const THEME_STORAGE_KEY = "blueprint-theme";

function withJobQuery(href: string, jobId: string | null): string {
  if (!jobId) {
    return href;
  }
  if (!href.startsWith("/projects/") || href.includes("/jobs/")) {
    return href;
  }
  return `${href}?jobId=${encodeURIComponent(jobId)}`;
}

function AppShellContent({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectMatch = pathname.match(/\/projects\/([^/]+)/);
  const pathJobMatch = pathname.match(/\/projects\/[^/]+\/jobs\/([^/?]+)/);
  const activeProjectId = projectMatch?.[1] ?? null;
  const activeJobId = searchParams.get("jobId") ?? pathJobMatch?.[1] ?? null;
  const isInProject = Boolean(activeProjectId);
  const isInJob = Boolean(activeProjectId && activeJobId);
  const isHomePage = pathname === "/";
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [session, setSession] = useState<{
    signedIn: boolean;
    companyId: string | null;
    companyName: string | null;
    userName: string | null;
    userRole: string | null;
    userEmail: string | null;
  }>({
    signedIn: false,
    companyId: null,
    companyName: null,
    userName: null,
    userRole: null,
    userEmail: null
  });

  useEffect(() => {
    const savedTheme =
      typeof window !== "undefined" ? (window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null) : null;
    const preferredTheme =
      typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    const initialTheme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : preferredTheme;
    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          signedIn?: boolean;
          companyId?: string | null;
          companyName?: string | null;
          userName?: string | null;
          userRole?: string | null;
          userEmail?: string | null;
        };
        if (cancelled) {
          return;
        }
        setSession({
          signedIn: Boolean(payload.signedIn),
          companyId: payload.companyId ?? null,
          companyName: payload.companyName ?? null,
          userName: payload.userName ?? null,
          userRole: payload.userRole ?? null,
          userEmail: payload.userEmail ?? null
        });
      } catch {
        if (cancelled) {
          return;
        }
        setSession({
          signedIn: false,
          companyId: null,
          companyName: null,
          userName: null,
          userRole: null,
          userEmail: null
        });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

  async function signOut() {
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } finally {
      setSession({
        signedIn: false,
        companyId: null,
        companyName: null,
        userName: null,
        userRole: null,
        userEmail: null
      });
      window.location.href = "/auth/sign-in";
    }
  }

  const mainSections: NavSection[] = [
    {
      title: "Main Navigation",
      items: [
        { href: "/", label: "Dashboard", tag: "Home" },
        { href: "/projects", label: "Projects", tag: "PM" },
        { href: "/platform/load-calculator", label: "Load Calculator", tag: "NEC" },
        { href: "/platform/wifi-analyzer", label: "WiFi Analyzer", tag: "WIFI" },
        { href: "/platform/fixture-library", label: "Fixture Library", tag: "CAT" },
        { href: "/platform/tools", label: "General Tools", tag: "Tools" },
        { href: "/company/settings", label: "Settings", tag: "Admin" }
      ]
    }
  ];

  const projectSections: NavSection[] = isInProject
    ? [
        {
          title: "Project Menu",
          items: [
            { href: `/projects/${activeProjectId}`, label: "Project Dashboard", tag: "P" },
            { href: `/projects/${activeProjectId}#jobs`, label: "Jobs", tag: "J" },
            { href: `/projects/${activeProjectId}/import`, label: "Plans", tag: "PL" },
            { href: `/projects/${activeProjectId}/takeoff`, label: "Takeoffs", tag: "TO" },
            { href: `/projects/${activeProjectId}/panel-schedule`, label: "Load Calculations", tag: "LC" },
            { href: `/projects/${activeProjectId}/estimate`, label: "Estimates", tag: "EST" },
            { href: `/projects/${activeProjectId}/export`, label: "Reports", tag: "RPT" }
          ]
        }
      ]
    : [];

  const jobSections: NavSection[] = isInJob
    ? [
        {
          title: "Job Menu",
          items: [
            { href: `/projects/${activeProjectId}/jobs/${activeJobId}`, label: "Job Workspace", tag: "WS" },
            { href: `/projects/${activeProjectId}/import`, label: "Scan Plans", tag: "AI" },
            { href: `/projects/${activeProjectId}/takeoff`, label: "Takeoffs", tag: "TO" },
            { href: `/projects/${activeProjectId}/panel-schedule`, label: "Load Calculations", tag: "LC" },
            { href: `/projects/${activeProjectId}/estimate`, label: "Estimates", tag: "EST" },
            { href: `/projects/${activeProjectId}/export`, label: "Reports", tag: "RPT" }
          ]
        }
      ]
    : [];

  const navSections = [...mainSections, ...projectSections, ...jobSections].map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      href: withJobQuery(item.href, activeJobId)
    }))
  }));

  return (
    <div className="layout-root">
      <aside className="sidebar">
        <div className="sidebar-header">
          <p className="brand-kicker">TPP GENERAL & ELECTRICAL CONTRACTORS, INC</p>
          <h2>Blueprint AI Control</h2>
          <p className="muted">Estimating, code review, plan scanning, and utility workflow in one surface.</p>
          <div className="sidebar-banner">
            <span className="subtle-badge">NEC 2023</span>
            <span className="subtle-badge">Central Hudson</span>
            <span className="subtle-badge">NYSEG</span>
          </div>
        </div>
        <nav className="nav" aria-label="Sidebar Navigation">
          {navSections.map((section) => (
            <section key={section.title} className="nav-section">
              <p className="nav-section-title">{section.title}</p>
              <div className="nav-section-links">
                {section.items.map((item) => {
                  const itemPath = item.href.split("?")[0].split("#")[0];
                  const active = pathname === itemPath;
                  return (
                    <Link key={item.href} href={item.href} className={active ? "nav-link active" : "nav-link"}>
                      <span>{item.label}</span>
                      <span className="nav-tag">{item.tag}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
        <div className="sidebar-footer">
          <p className="muted">Workspace</p>
          <p>{session.companyName ?? "Local development mode"}</p>
          {activeProjectId && (
            <>
              <p className="muted section-gap">Project</p>
              <p>{activeProjectId}</p>
              {activeJobId && (
                <>
                  <p className="muted section-gap">Job</p>
                  <p>{activeJobId}</p>
                  <Link className="button-link secondary" href={`/projects/${activeProjectId}/jobs/${activeJobId}`}>
                    Open Job Workspace
                  </Link>
                </>
              )}
            </>
          )}
          <div className="theme-panel">
            <p className="muted section-gap">Display Mode</p>
            <div className="theme-toggle" role="group" aria-label="Theme mode">
              <button
                type="button"
                className={theme === "dark" ? "theme-option active" : "theme-option"}
                onClick={() => setTheme("dark")}
              >
                Dark
              </button>
              <button
                type="button"
                className={theme === "light" ? "theme-option active" : "theme-option"}
                onClick={() => setTheme("light")}
              >
                Light
              </button>
            </div>
          </div>
        </div>
      </aside>

      <section className="content">
        <header className="page-header">
          <div className="page-heading">
            <p className="page-kicker">AI Blueprint Scan App</p>
            <h1>{title}</h1>
          </div>
          <div className="row header-actions">
            {isInJob && activeProjectId && activeJobId && (
              <>
                <Link className="button-link secondary" href={`/projects/${activeProjectId}/jobs/${activeJobId}`}>
                  Return to Job Workspace
                </Link>
                <Link className="button-link secondary" href={`/projects/${activeProjectId}`}>
                  Back to Project Dashboard
                </Link>
              </>
            )}
            {isInProject && activeProjectId && (
              <Link className="button-link secondary" href="/projects">
                Back to Projects
              </Link>
            )}
            {!isHomePage && (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    if (typeof window !== "undefined" && window.history.length > 1) {
                      window.history.back();
                      return;
                    }
                    window.location.href = "/";
                  }}
                >
                  Back
                </button>
                <Link className="button-link secondary" href="/">
                  Return Home
                </Link>
              </>
            )}
            <div className="header-chip">
              Company: {session.companyName ?? "Not signed in"}
              {session.companyId ? ` (${session.companyId})` : ""}
            </div>
            {session.signedIn && (
              <div className="header-chip">
                User: {session.userName ?? "Unknown"} {session.userRole ? `(${session.userRole})` : ""}
              </div>
            )}
            {session.signedIn ? (
              <button type="button" className="secondary" onClick={() => void signOut()}>
                Sign Out
              </button>
            ) : (
              <Link className="button-link secondary" href="/auth/sign-in">
                Sign In
              </Link>
            )}
          </div>
        </header>
        {children}
      </section>
    </div>
  );
}

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Suspense fallback={<div className="layout-root"><section className="content"><header className="page-header"><div className="page-heading"><p className="page-kicker">AI Blueprint Scan App</p><h1>{title}</h1></div></header>{children}</section></div>}>
      <AppShellContent title={title}>{children}</AppShellContent>
    </Suspense>
  );
}
