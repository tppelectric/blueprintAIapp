export type LastLoginTone = "green" | "yellow" | "gray" | "red";

/**
 * Relative labels for admin user list:
 * "Today at 3:45 PM", "Yesterday at …", "March 20 at …", or "Never".
 */
export function formatLastLoginLabel(
  iso: string | null | undefined,
): { label: string; tone: LastLoginTone } {
  if (!iso) {
    return { label: "Never", tone: "red" };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { label: "Never", tone: "red" };
  }

  const now = new Date();
  const startToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const msDay = 86_400_000;
  const dayDiff = Math.round(
    (startToday.getTime() - startThat.getTime()) / msDay,
  );

  const timeStr = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  let label: string;
  if (dayDiff === 0) {
    label = `Today at ${timeStr}`;
  } else if (dayDiff === 1) {
    label = `Yesterday at ${timeStr}`;
  } else {
    const monthDay = d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
    label = `${monthDay} at ${timeStr}`;
  }

  const weekAgo = startToday.getTime() - 7 * msDay;
  let tone: LastLoginTone;
  if (dayDiff === 0) {
    tone = "green";
  } else if (startThat.getTime() >= weekAgo) {
    tone = "yellow";
  } else {
    tone = "gray";
  }

  return { label, tone };
}

export function lastLoginToneClass(tone: LastLoginTone): string {
  switch (tone) {
    case "green":
      return "text-emerald-300";
    case "yellow":
      return "text-[#E8C84A]";
    case "gray":
      return "text-white/45";
    case "red":
      return "text-red-300/90";
    default:
      return "text-white/60";
  }
}
