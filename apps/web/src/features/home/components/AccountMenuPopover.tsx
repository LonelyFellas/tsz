"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Settings, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatCoins } from "@tsz/shared/format";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@tsz/ui/components/dropdown-menu";
import { useUserStore } from "@/stores/user";
import { displayNameOf } from "@/lib/user";
import { api } from "@/lib/request";
import { useLogout } from "@/features/auth/hooks/useLogout";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";
import { AccountAvatar } from "./AccountAvatar";

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
export interface AccountMenuPopoverProps {
  initialHover?: boolean;
  initialOpen?: boolean;
  initialKeyboard?: boolean;
  restoreTriggerFocus?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disableHover?: boolean;
  preferences?: ReactNode;
}

export function AccountMenuPopover({
  initialHover = false,
  initialOpen = false,
  initialKeyboard = false,
  restoreTriggerFocus = false,
  open: controlledOpen,
  onOpenChange,
  disableHover = false,
  preferences
}: AccountMenuPopoverProps = {}) {
  const user = useUserStore((s) => s.user);
  const router = useRouter();
  const pointerType = useRef("mouse");
  const logout = useLogout();
  const teacher = useTeacherIdentity();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [internalOpen, setInternalOpen] = useState(initialOpen);
  const open = controlledOpen ?? internalOpen;
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferencesSideOffset, setPreferencesSideOffset] = useState(8);
  function setOpen(next: boolean | ((previous: boolean) => boolean)) {
    const value = typeof next === "function" ? next(open) : next;
    if (controlledOpen === undefined) setInternalOpen(value);
    if (!value) setPreferencesOpen(false);
    onOpenChange?.(value);
  }
  const [loading, setLoading] = useState(false);
  const [avatarOffsetX, setAvatarOffsetX] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tabExiting = useRef(false);
  const preferencesTriggerRef = useRef<HTMLDivElement>(null);
  const preferencesContentRef = useRef<HTMLDivElement>(null);
  const openedByHover = useRef(initialHover);
  const initialKeyboardFocus = useRef(initialKeyboard);
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

  useLayoutEffect(() => {
    if (initialOpen) positionAvatar();
    if (restoreTriggerFocus) triggerRef.current?.focus();
  }, [initialOpen, positionAvatar, restoreTriggerFocus]);

  useEffect(() => {
    window.addEventListener("resize", positionAvatar);
    return () => window.removeEventListener("resize", positionAvatar);
  }, [positionAvatar]);

  useLayoutEffect(() => {
    if (!preferencesOpen) return;
    function positionPreferences() {
      const rect = preferencesTriggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(330, window.innerWidth - 24);
      if (
        rect.left >= width + 20 ||
        window.innerWidth - rect.right >= width + 20
      ) {
        setPreferencesSideOffset(8);
      } else {
        // 两侧均放不下时叠在账户菜单上，保留视口两侧的 12px 边距。
        const left = Math.max(
          12,
          Math.min(window.innerWidth - width - 12, rect.left)
        );
        setPreferencesSideOffset(left - rect.right);
      }
    }
    positionPreferences();
    window.addEventListener("resize", positionPreferences);
    return () => window.removeEventListener("resize", positionPreferences);
  }, [preferencesOpen]);

  useEffect(
    () => () => {
      if (openTimer.current !== null) window.clearTimeout(openTimer.current);
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [user?.id]
  );

  useEffect(() => {
    if (!open || disableHover) {
      if (openTimer.current !== null) window.clearTimeout(openTimer.current);
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      openTimer.current = null;
      closeTimer.current = null;
    }
  }, [open, disableHover]);

  if (!user) return null;

  const busy = switching || loading;
  function clearHoverTimers() {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }
  function openOnHover(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || disableHover) return;
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
    const target = event.relatedTarget;
    if (
      target instanceof Node &&
      (triggerRef.current?.contains(target) ||
        contentRef.current?.contains(target) ||
        preferencesContentRef.current?.contains(target))
    )
      return;
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
          onPointerDown={(event) => {
            beginDirectInteraction();
            pointerType.current = event.pointerType || "mouse";
            if (pointerType.current === "mouse") event.preventDefault();
          }}
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
            } else if (pointerType.current === "mouse" && !busy) {
              beginDirectInteraction();
              setOpen(false);
              router.push("/account");
            }
          }}
          className="group relative z-50 flex h-8 w-8 shrink-0 items-center justify-center rounded-full focus:outline-hidden"
        >
          <AccountAvatar
            user={user}
            open={open}
            offsetX={avatarOffsetX}
            identity={teacher.identity}
          />
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
        onInteractOutside={(event) => {
          if (preferencesContentRef.current?.contains(event.target as Node))
            event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          if (openedByHover.current) event.preventDefault();
          else if (initialKeyboardFocus.current) {
            // 首次按键发生在 Radix 挂载前，显式接续它尚未监听到的键盘意图。
            event.preventDefault();
            contentRef.current
              ?.querySelector<HTMLElement>(
                '[role="menuitem"]:not([data-disabled])'
              )
              ?.focus();
          }
          initialKeyboardFocus.current = false;
        }}
        onKeyDownCapture={(event) => {
          beginDirectInteraction();
          if (
            event.key !== "Tab" ||
            !event.currentTarget.contains(event.target as Node)
          )
            return;
          event.stopPropagation();
          tabExiting.current = true;
          triggerRef.current?.focus();
          setOpen(false);
        }}
        onCloseAutoFocus={(event) => {
          if (disableHover || tabExiting.current || openedByHover.current) {
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
                : "/student/home"
            }
          >
            <MenuIcon>
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </MenuIcon>
            {teacher.identity === "teacher" ? "教学工作台" : "学习工作台"}
            <ChevronRight
              className="ml-auto size-4 text-foreground-muted"
              strokeWidth={1.5}
              aria-hidden
            />
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
            <ChevronRight
              className="ml-auto size-4 text-foreground-muted"
              strokeWidth={1.5}
              aria-hidden
            />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub
          open={preferencesOpen}
          onOpenChange={setPreferencesOpen}
        >
          <DropdownMenuSubTrigger
            ref={preferencesTriggerRef}
            disabled={busy}
            className={`${MENU_ITEM_CLASS} data-[state=open]:bg-primary-muted`}
            onPointerLeave={(event) => {
              // 保留入口焦点，避免向左移入面板时被父菜单抢回并关闭子层。
              if (preferencesOpen) event.preventDefault();
            }}
          >
            <Settings
              className="size-[18px] shrink-0"
              strokeWidth={1.5}
              aria-hidden
            />
            偏好设置
            <ChevronRight
              className="ml-auto size-4 text-foreground-muted"
              strokeWidth={1.5}
              aria-hidden
            />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            ref={preferencesContentRef}
            sideOffset={preferencesSideOffset}
            onPointerMove={(event) => event.stopPropagation()}
            avoidCollisions={preferencesSideOffset >= 0}
            role="dialog"
            aria-label="偏好设置"
            className="w-[330px] rounded-3xl border-border/60 bg-surface/95 p-5 backdrop-blur-xl"
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") clearHoverTimers();
            }}
            onPointerLeave={closeAfterHover}
            onKeyDown={(event) => {
              if (event.key === "Tab" && event.target === event.currentTarget) {
                event.preventDefault();
                event.currentTarget
                  .querySelector<HTMLButtonElement>("button")
                  ?.focus();
              }
            }}
          >
            <div
              onKeyDown={(event) => {
                if (event.key !== "Escape") event.stopPropagation();
              }}
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold tracking-tight">偏好设置</h2>
                <button
                  type="button"
                  aria-label="关闭偏好设置"
                  onClick={() => {
                    setPreferencesOpen(false);
                    preferencesTriggerRef.current?.focus();
                  }}
                  className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <X className="size-[18px]" strokeWidth={1.5} aria-hidden />
                </button>
              </div>
              {preferences}
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {teacher.verified && (
          <DropdownMenuItem
            data-leaves-page=""
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
                // A failed or cancelled switch may leave an unsaved editor open.
                window.dispatchEvent(new Event("tsz:page-leave-finished"));
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
              <ChevronRight
                className="ml-auto size-4 text-foreground-muted"
                strokeWidth={1.5}
                aria-hidden
              />
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator className="my-2" />
        <DropdownMenuItem
          data-leaves-page=""
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
