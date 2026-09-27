import type { Metadata } from "next";
import { AccountSecurity } from "@/features/auth/components/AccountSecurity";
import { RouteGuard } from "@/features/auth/components/RouteGuard";

export const metadata: Metadata = { title: "账号安全" };

export default function AccountSecurityPage() {
  return (
    <RouteGuard>
      <AccountSecurity />
    </RouteGuard>
  );
}
