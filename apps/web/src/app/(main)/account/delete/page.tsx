import { DeleteAccountForm, RouteGuard } from "@/features/auth";

// 注销账号：需登录（不强制 onboarding——任何已登录用户都应可注销）。
export default function DeleteAccountPage() {
  return (
    <RouteGuard>
      <DeleteAccountForm />
    </RouteGuard>
  );
}
