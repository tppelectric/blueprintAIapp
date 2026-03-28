import type { Metadata } from "next";
import { RequestsNewClient } from "@/components/requests-new-client";

export const metadata: Metadata = {
  title: "New request",
  description: "Submit an internal request to the office.",
};

export default function RequestsNewPage() {
  return <RequestsNewClient />;
}
