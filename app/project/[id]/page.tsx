import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectViewer } from "./project-viewer";

export const metadata: Metadata = {
  title: "Blueprint viewer - Blueprint AI",
  description: "View and navigate your uploaded blueprint PDF.",
};

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-[#0a1628]">
          <div className="text-white/50 text-sm">Loading project...</div>
        </div>
      }
    >
      <ProjectViewer projectId={id} />
    </Suspense>
  );
}
