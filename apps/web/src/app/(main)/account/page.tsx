import { ProfileHub, RouteGuard } from "@/features/auth";

// 个人中心:需登录(任何已登录用户都可进入)。
export default function AccountPage() {
  return (
    <RouteGuard>
      <ProfileHub />
    </RouteGuard>
  );
}
