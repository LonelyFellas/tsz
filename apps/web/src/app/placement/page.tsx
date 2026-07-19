"use client";

import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { PlacementFlow } from "@/features/placement";

// 词汇定级测试:滑卡判断「认识/不认识」,15–30 题自适应收敛出 CEFR 等级,
// 结果经 /onboarding?level=XX 回填学习设置。产品方案见 tsz-rust 仓库
// docs/placement-product-plan.md;当前数据层为 mock(features/placement/lib/client.ts)。
export default function PlacementPage() {
  return (
    <RouteGuard>
      <PlacementFlow />
    </RouteGuard>
  );
}
