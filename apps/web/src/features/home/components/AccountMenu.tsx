"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useUserStore } from "@/stores/user";
import { displayNameOf } from "@/lib/user";
import { useLogout } from "@/features/auth/hooks/useLogout";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";

// 账户菜单——头像触发的下拉。把编辑资料/退出/注销等账户操作收纳起来,顶栏只露一个头像。
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
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部 / 按 Esc 收起菜单。
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const displayName = displayNameOf(user);
  const initial = displayName.charAt(0).toUpperCase();
  const showImage = !!user.avatar_url && user.avatar_url !== errorUrl;

  async function handleLogout() {
    setLoading(true);
    await logout();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="账户菜单"
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

      {open && (
        <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-2xl border border-border bg-surface p-1 shadow-xl shadow-black/5">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-foreground">
              {displayName}
            </p>
            <p className="truncate text-xs text-foreground-subtle">
              {teacher.identity === "teacher" ? "教师工作台" : "学生工作台"}
            </p>
            {teacher.verified && (
              <span className="mt-1 inline-block text-xs text-primary">
                已认证教师
              </span>
            )}
          </div>
          <div className="my-1 h-px bg-border" />
          {teacher.verified && (
            <button
              type="button"
              disabled={switching}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-primary hover:bg-muted disabled:opacity-50"
              onClick={async () => {
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
                  ? "切换为学生身份"
                  : "切换为教师身份"}
            </button>
          )}
          {switchError && (
            <p role="alert" className="px-3 py-2 text-xs text-danger">
              {switchError}
            </p>
          )}
          <Link
            href="/apply-teacher"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-muted"
          >
            教师认证
          </Link>
          <Link
            href="/account/notifications"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-muted"
          >
            站内通知
          </Link>
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-foreground-muted transition hover:bg-muted"
          >
            个人中心
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loading}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-foreground-muted transition hover:bg-muted disabled:opacity-40"
          >
            {loading ? "退出中…" : "退出登录"}
          </button>
          <Link
            href="/account/delete"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-foreground-muted transition hover:bg-danger/10 hover:text-danger"
          >
            注销账号
          </Link>
        </div>
      )}
    </div>
  );
}
