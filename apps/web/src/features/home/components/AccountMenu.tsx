"use client";

import Link from "next/link";
import { useRef, useState, type MouseEvent } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@tsz/ui/components";
import { useUserStore } from "@/stores/user";
import { displayNameOf } from "@/lib/user";
import { useLogout } from "@/features/auth/hooks/useLogout";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";
import { useTheme } from "@/features/theme/useTheme";

// 账户菜单——头像触发的下拉。收纳工作台、个人中心、身份切换与退出入口。
// 头像优先用后端 avatar_url 字段;缺失或加载失败时回退到昵称首字母色块作默认头像。
export function AccountMenu() {
  const user = useUserStore((s) => s.user);
  const logout = useLogout();
  const teacher = useTeacherIdentity();
  const { resolved, toggle } = useTheme();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // 记录「哪个 URL」加载失败而非布尔闩锁:换头像后 avatar_url 变化,新图自动重试。
  const [errorUrl, setErrorUrl] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tabExiting = useRef(false);

  if (!user) return null;

  const busy = switching || loading;
  function blockBusyNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (busy) event.preventDefault();
  }

  const displayName = displayNameOf(user);
  const initial = Array.from(displayName)[0]!.toUpperCase();
  const showImage = !!user.avatar_url && user.avatar_url !== errorUrl;

  async function handleLogout() {
    setLoading(true);
    await logout();
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="账户菜单"
          onClick={(event) => {
            if (event.detail === 0) setOpen((value) => !value);
          }}
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-foreground text-xs font-semibold text-background transition hover:opacity-80 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {showImage ? (
            // 任意来源的远程头像,next/image 需维护域名白名单,脚手架阶段用原生 img。
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar_url}
              alt={displayName}
              className="h-full w-full bg-white object-cover"
              onError={() => setErrorUrl(user.avatar_url)}
            />
          ) : (
            initial
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-56"
        onKeyDownCapture={(event) => {
          if (event.key !== "Tab") return;
          event.stopPropagation();
          tabExiting.current = true;
          triggerRef.current?.focus();
          setOpen(false);
        }}
        onCloseAutoFocus={(event) => {
          if (tabExiting.current) {
            event.preventDefault();
            tabExiting.current = false;
          }
        }}
      >
        <DropdownMenuLabel>
          <div className="flex items-center gap-1.5">
            <p className="min-w-0 truncate text-sm font-medium text-foreground">
              {displayName}
            </p>
            {teacher.verified && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-primary"
                role="img"
                aria-label="已认证教师"
              >
                <title>已认证教师</title>
                <circle cx="12" cy="12" r="9" />
                <path d="m8 12 3 3 5-6" />
              </svg>
            )}
          </div>
          <p className="text-xs text-foreground-subtle">
            {teacher.identity === "teacher" ? "教师身份" : "学生身份"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          asChild
          disabled={busy}
          className="font-medium text-foreground"
        >
          <Link
            onClick={blockBusyNavigation}
            onAuxClick={blockBusyNavigation}
            href={
              teacher.identity === "teacher"
                ? "/teacher/classes"
                : "/student/practice"
            }
          >
            {teacher.identity === "teacher"
              ? "进入教师工作台"
              : "进入学生工作台"}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild disabled={busy}>
          <Link
            href="/account"
            onClick={blockBusyNavigation}
            onAuxClick={blockBusyNavigation}
          >
            个人中心
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild disabled={busy}>
          <Link
            href="/account/notifications"
            onClick={blockBusyNavigation}
            onAuxClick={blockBusyNavigation}
          >
            站内通知
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {teacher.verified && (
          <DropdownMenuItem
            disabled={switching || loading}
            className="gap-2.5 text-primary"
            onSelect={async (event) => {
              event.preventDefault();
              setSwitching(true);
              setSwitchError("");
              try {
                await teacher.select(
                  teacher.identity === "teacher" ? "student" : "teacher"
                );
                setOpen(false);
              } catch (error) {
                setSwitchError(
                  error instanceof Error ? error.message : "切换失败，请重试"
                );
              } finally {
                setSwitching(false);
              }
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden
            >
              {teacher.identity === "teacher" ? (
                <>
                  <path d="M12 7v14" />
                  <path d="M3 4h4a5 5 0 0 1 5 3 5 5 0 0 1 5-3h4v16h-4a5 5 0 0 0-5 2 5 5 0 0 0-5-2H3Z" />
                </>
              ) : (
                <>
                  <path d="m2 9 10-5 10 5-10 5Z" />
                  <path d="M6 11v5c3 3 9 3 12 0v-5" />
                  <path d="M22 9v6" />
                </>
              )}
            </svg>
            {switching
              ? "正在切换…"
              : teacher.identity === "teacher"
                ? "切换为学生"
                : "切换为教师"}
          </DropdownMenuItem>
        )}
        {switchError && (
          <p role="alert" className="px-3 py-2 text-xs text-danger">
            {switchError}
          </p>
        )}
        {!teacher.verified && (
          <DropdownMenuItem asChild disabled={busy}>
            <Link
              href="/apply-teacher"
              onClick={blockBusyNavigation}
              onAuxClick={blockBusyNavigation}
            >
              申请教师认证
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={toggle} className="gap-2.5">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden
          >
            {resolved === "dark" ? (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </>
            ) : (
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
            )}
          </svg>
          {resolved === "dark" ? "浅色模式" : "深色模式"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void handleLogout();
          }}
          disabled={loading || switching}
        >
          {loading ? "退出中…" : "退出登录"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
