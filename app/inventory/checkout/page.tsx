import type { Metadata } from "next";
import { InventoryCheckoutClient } from "@/components/inventory-checkout-client";

export const metadata: Metadata = {
  title: "My inventory checkouts",
  description: "View and check in tools assigned to you (TPP Electric).",
};

export default function InventoryCheckoutPage() {
  return <InventoryCheckoutClient />;
}
