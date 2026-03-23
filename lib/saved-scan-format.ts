export function formatAutoScanName(scanIndex: number): string {
  const d = new Date();
  return `Scan ${scanIndex} — ${d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}
