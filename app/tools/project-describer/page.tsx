import type { Metadata } from "next";
import { ProjectDescriberClient } from "./project-describer-client";

export const metadata: Metadata = {
  title: "AI Project Describer — Blueprint AI",
  description:
    "Describe a project in text or voice; get scope, materials, proposals, and pre-filled analyzer plans.",
};

export default function ProjectDescriberPage() {
  return <ProjectDescriberClient />;
}
