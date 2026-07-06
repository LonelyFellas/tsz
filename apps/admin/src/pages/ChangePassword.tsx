import { ChangePassword } from "@/features/auth/ChangePassword";

// 修改密码页（顶层路由，不在 (console) 分组内）：强制改密态下 profile 为空、且会被全局 403 拦截，
// 故不能挂在需要 profile 的门禁壳下——独立顶层路由确保待改密管理员始终可达。
export function ChangePasswordPage() {
  return <ChangePassword />;
}
