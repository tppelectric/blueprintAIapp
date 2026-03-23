/** UX hints for symbol match mode (category from project_symbols.symbol_category). */

export function symbolMatchZoomPercent(category: string): number {
  const c = category.toLowerCase();
  if (c.includes("recess") || c.includes("light") || c.includes("fixture"))
    return 150;
  if (c.includes("receptacle") || c.includes("outlet")) return 175;
  if (c.includes("switch")) return 160;
  return 150;
}

export function symbolMatchTip(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("recess") || (c.includes("light") && !c.includes("switch")))
    return "Look for circles with cross lines, usually in ceiling areas.";
  if (c.includes("receptacle") || c.includes("outlet"))
    return "Look for small rectangles or circles near walls.";
  if (c.includes("switch"))
    return "Look for S symbols or toggles near doors.";
  if (c.includes("panel"))
    return "Look for labeled rectangles with circuit references.";
  return "Match the reference image shape and label style on the plan.";
}
