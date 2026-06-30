import type { Metadata } from "next";
import { ThemeToggle } from "@/features/theme/ThemeToggle";

// 新用户引导是需登录的私密流程,禁止搜索引擎收录。
// (页面本身是客户端组件,无法直接导出 metadata,故由 layout 承载。)
export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

export default function OnboardingLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ThemeToggle className="fixed right-4 top-4 z-50" />
      {children}
    </>
  );
}
