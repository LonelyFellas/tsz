import type { Metadata } from "next";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { Invitations } from "@/features/invitations/Invitations";
export const metadata: Metadata = {
  title: "邀请好友",
  robots: { index: false, follow: false }
};
export default function InvitationsPage() {
  return (
    <RouteGuard>
      <Invitations />
    </RouteGuard>
  );
}
