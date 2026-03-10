export function recommendServiceSize(calculatedAmps: number): "150A" | "200A" | "320A" | "400A" | "CT metering" {
  if (calculatedAmps <= 125) return "150A";
  if (calculatedAmps <= 180) return "200A";
  if (calculatedAmps <= 290) return "320A";
  if (calculatedAmps <= 390) return "400A";
  return "CT metering";
}

