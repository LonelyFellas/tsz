"use client";

import type { MeResponse } from "@tsz/api-client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/request";
import { VARIANT_LABEL, displayNameOf } from "@/lib/user";

// 个人中心:头像菜单进入的中转页。聚合资料卡 + 常用入口 + 申请成为老师。
// 资料卡的「编辑资料」跳 /account/profile(EditProfileForm)。
// 部分入口(我的任务 / 设置 / 邀请好友)后端/路由未就绪,先占位提示「即将上线」。

// 常用快捷入口。仅保留有真实去处的项;申请成为老师 / 各功能入口已在顶部 MainNav 暴露,
// 不在本页重复。占位类(邀请好友 / 我的任务 / 设置)待后端就绪再加。
const TILES: { label: string; href: string; icon: ReactNode }[] = [
  { label: "我的天生币", href: "/student/coins", icon: <CoinIcon /> },
  { label: "我的词表", href: "/wordlists", icon: <ListIcon /> }
];

export function ProfileHub() {
  const router = useRouter();
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
  const initial = displayName.charAt(0).toUpperCase();
  const contact = user.phone ?? user.email ?? "";

  return (
    <div className="animate-in mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="-ml-2 rounded-full px-3 py-1.5 text-sm font-medium text-foreground-muted transition hover:bg-muted hover:text-foreground"
        >
          ← 返回
        </button>
        <h1 className="flex-1 text-center text-2xl font-semibold tracking-tight text-foreground">
          个人中心
        </h1>
        <span className="w-12" aria-hidden />
      </div>

      {/* 资料卡 */}
      <div className="mb-4 flex items-center gap-5 rounded-3xl border border-border bg-surface p-6 shadow-xl shadow-black/5">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full ring-1 ring-border">
          {user.avatar_url && user.avatar_url !== avatarFailedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar_url}
              alt={displayName}
              className="h-full w-full object-cover"
              onError={() => setAvatarFailedUrl(user.avatar_url)}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900 text-2xl font-semibold text-white">
              {initial}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold tracking-tight text-foreground">
            {displayName}
          </p>
          {contact && (
            <p className="truncate text-sm text-foreground-muted">{contact}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex max-w-[15rem] items-center gap-1 text-xs text-foreground-subtle">
              <span className="min-w-0 truncate">ID:{user.id}</span>
              <button
                type="button"
                onClick={() => copyId(user.id)}
                aria-label="复制 ID"
                className="shrink-0 text-foreground-subtle transition-colors hover:text-foreground-muted"
              >
                {copyState === "copied" ? <CheckIcon /> : <CopyIcon />}
              </button>
              {copyState === "copied" && (
                <span className="shrink-0 whitespace-nowrap font-medium text-primary">
                  已复制
                </span>
              )}
              {copyState === "failed" && (
                <span className="shrink-0 whitespace-nowrap font-medium text-danger">
                  复制失败
                </span>
              )}
            </span>
            {learning_settings && (
              <>
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-white">
                  {learning_settings.cefr_level}
                </span>
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-white">
                  {VARIANT_LABEL[learning_settings.english_variant]}
                </span>
              </>
            )}
          </div>
        </div>
        <Link
          href="/account/profile"
          className="shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 active:scale-95"
        >
          编辑资料
        </Link>
      </div>

      {/* 常用快捷入口 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TILES.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="group flex items-center gap-3.5 rounded-3xl border border-border bg-surface p-5 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/5"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted transition group-hover:bg-primary/10">
              {tile.icon}
            </span>
            <span className="flex-1 text-sm font-medium text-foreground">
              {tile.label}
            </span>
            <span
              aria-hidden
              className="text-foreground-subtle transition group-hover:translate-x-0.5 group-hover:text-foreground-subtle"
            >
              →
            </span>
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
      <path d="M12 3l9 9-9 9-9-9 9-9z" fill="#111827" />
      <circle cx="12" cy="12" r="3" fill="#fff" />
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
        stroke="#111827"
        strokeWidth="2"
      />
      <path
        d="M7 9h10M7 13h10M7 17h6"
        stroke="#111827"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
