import type { Metadata } from "next";
import { MyRequestsClient } from "@/components/my-requests-client";

export const metadata: Metadata = {
  title: "My requests",
  description: "Your internal requests and tickets.",
};

export default function MyRequestsPage() {
  return <MyRequestsClient />;
}
