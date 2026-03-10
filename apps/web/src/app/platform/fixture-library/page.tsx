"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";

type FixtureItem = {
  id: string;
  deviceType: string;
  planSymbol: string | null;
  deviceName: string;
  manufacturer: string;
  modelNumber: string;
  description: string | null;
  commonApplication: string | null;
  mountingType: string | null;
  lumens: number | null;
  wattage: number | null;
  voltage: string | null;
  unitCost: number | null;
  installedCost: number | null;
  imageUrl: string | null;
  installationPhoto: string | null;
  manufacturerPhoto: string | null;
  necReference: string | null;
};

export default function FixtureLibraryPage() {
  const [query, setQuery] = useState("2x4 LED panel");
  const [manufacturer, setManufacturer] = useState("");
  const [fixtureType, setFixtureType] = useState("");
  const [fixtures, setFixtures] = useState<FixtureItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedFixture, setSelectedFixture] = useState<FixtureItem | null>(null);
  const [status, setStatus] = useState("");

  async function runSearch() {
    setStatus("Searching fixture library...");
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (manufacturer.trim()) {
      params.set("manufacturer", manufacturer.trim());
    }
    if (fixtureType.trim()) {
      params.set("fixtureType", fixtureType.trim());
    }

    const response = await fetch(`/api/platform/fixtures?${params.toString()}`, { cache: "no-store" });
    const payload = (await response.json()) as { message?: string; fixtures?: FixtureItem[] };
    if (!response.ok) {
      setStatus(payload.message ?? "Could not search fixture library.");
      return;
    }

    const list = payload.fixtures ?? [];
    setFixtures(list);
    if (list.length > 0) {
      setSelectedId(list[0].id);
      setSelectedFixture(list[0]);
      setStatus(`Found ${list.length} fixtures.`);
    } else {
      setSelectedId("");
      setSelectedFixture(null);
      setStatus("No fixtures matched this search.");
    }
  }

  async function selectFixture(fixtureId: string) {
    setSelectedId(fixtureId);
    const response = await fetch(`/api/platform/fixtures/${fixtureId}`, { cache: "no-store" });
    const payload = (await response.json()) as { message?: string; fixture?: FixtureItem };
    if (!response.ok || !payload.fixture) {
      setStatus(payload.message ?? "Could not load fixture details.");
      return;
    }
    setSelectedFixture(payload.fixture);
  }

  useEffect(() => {
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Fixture & Device Library">
      <section className="card">
        <h3>Search Fixtures and Devices</h3>
        <p className="muted">Search by name, type, manufacturer, lumens, wattage, voltage, mounting, and price range.</p>
        <div className="form-grid">
          <label className="field">
            Search
            <input
              type="text"
              placeholder='Example: "2x4 LED panel"'
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="field">
            Manufacturer
            <input
              type="text"
              placeholder="Lithonia, Eaton, Lutron..."
              value={manufacturer}
              onChange={(event) => setManufacturer(event.target.value)}
            />
          </label>
          <label className="field">
            Fixture Type
            <input
              type="text"
              placeholder="LED Panel, Data Port, Panel..."
              value={fixtureType}
              onChange={(event) => setFixtureType(event.target.value)}
            />
          </label>
          <div className="row actions">
            <button type="button" onClick={() => void runSearch()}>
              Search
            </button>
          </div>
        </div>
        {status && <p className="status-text">{status}</p>}
      </section>

      <section className="card section-gap">
        <h3>Results</h3>
        <div className="form-grid">
          <label className="field">
            Select Device / Fixture
            <select value={selectedId} onChange={(event) => void selectFixture(event.target.value)}>
              {fixtures.length === 0 && <option value="">No results</option>}
              {fixtures.map((fixture) => (
                <option key={fixture.id} value={fixture.id}>
                  {fixture.deviceName} - {fixture.manufacturer} ({fixture.modelNumber})
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {selectedFixture && (
        <section className="card section-gap">
          <h3>{selectedFixture.deviceName}</h3>
          <p className="muted">
            {selectedFixture.manufacturer} • {selectedFixture.modelNumber} • {selectedFixture.deviceType}
          </p>

          <table>
            <tbody>
              <tr><td>Plan Symbol</td><td>{selectedFixture.planSymbol ?? "N/A"}</td></tr>
              <tr><td>Description</td><td>{selectedFixture.description ?? "N/A"}</td></tr>
              <tr><td>Common Application</td><td>{selectedFixture.commonApplication ?? "N/A"}</td></tr>
              <tr><td>Mounting Type</td><td>{selectedFixture.mountingType ?? "N/A"}</td></tr>
              <tr><td>Lumens</td><td>{selectedFixture.lumens ?? "N/A"}</td></tr>
              <tr><td>Wattage</td><td>{selectedFixture.wattage ?? "N/A"}</td></tr>
              <tr><td>Voltage</td><td>{selectedFixture.voltage ?? "N/A"}</td></tr>
              <tr><td>Unit Cost</td><td>{selectedFixture.unitCost ?? "N/A"}</td></tr>
              <tr><td>Installed Cost</td><td>{selectedFixture.installedCost ?? "N/A"}</td></tr>
              <tr><td>NEC Reference</td><td>{selectedFixture.necReference ?? "N/A"}</td></tr>
            </tbody>
          </table>

          <div className="tool-grid section-gap">
            <article className="tool-tile blue">
              <h4>Catalog Image</h4>
              {selectedFixture.imageUrl ? (
                <img src={selectedFixture.imageUrl} alt={`${selectedFixture.deviceName} catalog`} style={{ width: "100%", borderRadius: 10 }} />
              ) : (
                <p>No catalog image path provided.</p>
              )}
            </article>
            <article className="tool-tile">
              <h4>Installation Photo</h4>
              {selectedFixture.installationPhoto ? (
                <img
                  src={selectedFixture.installationPhoto}
                  alt={`${selectedFixture.deviceName} installation`}
                  style={{ width: "100%", borderRadius: 10 }}
                />
              ) : (
                <p>No installation photo path provided.</p>
              )}
            </article>
            <article className="tool-tile green">
              <h4>Manufacturer Photo</h4>
              {selectedFixture.manufacturerPhoto ? (
                <img
                  src={selectedFixture.manufacturerPhoto}
                  alt={`${selectedFixture.manufacturer} manufacturer`}
                  style={{ width: "100%", borderRadius: 10 }}
                />
              ) : (
                <p>No manufacturer photo path provided.</p>
              )}
            </article>
          </div>
        </section>
      )}
    </AppShell>
  );
}
