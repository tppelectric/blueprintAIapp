import { DailyLogDetailClient } from "@/components/daily-log-detail-client";

export const metadata = {
  title: "Daily log",
  description: "View daily field log details, crew, materials, and photos.",
};

export default async function DailyLogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DailyLogDetailClient logId={id} />;
}
