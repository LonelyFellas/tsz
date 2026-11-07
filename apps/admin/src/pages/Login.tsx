import type { RootOutletContext } from "@/providers";
import { useOutletContext } from "react-router-dom";
import { AdminLoginForm } from "@/features/auth/AdminLoginForm";

// 登录页。react-router 的 useSearchParams 无需像 Next App Router 那样包 Suspense。
export function LoginPage() {
  const { connectionNotice } = useOutletContext<RootOutletContext>();
  return <AdminLoginForm connectionNotice={connectionNotice} />;
}
