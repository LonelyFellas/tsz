"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OnboardingForm } from "@/features/auth";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { isBand } from "@/features/placement";

// 新用户引导页：选择难度等级 + 英式/美式。
// RouteGuard 保证已登录；登录/注册后的自动路由由 navigateAfterAuth 决策，
// 本页不做「已 onboarded 即弹回」——学习设置是 onboarding 与后续修改共用的
// (PUT /me/learning-settings)，显式到达（定级测试 CTA / 直接访问）一律放行，
// 否则定级结果页的 /onboarding?level=XX 回填会被弹回首页、等级被丢弃。
// ?level=B1（来自定级测试结果页）会预选对应难度。

function OnboardingInner() {
  const searchParams = useSearchParams();
  const level = searchParams.get("level");
  return <OnboardingForm initialLevel={isBand(level) ? level : undefined} />;
}

export default function OnboardingPage() {
  return (
    <RouteGuard>
      {/* useSearchParams 需要 Suspense 边界(Next 预渲染约束) */}
      <Suspense fallback={null}>
        <OnboardingInner />
      </Suspense>
    </RouteGuard>
  );
}
