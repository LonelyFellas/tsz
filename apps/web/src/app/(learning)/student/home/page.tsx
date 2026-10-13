import type { Metadata } from "next";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { StudentHome } from "@/features/student-home/StudentHome";

export const metadata: Metadata = {
  title: "学习首页",
  robots: { index: false, follow: false }
};

export default function StudentHomePage() {
  return (
    <RouteGuard requireOnboarding>
      <StudentHome />
    </RouteGuard>
  );
}
