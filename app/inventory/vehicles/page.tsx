import type { Metadata } from "next";
import { InventoryVehiclesListClient } from "@/components/inventory-vehicles-list-client";

export const metadata: Metadata = {
  title: "Fleet vehicles",
  description: "TPP fleet registration, maintenance, and compliance.",
};

export default function InventoryVehiclesPage() {
  return <InventoryVehiclesListClient />;
}
