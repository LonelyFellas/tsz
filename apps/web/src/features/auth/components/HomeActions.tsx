"use client";

import Link from "next/link";
import { useState } from "react";
import { useUserStore } from "@/stores/user";
import { useLogout } from "../hooks/useLogout";

// 首页操作区：根据登录状态切换「登录」与「进入学习 / 退出登录」。
export function HomeActions() {
  const user = useUserStore((s) => s.user);
  const onboarded = useUserStore((s) => s.onboarded);
  const hydrated = useUserStore((s) => s.hydrated);
  const logout = useLogout();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await logout();
  }

  // 会话恢复完成前不渲染按钮，避免登录态闪烁；占位保持布局稳定。
  if (!hydrated) {
    return <div className="h-6" aria-hidden />;
  }

  // 未登录：登录 + 浏览词表。
  if (!user) {
    return (
      <div className="flex gap-4">
        <Link href="/login" className="text-blue-600 underline">
          登录
        </Link>
        <Link href="/wordlists" className="text-blue-600 underline">
          浏览词表
        </Link>
      </div>
    );
  }

  // 已登录：未完成引导先去 onboarding，否则进主区。
  const studyHref = onboarded === false ? "/onboarding" : "/wordlists";

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-gray-500">你好，{user.nickname}</p>
      <div className="flex items-center gap-4">
        <Link
          href={studyHref}
          className="rounded-full bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          进入学习
        </Link>
        <button
          onClick={handleLogout}
          disabled={loading}
          className="text-sm text-gray-500 transition-colors hover:text-gray-800 disabled:opacity-40"
        >
          {loading ? "退出中..." : "退出登录"}
        </button>
      </div>
    </div>
  );
}
