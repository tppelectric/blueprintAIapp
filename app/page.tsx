import Link from "next/link";
import { HomeMarketingHeader } from "@/components/home-marketing-header";

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

function WifiIcon({ className }: { className?: string }) {
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
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}

function SpeakerIcon({ className }: { className?: string }) {
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
      <path d="M12 6H8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4l6 4V2l-6 4Z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M17.66 6.34a8 8 0 0 1 0 11.32" />
    </svg>
  );
}

function SmartHomeIcon({ className }: { className?: string }) {
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
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" />
      <path d="M12 9v3" />
      <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <HomeMarketingHeader />

      <main
        id="product"
        className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center sm:py-24"
      >
        <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
          Blueprint AI — Electrical Takeoff System
        </h1>
        <p className="mt-4 max-w-xl text-sm text-white/50">
          Est. 1982 · Powered by Blueprint AI
        </p>
        <Link
          href="/upload"
          className="mt-10 inline-flex items-center justify-center rounded-lg border-2 border-[#E8C84A]/60 bg-[#E8C84A] px-6 py-3 text-base font-semibold text-[#0a1628] shadow-sm transition-colors hover:bg-[#f0d56e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8C84A]"
        >
          Start New Project
        </Link>

        <div className="mx-auto mt-14 grid w-full max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-5">
          <Link
            href="/tools/load-calculator"
            className="group flex flex-col rounded-2xl border border-white/12 bg-white/[0.04] p-6 text-left shadow-sm transition-colors hover:border-[#E8C84A] hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8C84A]/50"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300 ring-1 ring-[#E8C84A]/20 transition-colors group-hover:bg-sky-500/25 group-hover:ring-[#E8C84A]/50">
              <LightningIcon className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-white">
              Load Calculator
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              Size your electrical service per NEC Article 220
            </p>
            <span className="mt-4 text-sm font-medium text-[#E8C84A] group-hover:text-[#f0d56e]">
              Open tool →
            </span>
          </Link>

          <Link
            href="/tools/nec-checker"
            className="group flex flex-col rounded-2xl border border-white/12 bg-white/[0.04] p-6 text-left shadow-sm transition-colors hover:border-[#E8C84A] hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8C84A]/50"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200 ring-1 ring-[#E8C84A]/20 transition-colors group-hover:bg-violet-500/25 group-hover:ring-[#E8C84A]/50">
              <BookCheckIcon className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-white">
              NEC Code Checker
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              Check NEC 2023 compliance and get instant code answers
            </p>
            <span className="mt-4 text-sm font-medium text-[#E8C84A] group-hover:text-[#f0d56e]">
              Open tool →
            </span>
          </Link>

          <Link
            href="/tools/wifi-analyzer"
            className="group flex flex-col rounded-2xl border border-white/12 bg-white/[0.04] p-6 text-left shadow-sm transition-colors hover:border-[#E8C84A] hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8C84A]/50"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/15 text-teal-200 ring-1 ring-[#E8C84A]/20 transition-colors group-hover:bg-teal-500/25 group-hover:ring-[#E8C84A]/50">
              <WifiIcon className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-white">
              Wi-Fi Analyzer
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              AP counts, cable takeoff, and vendor recommendations
            </p>
            <span className="mt-4 text-sm font-medium text-[#E8C84A] group-hover:text-[#f0d56e]">
              Open tool →
            </span>
          </Link>

          <Link
            href="/tools/av-analyzer"
            className="group flex flex-col rounded-2xl border border-white/12 bg-white/[0.04] p-6 text-left shadow-sm transition-colors hover:border-[#E8C84A] hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8C84A]/50"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/15 text-rose-200 ring-1 ring-[#E8C84A]/20 transition-colors group-hover:bg-rose-500/25 group-hover:ring-[#E8C84A]/50">
              <SpeakerIcon className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-white">
              AV Analyzer
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              Speaker counts, displays, wiring takeoff, and proposals
            </p>
            <span className="mt-4 text-sm font-medium text-[#E8C84A] group-hover:text-[#f0d56e]">
              Open tool →
            </span>
          </Link>

          <Link
            href="/tools/smarthome-analyzer"
            className="group flex flex-col rounded-2xl border border-white/12 bg-white/[0.04] p-6 text-left shadow-sm transition-colors hover:border-[#E8C84A] hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8C84A]/50"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-200 ring-1 ring-[#E8C84A]/20 transition-colors group-hover:bg-cyan-500/25 group-hover:ring-[#E8C84A]/50">
              <SmartHomeIcon className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-white">
              Smart Home Analyzer
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              Automation design, device counts, and network guidance
            </p>
            <span className="mt-4 text-sm font-medium text-[#E8C84A] group-hover:text-[#f0d56e]">
              Open tool →
            </span>
          </Link>
        </div>

        <p id="contact" className="mt-16 text-sm text-white/45">
          Questions? Reach your team through your usual TPP channels.
        </p>
      </main>
    </div>
  );
}
