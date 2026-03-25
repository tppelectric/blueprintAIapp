/** Map OpenWeatherMap `weather[0].icon` to emoji (day/night aware). */
export function openWeatherIconToEmoji(icon: string | undefined): string {
  const i = (icon ?? "01d").toLowerCase();
  if (i.startsWith("01")) return i.endsWith("n") ? "🌙" : "☀️";
  if (i.startsWith("02") || i.startsWith("03")) return "🌤";
  if (i.startsWith("04")) return "☁️";
  if (i.startsWith("09") || i.startsWith("10")) return "🌧";
  if (i.startsWith("11")) return "⛈";
  if (i.startsWith("13")) return "❄️";
  if (i.startsWith("50")) return "🌫";
  return "🌤";
}
