"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  classifyEmployeeToday,
  displayName,
  localDayBounds,
  overtimeDisplay,
  todayRelevantPunches,
  type PunchRow,
  type TeamEmployee,
  weekMondayBounds,
} from "@/lib/team-clock-utils";

export function useTeamClockSummary(enabled: boolean) {
  const [employees, setEmployees] = useState<TeamEmployee[]>([]);
  const [punches, setPunches] = useState<PunchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 10000);
    return () => window.clearInterval(id);
  }, []);

  const reload = useCallback(async () => {
    if (!enabled) {
      setEmployees([]);
      setPunches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const sb = createBrowserClient();
      const w = weekMondayBounds(new Date());
      const punchSelect =
        "id,employee_id,job_id,job_name,punch_in_at,punch_out_at,on_lunch,lunch_start_at,total_lunch_ms";
      const [empRes, openRes, weekRes] = await Promise.all([
        sb
          .from("user_profiles")
          .select(
            "id,email,full_name,first_name,last_name,employee_number,show_punch_interface,is_active",
          )
          .eq("show_punch_interface", true)
          .eq("is_active", true)
          .order("full_name", { ascending: true }),
        sb
          .from("time_punches")
          .select(punchSelect)
          .is("punch_out_at", null)
          .order("punch_in_at", { ascending: false }),
        sb
          .from("time_punches")
          .select(punchSelect)
          .gte("punch_in_at", w.fromIso)
          .lt("punch_in_at", w.toIso)
          .order("punch_in_at", { ascending: false }),
      ]);
      if (empRes.error) throw empRes.error;
      if (openRes.error) throw openRes.error;
      if (weekRes.error) throw weekRes.error;
      setEmployees(
        (empRes.data ?? []).map((r) => ({
          id: r.id as string,
          email: String(r.email ?? ""),
          full_name: String(r.full_name ?? ""),
          first_name: String(r.first_name ?? ""),
          last_name: String(r.last_name ?? ""),
          employee_number: String(r.employee_number ?? ""),
        })),
      );
      const map = new Map<string, PunchRow>();
      for (const r of [
        ...(openRes.data ?? []),
        ...(weekRes.data ?? []),
      ] as PunchRow[]) {
        map.set(r.id, r);
      }
      setPunches(
        [...map.values()].sort(
          (a, b) =>
            new Date(b.punch_in_at).getTime() -
            new Date(a.punch_in_at).getTime(),
        ),
      );
    } catch {
      setEmployees([]);
      setPunches([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!enabled) return;
    const sb = createBrowserClient();
    const ch = sb
      .channel("team-clock-summary-punches")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_punches" },
        () => {
          void reload();
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [enabled, reload]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => void reload(), 30000);
    return () => window.clearInterval(id);
  }, [enabled, reload]);

  const summary = useMemo(() => {
    void tick;
    const todayBounds = localDayBounds(new Date());
    const w = weekMondayBounds(new Date());
    const weekPunches = punches.filter(
      (p) => p.punch_in_at >= w.fromIso && p.punch_in_at < w.toIso,
    );
    const punchesForCards = todayRelevantPunches(
      weekPunches,
      todayBounds.ymd,
    );
    const nowMs = Date.now();
    let onClock = 0;
    const workingNames: string[] = [];
    const otAlertNames: string[] = [];
    for (const e of employees) {
      const c = classifyEmployeeToday(
        e.id,
        punchesForCards,
        nowMs,
        todayBounds.ymd,
      );
      if (c.status === "working" || c.status === "lunch") {
        onClock += 1;
        workingNames.push(displayName(e));
      }
      if (overtimeDisplay(c.workedHoursToday).overtime) {
        otAlertNames.push(displayName(e));
      }
    }
    return {
      onClock,
      totalTeam: employees.length,
      workingNames,
      otAlertNames,
      otAlertCount: otAlertNames.length,
    };
  }, [employees, punches, tick]);

  return { ...summary, loading, reload };
}
