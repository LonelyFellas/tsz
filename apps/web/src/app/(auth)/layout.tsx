import { GuestGuard } from "@/features/auth/components/GuestGuard";

// 登录 / 注册布局：已登录用户访问时由 GuestGuard 自动跳走。
export default function AuthLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <GuestGuard>
      <div className="min-h-screen">{children}</div>
    </GuestGuard>
  );
}
