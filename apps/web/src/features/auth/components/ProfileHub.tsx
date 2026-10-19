"use client";

import type { MeResponse } from "@tsz/types";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/request";
import { VARIANT_LABEL, displayNameOf } from "@/lib/user";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";

// 个人中心:头像菜单进入的中转页。聚合资料卡 + 常用入口 + 申请成为老师。
// 资料卡的「编辑资料」跳 /account/profile(EditProfileForm)。
// 部分入口(我的任务 / 设置)后端/路由未就绪,先占位提示「即将上线」。

// 常用快捷入口。仅保留有真实去处的项;工作台和申请认证在头像菜单中,
// 不在本页重复。占位类(我的任务 / 设置)待后端就绪再加。
const TILES: { label: string; href: string; icon: ReactNode }[] = [
  {
    label: "邀请好友",
    href: "/account/invitations",
    icon: <UserPlus strokeWidth={1.6} aria-hidden />
  },
  { label: "我的天生币", href: "/account/coins", icon: <CoinIcon /> },
  { label: "我的词表", href: "/account/wordlists", icon: <ListIcon /> },
  {
    label: "账号安全",
    href: "/account/security",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <path d="M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6l-8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </svg>
    )
  }
];

export function ProfileHub() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { identity, ready, error } = useTeacherIdentity();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  // 复制 ID 的就地反馈:"idle" | "copied" | "failed",1.5s 后自动还原。
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );
  // 记录「哪个 URL」加载失败(与 AccountMenu 同模式):换头像后 URL 变化,新图自动重试。
  const [avatarFailedUrl, setAvatarFailedUrl] = useState("");

  useEffect(() => {
    let alive = true;
    api.auth
      .me()
      .then((data) => {
        if (alive) setMe(data);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (copyState === "idle") return;
    const t = setTimeout(() => setCopyState("idle"), 1500);
    return () => clearTimeout(t);
  }, [copyState]);

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center text-sm text-foreground-subtle">
        资料加载失败,请刷新重试。
      </div>
    );
  }

  if (!me) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center text-sm text-foreground-subtle">
        加载中…
      </div>
    );
  }

  const { user, learning_settings } = me;
  const displayName = displayNameOf(user);
  const initial = Array.from(displayName)[0]!.toUpperCase();
  const contact = user.phone ?? user.email ?? "";

  return (
    <div className="animate-in mx-auto w-full max-w-3xl px-6 pb-16 pt-8 sm:pt-12">
      <button
        type="button"
        disabled={!ready}
        onClick={() =>
          router.replace(
            identity === "teacher" ? "/teacher/classes" : "/student/practice"
          )
        }
        className="-ml-3 mb-5 inline-flex min-h-10 items-center rounded-full px-3 text-sm text-foreground-muted transition-colors hover:bg-surface/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        ← 返回工作台
      </button>
      {error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 text-sm text-foreground-muted"
        >
          <p>暂时无法确认工作台身份。</p>
          <button
            type="button"
            onClick={() =>
              void queryClient.invalidateQueries({
                queryKey: ["teacher-certification", user.id]
              })
            }
            className="text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            重新核验身份
          </button>
        </div>
      )}
      <p className="mb-3 text-xs font-medium tracking-[0.2em] text-foreground-muted">
        我的账户
      </p>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-[34px]">
        个人中心
      </h1>

      <div className="glass rounded-3xl p-2">
        <div className="rounded-[20px] bg-surface/70 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="size-16 shrink-0 overflow-hidden rounded-full ring-4 ring-primary/10 sm:size-[72px]">
              {user.avatar_url && user.avatar_url !== avatarFailedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt={displayName}
                  className="h-full w-full bg-white object-cover"
                  onError={() => setAvatarFailedUrl(user.avatar_url)}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-primary text-2xl font-bold text-primary-foreground">
                  {initial}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-xl font-bold leading-8 tracking-tight text-foreground [overflow-wrap:anywhere]">
                {displayName}
              </p>
              {contact && (
                <p className="mt-1 break-words text-sm leading-6 text-foreground-muted [overflow-wrap:anywhere]">
                  {contact}
                </p>
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-flex max-w-full items-start gap-1.5 text-xs leading-5 text-foreground-muted">
                <span className="min-w-0 break-all">ID:{user.id}</span>
                <button
                  type="button"
                  onClick={() => copyId(user.id)}
                  aria-label="复制 ID"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {copyState === "copied" ? <CheckIcon /> : <CopyIcon />}
                </button>
              </span>
              {copyState === "copied" && (
                <span className="text-xs text-primary">已复制</span>
              )}
              {copyState === "failed" && (
                <span className="text-xs text-danger">复制失败</span>
              )}
              {learning_settings && (
                <>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground-muted">
                    {learning_settings.cefr_level}
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground-muted">
                    {VARIANT_LABEL[learning_settings.english_variant]}
                  </span>
                </>
              )}
            </div>
            <Link
              href="/account/profile"
              className="inline-flex min-h-10 shrink-0 items-center justify-center self-end rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground tracking-wide transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:self-auto"
            >
              编辑资料
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {TILES.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="glass group flex min-h-20 items-center gap-4 rounded-3xl px-5 transition-[box-shadow,border-color] duration-300 hover:border-primary/30 hover:shadow-float focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary [&_svg]:size-5">
              {tile.icon}
            </span>
            <span className="flex-1 text-sm font-medium text-foreground">
              {tile.label}
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-foreground-subtle transition-transform group-hover:translate-x-0.5"
              aria-hidden
            >
              <path d="m9 5 7 7-7 7" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── 图标(简洁线性,贴合原型) ─────────────────────────
function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="9"
        y="9"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5 15V5a2 2 0 0 1 2-2h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l9 9-9 9-9-9 9-9z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="4"
        width="18"
        height="17"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M7 9h10M7 13h10M7 17h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
