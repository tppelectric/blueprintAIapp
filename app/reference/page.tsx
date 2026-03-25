import type { Metadata } from "next";
import { ReferenceLibraryClient } from "./reference-library-client";

export const metadata: Metadata = {
  title: "TPP Reference Library — Blueprint AI",
  description:
    "Company knowledge base: PDF references, electrical cheat sheets, and quick cards.",
};

export default function ReferencePage() {
  return <ReferenceLibraryClient />;
}
