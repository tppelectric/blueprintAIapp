import type { Metadata } from "next";
import { ReceiptDetailClient } from "./receipt-detail-client";

export const metadata: Metadata = {
  title: "Receipt",
  description: "Receipt detail view.",
};

export default function ReceiptDetailPage() {
  return <ReceiptDetailClient />;
}
