"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode
} from "react";
import { FolderTree, Pin, PinOff, X } from "lucide-react";

function useMedia(query: string) {
  return useSyncExternalStore(
    (callback) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", callback);
      return () => media.removeEventListener("change", callback);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
const focusable =
  'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';
export function ResponsiveExplorer({
  children,
  overlayActive = false
}: {
  children: (controls: { closeDrawer: () => void }) => ReactNode;
  overlayActive?: boolean;
}) {
  const wide = useMedia("(min-width: 1024px)");
  const hover = useMedia("(hover: hover) and (pointer: fine)");
  const drawer = !wide && !hover;
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const scrollPosition = useRef(0);
  const userScroll = useRef(false);
  useLayoutEffect(() => {
    userScroll.current = false;
    panel.current
      ?.querySelector<HTMLElement>("[data-explorer-scroll]")
      ?.scrollTo({ top: scrollPosition.current });
  }, [wide, drawer, open]);
  useEffect(() => {
    let frame = 0;
    const resized = () => {
      userScroll.current = false;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        panel.current
          ?.querySelector<HTMLElement>("[data-explorer-scroll]")
          ?.scrollTo({ top: scrollPosition.current })
      );
    };
    window.addEventListener("resize", resized);
    return () => {
      window.removeEventListener("resize", resized);
      cancelAnimationFrame(frame);
    };
  }, []);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  function clearTimers() {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  }
  function close() {
    clearTimers();
    setOpen(false);
    setPinned(false);
  }
  useEffect(
    () => () => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    },
    []
  );
  useLayoutEffect(() => {
    if (wide || drawer || !open) return;
    const position = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect || !panel.current) return;
      panel.current.style.setProperty(
        "--explorer-top",
        `${Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 160))}px`
      );
      panel.current.style.setProperty(
        "--explorer-left",
        `${Math.max(16, Math.min(rect.left, window.innerWidth - Math.min(360, window.innerWidth - 32) - 16))}px`
      );
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [wide, drawer, open]);
  useEffect(() => {
    if (wide || !open) return;
    const inside = (target: EventTarget | null) =>
      target instanceof Element &&
      (panel.current?.contains(target) ||
        trigger.current?.contains(target) ||
        target.closest("[data-explorer-popup]"));
    const pointer = (event: PointerEvent) => {
      clearTimeout(closeTimer.current);
      if (drawer || pinned || overlayActive || inside(event.target)) return;
      closeTimer.current = setTimeout(() => {
        setOpen(false);
      }, 250);
    };
    const outside = (event: PointerEvent) => {
      if (!overlayActive && !inside(event.target)) {
        clearTimeout(closeTimer.current);
        setOpen(false);
        setPinned(false);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (
        overlayActive ||
        document.querySelector('[data-explorer-popup][data-state="open"]') ||
        (event.target instanceof Element &&
          event.target.closest("[data-explorer-popup],dialog[open]"))
      )
        return;
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        setOpen(false);
        setPinned(false);
        trigger.current?.focus();
      }
      if (drawer && event.key === "Tab") {
        const controls = [
          ...(panel.current?.querySelectorAll<HTMLElement>(focusable) ?? [])
        ].filter((el) => el.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panel.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("pointermove", pointer);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key, true);
    return () => {
      clearTimeout(closeTimer.current);
      document.removeEventListener("pointermove", pointer);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key, true);
    };
  }, [wide, open, drawer, pinned, overlayActive]);
  useEffect(() => {
    if (!drawer || !open || !panel.current) return;
    const changed: { element: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement = panel.current;
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (
          sibling !== branch &&
          sibling instanceof HTMLElement &&
          !sibling.hasAttribute("data-explorer-overlay")
        ) {
          changed.push({
            element: sibling,
            inert: sibling.hasAttribute("inert")
          });
          sibling.setAttribute("inert", "");
        }
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    const returnFocus = trigger.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current.focus();
    return () => {
      changed.forEach(({ element, inert }) => {
        element.toggleAttribute("inert", inert);
      });
      document.body.style.overflow = overflow;
      returnFocus?.focus();
    };
  }, [drawer, open]);
  const visible = wide || open;
  return (
    <>
      <div className="col-span-full flex items-center gap-3 border-b border-border/70 px-4 py-3 lg:hidden">
        <button
          ref={trigger}
          type="button"
          aria-label="目录"
          aria-expanded={open}
          aria-controls="responsive-wordlist-explorer"
          onPointerEnter={(event) => {
            if (wide || !hover || event.pointerType === "touch") return;
            clearTimers();
            openTimer.current = setTimeout(() => setOpen(true), 150);
          }}
          onPointerLeave={() => {
            clearTimeout(openTimer.current);
            if (!pinned && !overlayActive)
              closeTimer.current = setTimeout(() => setOpen(false), 250);
          }}
          onClick={() => {
            clearTimers();
            if (open && pinned) close();
            else {
              setOpen(true);
              setPinned(true);
            }
          }}
          className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
        >
          <FolderTree className="size-4" aria-hidden />
          目录
        </button>
        <span className="text-xs text-foreground-subtle">
          {hover ? "悬停展开 · 点击保持打开" : "点击查看文件夹和词表"}
        </span>
      </div>
      {drawer && open && (
        <div
          data-explorer-overlay
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/30"
          onClick={close}
        />
      )}
      <aside
        id="responsive-wordlist-explorer"
        ref={panel}
        tabIndex={-1}
        onWheelCapture={() => {
          userScroll.current = true;
        }}
        onTouchMoveCapture={() => {
          userScroll.current = true;
        }}
        onPointerDownCapture={() => {
          userScroll.current = true;
        }}
        onKeyDownCapture={(event) => {
          if (
            [
              "ArrowUp",
              "ArrowDown",
              "PageUp",
              "PageDown",
              "Home",
              "End"
            ].includes(event.key)
          )
            userScroll.current = true;
        }}
        onScrollCapture={(event) => {
          if (
            userScroll.current &&
            event.target instanceof HTMLElement &&
            event.target.hasAttribute("data-explorer-scroll")
          )
            scrollPosition.current = event.target.scrollTop;
        }}
        hidden={!visible}
        role={drawer && open ? "dialog" : !wide ? "region" : undefined}
        aria-modal={drawer && open ? true : undefined}
        aria-label={wide ? "目录区域" : drawer ? "目录抽屉" : "目录浮层"}
        onPointerEnter={() => clearTimeout(closeTimer.current)}
        className={`${visible ? "flex" : "hidden"} flex-col bg-surface outline-none ${wide ? "relative border-r border-border/70 bg-muted/55" : drawer ? "fixed inset-y-0 left-0 z-50 w-[min(88vw,360px)] border-r border-border shadow-float" : "fixed left-[var(--explorer-left)] top-[var(--explorer-top)] z-50 max-h-[calc(100dvh-var(--explorer-top)-16px)] w-[360px] max-w-[calc(100vw-2rem)] overflow-visible rounded-xl border border-border shadow-float"}`}
      >
        {!wide && (
          <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-2">
            <span className="text-xs text-foreground-muted">
              {drawer
                ? "文件夹与词表"
                : pinned
                  ? "目录已保持打开"
                  : "快速浏览目录"}
            </span>
            <div className="flex gap-1">
              {!drawer && (
                <button
                  aria-label={pinned ? "取消固定目录" : "固定目录"}
                  aria-pressed={pinned}
                  onClick={() => setPinned(!pinned)}
                  className="rounded p-2 hover:bg-muted"
                >
                  {pinned ? (
                    <PinOff className="size-4" />
                  ) : (
                    <Pin className="size-4" />
                  )}
                </button>
              )}
              <button
                aria-label="关闭目录"
                onClick={close}
                className="rounded p-2 hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}
        {children({
          closeDrawer: () => {
            if (drawer) {
              setOpen(false);
              setPinned(false);
            }
          }
        })}
      </aside>
    </>
  );
}
