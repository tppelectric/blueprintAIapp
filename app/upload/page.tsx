import type { Metadata } from "next";
import { UploadBlueprintForm } from "./upload-form";

export const metadata: Metadata = {
  title: "Upload Blueprint — Blueprint AI",
  description: "Upload electrical blueprint PDFs for takeoff.",
};

export default function UploadPage() {
  return <UploadBlueprintForm />;
}
