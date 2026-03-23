import Link from "next/link";

function LightningIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z" />
    </svg>
  );
}

function BookCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      <path d="m9 10 2 2 4-4" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-white/10 bg-[#071422]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 sm:px-8">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold tracking-tight text-white">
              Blueprint AI
            </span>
            <span className="hidden text-sm font-medium text-white/55 sm:inline">
              Electrical contractors
            </span>
          </div>
          <nav
            className="flex items-center gap-6 text-sm font-medium text-white/75 sm:gap-8"
            aria-label="Primary"
          >
            <Link
              href="/dashboard"
              className="transition-colors hover:text-white"
            >
              Dashboard
            </Link>
            <a href="#product" className="transition-colors hover:text-white">
              Product
            </a>
            <a href="#contact" className="transition-colors hover:text-white">
              Contact
            </a>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center sm:py-24">
        <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
          Blueprint AI - Electrical Takeoff System
        </h1>
        <Link
          href="/upload"
          className="mt-10 inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-base font-semibold text-[#0a1628] shadow-sm transition-colors hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
        >
          Start New Project
        </Link>

        <div className="mx-auto mt-14 grid w-full max-w-3xl gap-4 sm:grid-cols-2 sm:gap-5">
          <Link
            href="/tools/load-calculator"
            className="group flex flex-col rounded-2xl border border-white/12 bg-white/[0.04] p-6 text-left shadow-sm transition-colors hover:border-sky-500/35 hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400/50"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/25 transition-colors group-hover:bg-sky-500/25">
              <LightningIcon className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-white">
              Load Calculator
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              Size your electrical service per NEC Article 220
            </p>
            <span className="mt-4 text-sm font-medium text-sky-300/95 group-hover:text-sky-200">
              Open tool →
            </span>
          </Link>

          <Link
            href="/tools/nec-checker"
            className="group flex flex-col rounded-2xl border border-white/12 bg-white/[0.04] p-6 text-left shadow-sm transition-colors hover:border-violet-500/35 hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400/50"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/25 transition-colors group-hover:bg-violet-500/25">
              <BookCheckIcon className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-white">
              NEC Code Checker
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              Check NEC 2023 compliance and get instant code answers
            </p>
            <span className="mt-4 text-sm font-medium text-violet-300/95 group-hover:text-violet-200">
              Open tool →
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
