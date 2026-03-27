import type { Metadata } from "next";
import { InventoryCheckoutClient } from "./inventory-checkout-client";

export const metadata: Metadata = {
  title: "Inventory checkouts",
  description: "View and check in tools assigned to you.",
};

export default function InventoryCheckoutPage() {
  return <InventoryCheckoutClient />;
}
