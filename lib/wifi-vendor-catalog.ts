/** UI / comparison helpers — vendor union lives in wifi-analyzer-engine. */

export const MESH_VENDOR_VALUES = new Set([
  "eero",
  "google_nest",
  "netgear_orbi",
]);

export function isMeshVendorString(v: string): boolean {
  return MESH_VENDOR_VALUES.has(v);
}

export const WIFI_VENDOR_SELECT_OPTIONS: { value: string; label: string }[] = [
  { value: "ubiquiti", label: "Ubiquiti UniFi" },
  { value: "ruckus", label: "Ruckus" },
  { value: "cisco_meraki", label: "Cisco Meraki" },
  { value: "tp_link", label: "TP-Link Omada" },
  { value: "access_networks", label: "Access Networks" },
  { value: "araknis", label: "Araknis Networks" },
  { value: "luxul", label: "Luxul" },
  { value: "eero", label: "eero (Amazon)" },
  { value: "google_nest", label: "Google Nest WiFi Pro" },
  { value: "netgear_orbi", label: "Netgear Orbi" },
  { value: "none", label: "No preference" },
];

export type VendorComparisonMeta = {
  stars: string;
  bestFor: string;
};

export const VENDOR_COMPARISON_META: Record<string, VendorComparisonMeta> = {
  ubiquiti: { stars: "⭐⭐⭐⭐⭐", bestFor: "Commercial / prosumer" },
  ruckus: { stars: "⭐⭐⭐⭐⭐", bestFor: "Enterprise Wi‑Fi" },
  cisco_meraki: { stars: "⭐⭐⭐⭐⭐", bestFor: "Cloud-managed enterprise" },
  tp_link: { stars: "⭐⭐⭐⭐", bestFor: "Budget commercial" },
  access_networks: { stars: "⭐⭐⭐⭐⭐", bestFor: "AV / smart home premium" },
  araknis: { stars: "⭐⭐⭐⭐⭐", bestFor: "Control4 / Savant integrators" },
  luxul: { stars: "⭐⭐⭐⭐", bestFor: "Commercial / custom install" },
  eero: { stars: "⭐⭐⭐⭐", bestFor: "Simple residential mesh" },
  google_nest: { stars: "⭐⭐⭐", bestFor: "Basic residential" },
  netgear_orbi: { stars: "⭐⭐⭐⭐", bestFor: "Large-home mesh performance" },
  none: { stars: "⭐⭐⭐⭐", bestFor: "UniFi-class (default stack)" },
};

export const MESH_VS_ENTERPRISE_NOTE = `MESH SYSTEM SELECTED:
This vendor uses a mesh topology.

Key differences from enterprise systems:
✅ Easier to install and configure
✅ Self-healing mesh network
✅ No separate controller needed (typical residential mesh)
✅ Good for basic residential use

⚠️ Limited VLAN and network segmentation
⚠️ Less granular management control
⚠️ Not recommended for commercial use
⚠️ Cannot mix with other vendor APs

PROFESSIONAL INSTALL: eero, Google Nest WiFi, and Netgear Orbi are consumer mesh — do NOT specify for Control4, Josh.ai, Savant, or enterprise VLAN work.

For integrator projects use UniFi (Wi‑Fi 7 U7 line for new construction / high device count), Access Networks (Ruckus Wi‑Fi 7), Ruckus, or Araknis.`;

export const VENDOR_COMPARISON_FOOTNOTES = [
  "eero / Nest / Orbi: consumer mesh — not for professional C4 / Josh / Savant; no Chowmain-style UniFi presence integration.",
  "Ubiquiti: UniFi 7 (U7 Pro, Pro Max, Pro Wall, Outdoor, Pro XG / XGS) for premium residential; bias Wi‑Fi 7 for new construction, smart home, 50+ devices.",
  "Ubiquiti / Omada / Araknis / Ruckus / Meraki: enterprise-grade management, VLANs, and policies (feature set varies by line).",
  "Access Networks (Snap One): Ruckus Wi‑Fi 7 (e.g. A670 Unleashed, A770) — top custom-channel recommendation; verify 2026 MAP with ADI.",
];
