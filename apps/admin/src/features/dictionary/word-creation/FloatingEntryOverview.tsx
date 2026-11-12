import {
  useLayoutEffect,
  useCallback,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type PointerEvent
} from "react";
import { createPortal } from "react-dom";
import { FileTextIcon, XIcon } from "lucide-react";
import { Button } from "@tsz/ui/admin/display";
import { useWorkspaceTranslation } from "../i18n/workspace";

const POSITION_KEY = "tsz:entry-overview-position";
const SIZE = 54;
const GAP = 16;
type Point = { x: number; y: number };
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, Math.max(min, max)));

export function FloatingEntryOverview({
  children,
  pageRef
}: {
  children: ReactNode;
  pageRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useWorkspaceTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const point = useRef<Point | null>(null);
  const drag = useRef<{
    id: number;
    start: Point;
    origin: Point;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  const place = useCallback(
    (next?: Point) => {
      const button = buttonRef.current;
      const panel = panelRef.current;
      if (!button || !panel) return;
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft ?? 0) + GAP;
      const top = (viewport?.offsetTop ?? 0) + GAP;
      const right = left + (viewport?.width ?? window.innerWidth) - GAP * 2;
      let bottom = top + (viewport?.height ?? window.innerHeight) - GAP * 2;
      const footer = pageRef.current
        ?.querySelector(".word-step-actions")
        ?.getBoundingClientRect();
      if (
        footer &&
        footer.height > 0 &&
        footer.top > top &&
        footer.top < bottom &&
        footer.bottom > top
      )
        bottom = footer.top - GAP;
      const requested = next ??
        point.current ?? { x: right - SIZE, y: bottom - SIZE };
      const current = {
        x: clamp(requested.x, left, right - SIZE),
        y: clamp(requested.y, top, bottom - SIZE)
      };
      point.current = current;
      button.style.left = `${current.x}px`;
      button.style.top = `${current.y}px`;
      const width = Math.min(340, right - left);
      const above = Math.max(0, current.y - top - 8);
      const below = Math.max(0, bottom - current.y - SIZE - 8);
      const showAbove = above >= below;
      panel.style.width = `${width}px`;
      panel.style.left = `${clamp(current.x + SIZE - width, left, right - width)}px`;
      panel.style.maxHeight = `${Math.min(560, showAbove ? above : below)}px`;
      panel.style.top = showAbove ? "auto" : `${current.y + SIZE + 8}px`;
      panel.style.bottom = showAbove
        ? `${window.innerHeight - current.y + 8}px`
        : "auto";
    },
    [pageRef]
  );

  function remember() {
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(point.current));
    } catch {
      /* 存储不可用时仍可拖动。 */
    }
  }

  useLayoutEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null");
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y))
        point.current = stored;
    } catch {
      /* 忽略损坏或不可访问的位置记录。 */
    }
    const refresh = () => place();
    refresh();
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    window.visualViewport?.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("scroll", refresh);
    const observer = new ResizeObserver(refresh);
    if (pageRef.current) observer.observe(pageRef.current);
    const footer = pageRef.current?.querySelector(".word-step-actions");
    if (footer) observer.observe(footer);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
      window.visualViewport?.removeEventListener("resize", refresh);
      window.visualViewport?.removeEventListener("scroll", refresh);
    };
  }, [pageRef, place]);

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.id !== event.pointerId) return;
    suppressClick.current = drag.current.moved;
    if (drag.current.moved) remember();
    drag.current = null;
    event.currentTarget.classList.remove("is-dragging");
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  return createPortal(
    <div
      className="word-creation-floating"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <Button
        ref={buttonRef}
        type="primary"
        shape="circle"
        className="word-summary-ball"
        disabled={false}
        icon={<FileTextIcon aria-hidden="true" />}
        aria-label={t(open ? "overview_close" : "overview_open")}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        onClick={(event) => {
          if (event.detail !== 0 && suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          suppressClick.current = false;
          place();
          setOpen(!open);
        }}
        onPointerDown={(event) => {
          if (
            drag.current ||
            event.isPrimary === false ||
            event.button !== 0 ||
            !point.current
          )
            return;
          suppressClick.current = false;
          drag.current = {
            id: event.pointerId,
            start: { x: event.clientX, y: event.clientY },
            origin: point.current,
            moved: false
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.id !== event.pointerId) return;
          const dx = event.clientX - active.start.x,
            dy = event.clientY - active.start.y;
          if (!active.moved && Math.hypot(dx, dy) < 5) return;
          active.moved = true;
          event.currentTarget.classList.add("is-dragging");
          event.preventDefault();
          place({ x: active.origin.x + dx, y: active.origin.y + dy });
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
        onKeyDown={(event) => {
          const delta = event.shiftKey ? 24 : 8;
          const moves: Record<string, Point> = {
            ArrowLeft: { x: -delta, y: 0 },
            ArrowRight: { x: delta, y: 0 },
            ArrowUp: { x: 0, y: -delta },
            ArrowDown: { x: 0, y: delta }
          };
          const move = moves[event.key];
          if (!move || !point.current) return;
          event.preventDefault();
          place({ x: point.current.x + move.x, y: point.current.y + move.y });
          remember();
        }}
      />
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${id}-title`}
        className="word-summary-popover word-creation-progress-drawer"
        hidden={!open}
        inert={!open}
      >
        <header className="word-summary-popover-header">
          <strong id={`${id}-title`}>{t("overview")}</strong>
          <Button
            type="text"
            disabled={false}
            icon={<XIcon aria-hidden="true" />}
            aria-label={t("overview_close")}
            onClick={close}
          />
        </header>
        {children}
      </div>
    </div>,
    document.body
  );
}
