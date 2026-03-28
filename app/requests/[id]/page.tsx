import type { Metadata } from "next";
import { RequestsDetailClient } from "@/components/requests-detail-client";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "Request details",
    description: `Internal request ${id.slice(0, 8)}…`,
  };
}

export default async function RequestDetailPage({ params }: Props) {
  const { id } = await params;
  return <RequestsDetailClient requestId={id} />;
}
