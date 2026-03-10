"use client";

import Link from "next/link";
import { AppShell } from "../../../components/app-shell";

export default function GeneralToolsPage() {
  return (
    <AppShell title="General Tools">
      <section className="card">
        <h3>Standalone Tools</h3>
        <p className="muted">These tools can run without selecting a project or job, and can then be assigned to one.</p>
        <div className="row actions">
          <Link className="button-link" href="/platform/load-calculator">
            Load Calculator
          </Link>
          <Link className="button-link secondary" href="/platform/wifi-analyzer">
            WiFi Analyzer / Builder
          </Link>
          <Link className="button-link secondary" href="/platform/fixture-library">
            Fixture Library
          </Link>
        </div>
      </section>

      <section className="card section-gap">
        <h3>How Assignment Works</h3>
        <ul>
          <li>Run the tool in standalone mode to test scenarios quickly.</li>
          <li>Select a Project and optional Job in the assignment section.</li>
          <li>Save the result so it becomes part of that project/job workflow history.</li>
        </ul>
      </section>
    </AppShell>
  );
}
