export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validatePublicSupabaseEnv } = await import("@/lib/env");
    try {
      validatePublicSupabaseEnv();
    } catch (e) {
      console.error("[instrumentation]", e instanceof Error ? e.message : e);
    }
  }
}
