import type { Metadata } from "next";
import { ProfileClient } from "./profile-client";

export const metadata: Metadata = {
  title: "My Profile",
  description: "View and edit your Blueprint AI profile.",
};

export default function ProfilePage() {
  return <ProfileClient />;
}
