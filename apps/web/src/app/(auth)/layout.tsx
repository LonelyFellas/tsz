import { GuestGuard } from "@/features/auth/components/GuestGuard";
import { ThemeToggle } from "@/features/theme/ThemeToggle";

// 登录 / 注册布局：已登录用户访问时由 GuestGuard 自动跳走。
// 这些页面不走 HomeNav/MainNav,单独放一个浮动主题切换,保证全站可切。
export default function AuthLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <GuestGuard>
      <div className="relative min-h-screen">
        <ThemeToggle className="fixed right-4 top-4 z-50" />
        {children}
      </div>
    </GuestGuard>
  );
}
