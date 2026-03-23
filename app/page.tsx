import Link from "next/link";

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
      </main>
    </div>
  );
}
