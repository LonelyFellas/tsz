import type { Metadata } from "next";
import { ProfileHub, RouteGuard } from "@/features/auth";

// 个人中心属私密页,禁止收录。
export const metadata: Metadata = {
  title: "个人中心",
  robots: { index: false, follow: false }
};

// 个人中心:需登录(任何已登录用户都可进入)。
export default function AccountPage() {
  return (
    <RouteGuard>
      <ProfileHub />
    </RouteGuard>
  );
}
