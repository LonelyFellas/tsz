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

// 账户菜单——头像触发的下拉。收纳工作台、个人中心、身份切换与退出入口。
// 头像优先用后端 avatar_url 字段;缺失或加载失败时回退到昵称首字母色块作默认头像。
export function AccountMenu() {
  const user = useUserStore((s) => s.user);
  const logout = useLogout();
  const teacher = useTeacherIdentity();
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
              className="h-full w-full object-cover"
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
          <p className="truncate text-sm font-medium text-foreground">
            {displayName}
          </p>
          <p className="truncate text-xs text-foreground-subtle">
            当前身份：{teacher.identity === "teacher" ? "教师" : "学生"}
          </p>
          {teacher.verified && (
            <span className="mt-1 inline-block text-xs text-primary">
              已认证教师
            </span>
          )}
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
            className="text-primary"
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
            {switching
              ? "正在切换…"
              : teacher.identity === "teacher"
                ? "切换到学生工作台"
                : "切换到教师工作台"}
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
