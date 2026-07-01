import { AdminLoginForm } from "@/features/auth/AdminLoginForm";

// 登录页。react-router 的 useSearchParams 无需像 Next App Router 那样包 Suspense。
export function LoginPage() {
  return <AdminLoginForm />;
}
