import type { Metadata } from "next";
import { ProjectViewer } from "./project-viewer";

export const metadata: Metadata = {
  title: "Blueprint viewer — Blueprint AI",
  description: "View and navigate your uploaded blueprint PDF.",
};

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectViewer projectId={id} />;
}
