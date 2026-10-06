import type { Metadata } from "next";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { CoinsWallet } from "@/features/coins/CoinsWallet";
export const metadata: Metadata = {
  title: "我的天生币",
  robots: { index: false, follow: false }
};
export default function CoinsPage() {
  return (
    <RouteGuard>
      <CoinsWallet />
    </RouteGuard>
  );
}
