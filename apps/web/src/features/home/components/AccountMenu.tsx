"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUserStore } from "@/stores/user";
import { AccountAvatar } from "./AccountAvatar";
import type { AccountMenuPopoverProps } from "./AccountMenuPopover";

type Menu = typeof import("./AccountMenuPopover").AccountMenuPopover;
let menuModule: Promise<Menu> | undefined;
function loadMenu() {
  return (menuModule ??= import("./AccountMenuPopover")
    .then((module) => module.AccountMenuPopover)
    .catch((error: unknown) => {
      menuModule = undefined;
      throw error;
    }));
}

// 首屏只有可交互的头像；菜单和浮层依赖在用户表达意图后下载。
export function AccountMenu({
  open: controlledOpen,
  onOpenChange,
  disableHover = false
}: Pick<
  AccountMenuPopoverProps,
  "open" | "onOpenChange" | "disableHover"
> = {}) {
  const user = useUserStore((s) => s.user);
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mode = useRef<"hover" | "direct">("hover");
  const trigger = useRef<HTMLButtonElement>(null);
  const [loadingUser, setLoadingUser] = useState<string | null>(null);
  const [view, setView] = useState<{
    Menu: Menu;
    userId: string;
    props: AccountMenuPopoverProps;
  }>();
  useEffect(
    () => () => {
      request.current++;
      clearTimeout(timer.current);
    },
    [user?.id]
  );

  const cancel = useCallback(() => {
    request.current++;
    clearTimeout(timer.current);
    setLoadingUser(null);
    onOpenChange?.(false);
  }, [onOpenChange]);
  useEffect(() => {
    if (controlledOpen === false || disableHover) {
      request.current++;
      clearTimeout(timer.current);
    }
  }, [controlledOpen, disableHover]);
  useEffect(() => {
    if (!user || loadingUser !== user.id || controlledOpen === false) return;
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node)) cancel();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [loadingUser, user, cancel, controlledOpen]);
  function preload() {
    void loadMenu().catch(() => {
      // 真正展开失败时交由全局资源恢复提示处理，预载不打断当前操作。
    });
  }
  async function open(hover: boolean, keyboard = false) {
    if (!user || (hover && disableHover)) return;
    clearTimeout(timer.current);
    onOpenChange?.(true);
    mode.current = hover ? "hover" : "direct";
    const ticket = ++request.current;
    const userId = user.id;
    const restoreTriggerFocus =
      hover && document.activeElement === trigger.current;
    setLoadingUser(userId);
    try {
      const Menu = await loadMenu();
      if (
        ticket !== request.current ||
        useUserStore.getState().user?.id !== userId
      )
        return;
      setView({
        Menu,
        userId,
        props: {
          initialOpen: true,
          initialHover: hover,
          initialKeyboard: keyboard,
          restoreTriggerFocus
        }
      });
      setLoadingUser(null);
    } catch {
      if (
        ticket !== request.current ||
        useUserStore.getState().user?.id !== userId
      )
        return;
      setLoadingUser(null);
      window.dispatchEvent(new Event("tsz:resource-error"));
    }
  }

  if (!user) return null;
  if (view?.userId === user.id)
    return (
      <view.Menu
        {...view.props}
        open={controlledOpen}
        onOpenChange={onOpenChange}
        disableHover={disableHover}
      />
    );
  return (
    <button
      ref={trigger}
      type="button"
      aria-label="账户菜单"
      aria-haspopup="menu"
      aria-expanded={false}
      aria-busy={loadingUser === user.id && controlledOpen !== false}
      onFocus={preload}
      onBlur={cancel}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse" || disableHover) return;
        cancel();
        mode.current = "hover";
        preload();
        timer.current = setTimeout(() => void open(true), 120);
      }}
      onPointerLeave={() => {
        if (mode.current === "hover") cancel();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || event.ctrlKey) return;
        event.preventDefault();
        void open(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          void open(false, true);
        } else if (event.key === "Escape") cancel();
      }}
      onClick={(event) => {
        if (event.detail === 0) void open(false, true);
      }}
      className="group relative z-50 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity focus:outline-hidden aria-busy:cursor-progress aria-busy:opacity-70"
    >
      <AccountAvatar user={user} />
      {loadingUser === user.id && controlledOpen !== false && (
        <span className="sr-only" role="status">
          正在加载账户菜单…
        </span>
      )}
    </button>
  );
}
