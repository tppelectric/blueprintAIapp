import type { Metadata } from "next";
import { ReceiptsClient } from "./receipts-client";

export const metadata: Metadata = {
  title: "Receipts",
  description: "Capture and manage job receipts for TPP Electrical.",
};

export default function ReceiptsPage() {
  return <ReceiptsClient />;
}
