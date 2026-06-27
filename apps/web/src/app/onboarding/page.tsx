"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OnboardingForm } from "@/features/auth";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { useUserStore } from "@/stores/user";

// 新用户引导页：选择难度等级 + 英式/美式。
// RouteGuard 保证已登录；已完成引导的用户在此直接回首页。
export default function OnboardingPage() {
  const onboarded = useUserStore((s) => s.onboarded);
  const router = useRouter();

  useEffect(() => {
    if (onboarded === true) router.replace("/");
  }, [onboarded, router]);

  return (
    <RouteGuard>{onboarded === true ? null : <OnboardingForm />}</RouteGuard>
  );
}
