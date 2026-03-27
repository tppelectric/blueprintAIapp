import { redirect } from "next/navigation";

/** Legacy URL — inventory lives at `/inventory`. */
export default function InventoryCheckoutRedirectPage() {
  redirect("/inventory");
}
