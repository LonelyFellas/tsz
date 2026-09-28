import type { Metadata } from "next";
import { RouteGuard } from "@/features/auth";
import { Notifications } from "@/features/teacher-certification/Notifications";

export const metadata: Metadata = {
  title: "站内通知",
  robots: { index: false, follow: false }
};

export default function NotificationsPage() {
  return (
    <RouteGuard>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-3xl font-semibold tracking-tight">站内通知</h1>
        <Notifications />
      </div>
    </RouteGuard>
  );
}
