import type { Metadata } from "next";
import { Suspense } from "react";
import { BindPhoneForm } from "@/features/auth/components/BindPhoneForm";
import { RouteGuard } from "@/features/auth/components/RouteGuard";

export const metadata: Metadata = {
  title: "绑定手机号",
  robots: { index: false, follow: false }
};

export default function BindPhonePage() {
  return (
    <RouteGuard>
      <Suspense fallback={null}>
        <BindPhoneForm />
      </Suspense>
    </RouteGuard>
  );
}
