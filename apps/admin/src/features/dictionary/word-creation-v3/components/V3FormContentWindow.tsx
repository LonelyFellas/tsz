import {
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type PointerEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GripHorizontalIcon,
  GripVerticalIcon,
  XIcon
} from "lucide-react";
import { Button } from "@tsz/ui/admin/display";
import { OverlayLayer } from "@tsz/ui/admin/overlays";
import { useLexiconEditorTranslation } from "../../i18n/editor";

type Point = { x: number; y: number };
const GAP = 16;
const VISIBLE_EDGE = 48;

/** 收起只隐藏内容，保持本地草稿、语音任务及嵌套弹窗的挂载。 */
export function V3FormContentWindow({
  title,
  children,
  footer,
  onClose
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const layer = useContext(OverlayLayer) + 10;
  const id = useId();
  const panel = useRef<HTMLElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [horizontalEdge, setHorizontalEdge] = useState<"left" | "right">();
  const point = useRef<Point | undefined>(undefined);
  const drag = useRef<
    | {
        id: number;
        start: Point;
        origin: Point;
      }
    | undefined
  >(undefined);
  const place = useCallback((next?: Point) => {
    const node = panel.current;
    if (!node) return;
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft ?? 0) + GAP;
    const top = (viewport?.offsetTop ?? 0) + GAP;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const rect = node.getBoundingClientRect();
    const requested = next ??
      point.current ?? {
        x: left + (width - GAP * 2 - rect.width) / 2,
        y: Math.max(
          top,
          Math.min(top + 32, top + height - GAP * 2 - rect.height)
        )
      };
    const current = {
      x: Math.max(
        left - GAP - rect.width + VISIBLE_EDGE,
        Math.min(requested.x, left - GAP + width - VISIBLE_EDGE)
      ),
      y: Math.max(
        top - GAP - rect.height + VISIBLE_EDGE,
        Math.min(requested.y, top - GAP + height - VISIBLE_EDGE)
      )
    };
    point.current = current;
    node.style.left = `${current.x}px`;
    node.style.top = `${current.y}px`;
    setHorizontalEdge(
      current.x < left - GAP
        ? "left"
        : current.x + rect.width > left - GAP + width
          ? "right"
          : undefined
    );
    const visibleTop = Math.max(0, top - GAP - current.y);
    const visibleBottom = Math.min(rect.height, top - GAP + height - current.y);
    node.style.setProperty(
      "--v3-content-window-edge-top",
      `${(visibleTop + visibleBottom - 32) / 2}px`
    );
  }, []);

  useLayoutEffect(() => {
    handle.current?.focus({ preventScroll: true });
  }, []);
  useLayoutEffect(() => {
    const refresh = () => place();
    refresh();
    const observer = new ResizeObserver(refresh);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("scroll", refresh);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", refresh);
      window.visualViewport?.removeEventListener("resize", refresh);
      window.visualViewport?.removeEventListener("scroll", refresh);
    };
  }, [place]);
  useLayoutEffect(() => place(), [collapsed, place]);

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const dragHandlers: ButtonHTMLAttributes<HTMLButtonElement> = {
    onPointerDown: (event) => {
      if (event.button !== 0 || event.isPrimary === false || !point.current)
        return;
      if (!collapsed && window.innerWidth <= 767) return;
      drag.current = {
        id: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        origin: point.current
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event) => {
      const active = drag.current;
      if (!active || active.id !== event.pointerId) return;
      event.preventDefault();
      place({
        x: active.origin.x + event.clientX - active.start.x,
        y: active.origin.y + event.clientY - active.start.y
      });
    },
    onPointerUp: finishDrag,
    onPointerCancel: finishDrag,
    onLostPointerCapture: finishDrag,
    onKeyDown: (event) => {
      if (!collapsed && window.innerWidth <= 767) return;
      const step = event.shiftKey ? 24 : 8;
      const moves: Record<string, Point> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step }
      };
      const move = moves[event.key];
      if (!move || !point.current) return;
      event.preventDefault();
      place({
        x: point.current.x + move.x,
        y: point.current.y + move.y
      });
    }
  };

  return createPortal(
    <OverlayLayer.Provider value={layer}>
      <section
        ref={panel}
        role="dialog"
        aria-modal="false"
        aria-labelledby={id}
        className={`v3-content-window${collapsed ? " is-collapsed" : ""}`}
        style={{ zIndex: layer }}
        onKeyDown={(event) => {
          if (
            event.key === "Escape" &&
            event.target instanceof Element &&
            event.target.closest('[role="dialog"]') === panel.current
          ) {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="v3-content-window-header">
          <button
            ref={handle}
            type="button"
            className="v3-content-window-handle"
            aria-label={t("drag_item", { label: title })}
            {...dragHandlers}
          >
            <span id={id}>{title}</span>
          </button>
          <Button
            type="text"
            aria-label={t(collapsed ? "expand" : "collapse")}
            aria-expanded={!collapsed}
            aria-controls={`${id}-body`}
            icon={collapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <Button
            type="text"
            aria-label={t("close_content_settings")}
            icon={<XIcon />}
            onClick={onClose}
          />
        </header>
        <div
          id={`${id}-body`}
          className="v3-content-window-body"
          hidden={collapsed}
          aria-hidden={collapsed}
          inert={collapsed}
        >
          {children}
        </div>
        <footer hidden={collapsed} aria-hidden={collapsed} inert={collapsed}>
          <button
            type="button"
            className="v3-content-window-handle v3-content-window-footer-handle"
            aria-label={t("drag_item", { label: title })}
            {...dragHandlers}
          >
            <GripHorizontalIcon size={20} aria-hidden="true" />
          </button>
          <div className="v3-content-window-footer-actions">{footer}</div>
        </footer>
        <button
          type="button"
          className="v3-content-window-handle v3-content-window-edge-handle"
          data-side={horizontalEdge}
          hidden={!horizontalEdge}
          aria-label={t("drag_item", { label: title })}
          {...dragHandlers}
        >
          <GripVerticalIcon size={20} aria-hidden="true" />
        </button>
      </section>
    </OverlayLayer.Provider>,
    document.body
  );
}
