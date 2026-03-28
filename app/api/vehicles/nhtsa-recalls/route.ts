import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Proxy NHTSA recalls API (avoids browser CORS). Authenticated users only.
 * https://api.nhtsa.gov/ProductSafety/RecallsV2
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const make = searchParams.get("make")?.trim();
  const model = searchParams.get("model")?.trim();
  const modelYear = searchParams.get("modelYear")?.trim();
  if (!make || !model || !modelYear) {
    return NextResponse.json(
      { error: "Query params make, model, and modelYear are required." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL("https://api.nhtsa.gov/recalls/recallsByVehicle");
  url.searchParams.set("make", make);
  url.searchParams.set("model", model);
  url.searchParams.set("modelYear", modelYear);

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `NHTSA returned ${res.status}` },
        { status: 502 },
      );
    }
    const json: unknown = await res.json();
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Recall lookup failed." },
      { status: 502 },
    );
  }
}
