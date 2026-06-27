import { Suspense } from "react";
import { AdminLoginForm } from "@/features/auth/AdminLoginForm";

// useSearchParams 需置于 Suspense 边界内（Next App Router 要求）。
export default function LoginPage() {
  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  );
}
