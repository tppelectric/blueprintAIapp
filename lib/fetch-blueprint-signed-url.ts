/**
 * Client-only: requests a short-lived signed URL from the server.
 * Never use the service role key in the browser.
 */
export async function fetchBlueprintSignedUrl(
  storedPathOrUrl: string,
): Promise<string> {
  const res = await fetch("/api/get-blueprint-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath: storedPathOrUrl }),
  });
  const json = (await res.json()) as { signedUrl?: string; error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Could not get signed blueprint URL.");
  }
  if (!json.signedUrl) {
    throw new Error("No signed URL in response.");
  }
  return json.signedUrl;
}
