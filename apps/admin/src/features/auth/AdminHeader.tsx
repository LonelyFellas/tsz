import { Button } from "@tsz/ui/components";
import { useAuthStore } from "@/lib/auth";
import { useAdminLogout } from "./useAdminLogout";

/**
 * 后台顶栏：渲染「已登录为 X」+ 登出。
 * 身份来自 store.profile —— 登录与会话恢复（useAdminSessionRestore）已写入，
 * 守卫保证进到这里时 profile 必有值，无需再单独探一次 /admin/profile。
 */
export function AdminHeader() {
  const profile = useAuthStore((s) => s.profile);
  const logout = useAdminLogout();

  const name = profile?.display_name ?? "管理员";

  return (
    <header className="flex items-center justify-between border-b bg-card px-6 py-3">
      <span className="text-sm text-muted-foreground">
        已登录为 <span className="font-medium text-foreground">{name}</span>
      </span>
      <Button
        variant="outline"
        size="sm"
        className="rounded-full"
        onClick={() => void logout()}
      >
        退出登录
      </Button>
    </header>
  );
}
