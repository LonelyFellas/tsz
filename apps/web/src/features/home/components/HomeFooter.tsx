"use client";

import { useWebText } from "@/i18n/client";
import { webHomeLanding as webHome } from "@/i18n/messages/home/landing";
// 页脚：居中小字,与认证页底部保持一致。
export function HomeFooter() {
  const uiText = useWebText(webHome);
  return (
    <footer className="mx-auto w-full max-w-6xl px-6">
      <div className="flex flex-col items-center gap-1 border-t border-border/60 py-10 text-xs text-foreground-subtle sm:flex-row sm:justify-between">
        <p>{uiText("天生会背 · 词汇学习平台")}</p>
        <p>
          © {new Date().getFullYear()} {uiText("保留所有权利")}
        </p>
      </div>
    </footer>
  );
}
