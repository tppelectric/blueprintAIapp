import type { Metadata } from "next";
import { InventoryVehicleAddClient } from "@/components/inventory-vehicle-add-client";

export const metadata: Metadata = {
  title: "Add vehicle",
  description: "Register a new fleet vehicle.",
};

export default function InventoryVehicleNewPage() {
  return <InventoryVehicleAddClient />;
}
