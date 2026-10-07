"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatCoins } from "@tsz/shared";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode
} from "react";
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
import { api } from "@/lib/request";
import { useLogout } from "@/features/auth/hooks/useLogout";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";
import { useTheme } from "@/features/theme/useTheme";

const MENU_ITEM_CLASS =
  "gap-2.5 rounded-xl text-foreground data-[highlighted]:bg-primary-muted";

function MenuIcon({ children }: { children: ReactNode }) {
  return (
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
      {children}
    </svg>
  );
}

// 随菜单浮层挂载，关闭菜单时不额外请求；与钱包页面共用账号级缓存。
function CoinBalance({ id }: { id: string }) {
  const wallet = useQuery({
    queryKey: ["coins", "user", id, "wallet"],
    queryFn: ({ signal }) => api.coins.wallet({ signal }),
    refetchOnMount: "always",
    staleTime: 0
  });
  return (
    <span className="min-w-0 break-all" aria-live="polite">
      {wallet.isError
        ? "余额暂不可用"
        : wallet.isPending || wallet.isFetching
          ? "读取余额…"
          : `天生币：${formatCoins(wallet.data.balance).replace(" 天生币", "")}`}
    </span>
  );
}

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
  const [avatarOffsetX, setAvatarOffsetX] = useState(0);
  // 记录「哪个 URL」加载失败而非布尔闩锁:换头像后 avatar_url 变化,新图自动重试。
  const [errorUrl, setErrorUrl] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tabExiting = useRef(false);
  const openedByHover = useRef(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const positionAvatar = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    // 与 224px 浮层及默认 12px 视口避让保持一致。
    const panelCenter = Math.max(
      124,
      Math.min(window.innerWidth - 124, center)
    );
    setAvatarOffsetX(panelCenter - center);
  }, []);

  useEffect(() => {
    window.addEventListener("resize", positionAvatar);
    return () => window.removeEventListener("resize", positionAvatar);
  }, [positionAvatar]);

  useEffect(
    () => () => {
      if (openTimer.current !== null) window.clearTimeout(openTimer.current);
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [user?.id]
  );

  if (!user) return null;

  const busy = switching || loading;
  function clearHoverTimers() {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }
  function openOnHover(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse") return;
    clearHoverTimers();
    if (open || busy) return;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      openedByHover.current = true;
      positionAvatar();
      setOpen(true);
    }, 120);
  }
  function closeAfterHover(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse") return;
    clearHoverTimers();
    if (!openedByHover.current || busy) return;
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
    }, 160);
  }
  function beginDirectInteraction() {
    clearHoverTimers();
    openedByHover.current = false;
  }
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
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        clearHoverTimers();
        if (next) positionAvatar();
        setOpen(next);
      }}
      modal={false}
    >
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="账户菜单"
          onPointerEnter={openOnHover}
          onPointerLeave={closeAfterHover}
          onPointerDown={beginDirectInteraction}
          onKeyDown={(event) => {
            beginDirectInteraction();
            if (open && event.key === "ArrowDown") {
              event.preventDefault();
              contentRef.current
                ?.querySelector<HTMLElement>(
                  '[role="menuitem"]:not([data-disabled])'
                )
                ?.focus();
            }
          }}
          onClick={(event) => {
            if (event.detail === 0) {
              beginDirectInteraction();
              positionAvatar();
              setOpen((value) => !value);
            }
          }}
          className="group relative z-50 flex h-8 w-8 shrink-0 items-center justify-center rounded-full focus:outline-hidden"
        >
          <span
            style={open ? { translate: `${avatarOffsetX}px 32px` } : undefined}
            className={`relative flex h-full w-full items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background transition-[scale,translate,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background motion-reduce:transition-none ${open ? "scale-[1.75] ring-4 ring-surface shadow-sm" : ""}`}
          >
            <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
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
            </span>
            {open && (
              <span
                aria-hidden
                className={`absolute -right-0.5 -bottom-0.5 flex size-2.5 items-center justify-center rounded-full text-[7px] leading-none font-semibold text-white ring-[1.5px] ring-surface ${teacher.identity === "teacher" ? "bg-role-teacher" : "bg-role-student"}`}
              >
                {teacher.identity === "teacher" ? "师" : "学"}
              </span>
            )}
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        ref={contentRef}
        align="center"
        sideOffset={16}
        className="account-menu-motion z-40 w-56 p-2"
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") clearHoverTimers();
        }}
        onPointerLeave={closeAfterHover}
        onPointerDown={beginDirectInteraction}
        onOpenAutoFocus={(event) => {
          if (openedByHover.current) event.preventDefault();
        }}
        onKeyDownCapture={(event) => {
          beginDirectInteraction();
          if (event.key !== "Tab") return;
          event.stopPropagation();
          tabExiting.current = true;
          triggerRef.current?.focus();
          setOpen(false);
        }}
        onCloseAutoFocus={(event) => {
          if (tabExiting.current || openedByHover.current) {
            event.preventDefault();
            tabExiting.current = false;
          }
          openedByHover.current = false;
        }}
      >
        <DropdownMenuLabel className="pt-8 pb-0 text-center">
          <div className="flex items-center justify-center gap-1.5">
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
        </DropdownMenuLabel>
        <DropdownMenuItem
          asChild
          disabled={busy}
          className="mx-2 min-h-7 justify-center py-0 text-xs text-foreground-muted data-[highlighted]:bg-transparent data-[highlighted]:text-primary"
        >
          <Link
            href="/account/coins"
            onClick={blockBusyNavigation}
            onAuxClick={blockBusyNavigation}
          >
            <CoinBalance id={user.id} />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-2" />
        <DropdownMenuItem asChild disabled={busy} className={MENU_ITEM_CLASS}>
          <Link
            onClick={blockBusyNavigation}
            onAuxClick={blockBusyNavigation}
            href={
              teacher.identity === "teacher"
                ? "/teacher/classes"
                : "/student/practice"
            }
          >
            <MenuIcon>
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </MenuIcon>
            {teacher.identity === "teacher" ? "教学工作台" : "学习工作台"}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild disabled={busy} className={MENU_ITEM_CLASS}>
          <Link
            href="/account"
            onClick={blockBusyNavigation}
            onAuxClick={blockBusyNavigation}
          >
            <MenuIcon>
              <circle cx="12" cy="8" r="4" />
              <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
            </MenuIcon>
            个人中心
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild disabled={busy} className={MENU_ITEM_CLASS}>
          <Link
            href="/account/notifications"
            onClick={blockBusyNavigation}
            onAuxClick={blockBusyNavigation}
          >
            <MenuIcon>
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M10 21h4" />
            </MenuIcon>
            站内通知
          </Link>
        </DropdownMenuItem>
        {teacher.verified && (
          <DropdownMenuItem
            disabled={switching || loading}
            className={MENU_ITEM_CLASS}
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
            <MenuIcon>
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
            </MenuIcon>
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
          <DropdownMenuItem asChild disabled={busy} className={MENU_ITEM_CLASS}>
            <Link
              href="/apply-teacher"
              onClick={blockBusyNavigation}
              onAuxClick={blockBusyNavigation}
            >
              <MenuIcon>
                <path d="m2 9 10-5 10 5-10 5Z" />
                <path d="M6 11v5c3 3 9 3 12 0v-5" />
                <path d="M22 9v6" />
              </MenuIcon>
              申请教师认证
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={toggle} className={MENU_ITEM_CLASS}>
          <MenuIcon>
            {resolved === "dark" ? (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </>
            ) : (
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
            )}
          </MenuIcon>
          {resolved === "dark" ? "浅色模式" : "深色模式"}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-2" />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void handleLogout();
          }}
          disabled={loading || switching}
          className={`${MENU_ITEM_CLASS} data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger`}
        >
          <MenuIcon>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5M21 12H9" />
          </MenuIcon>
          {loading ? "退出中…" : "退出登录"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
