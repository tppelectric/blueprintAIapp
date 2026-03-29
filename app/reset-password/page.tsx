import type { Metadata } from "next";
import { ResetPasswordClient } from "./reset-password-client";

export const metadata: Metadata = {
  title: "Reset password — Blueprint AI",
  description: "Set a new password for your Blueprint AI account.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
