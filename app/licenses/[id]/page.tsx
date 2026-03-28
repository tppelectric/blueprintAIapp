import type { Metadata } from "next";
import { LicensesDetailClient } from "@/components/licenses-detail-client";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "License details",
    description: `License ${id.slice(0, 8)}…`,
  };
}

export default async function LicenseDetailPage({ params }: Props) {
  const { id } = await params;
  return <LicensesDetailClient licenseId={id} />;
}
