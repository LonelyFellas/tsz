"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OnboardingForm } from "@/features/auth";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { isBand } from "@/features/placement";

import { useUserStore } from "@/stores/user";
import { postAuthPath } from "@/features/auth/shared";

function OnboardingInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const onboarded = useUserStore((s) => s.onboarded);
  const [wasConfiguredOnEntry] = useState(onboarded === true);
  useEffect(() => {
    if (wasConfiguredOnEntry) router.replace("/account/profile");
  }, [wasConfiguredOnEntry, router]);
  if (wasConfiguredOnEntry || onboarded !== false) return null;
  const level = searchParams.get("level");
  return (
    <OnboardingForm
      initialLevel={isBand(level) ? level : undefined}
      returnTo={postAuthPath(true, searchParams.get("redirect"))}
    />
  );
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
