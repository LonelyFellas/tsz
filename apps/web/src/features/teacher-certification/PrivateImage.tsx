"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import styles from "./PrivateImage.module.css";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";

export function PrivateImage({ id, label }: { id: string; label: string }) {
  const userId = useUserStore((s) => s.user?.id);
  const [preview, setPreview] = useState<{
    id: string;
    owner: string;
    url?: string;
    failed?: boolean;
  }>();
  const [attempt, setAttempt] = useState(0);
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    let url: string | undefined;
    void api.teacherCertification
      .file(id, { signal: controller.signal })
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setPreview({ id, owner: userId, url });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setPreview({ id, owner: userId, failed: true });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, userId, attempt]);
  const current =
    preview?.id === id && preview.owner === userId ? preview : undefined;
  const expanded = !!current?.url && expandedUrl === current.url;
  return (
    <>
      <div className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-xl bg-muted">
        {current?.url ? (
          <button
            type="button"
            aria-label={`预览${label}`}
            aria-haspopup="dialog"
            onClick={() => setExpandedUrl(current.url!)}
            className="group relative h-full w-full cursor-zoom-in rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Image
              src={current.url}
              alt={label}
              fill
              unoptimized
              className="object-contain"
            />
            <span className="absolute bottom-2 right-2 rounded-full bg-foreground/80 px-2.5 py-1 text-xs text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
              预览
            </span>
          </button>
        ) : current?.failed ? (
          <button
            type="button"
            className="px-3 text-xs text-primary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            图片加载失败，点击重试
          </button>
        ) : (
          <span className="text-xs text-foreground-muted">正在读取材料…</span>
        )}
      </div>
      {expanded && (
        <ImagePreview
          src={current.url!}
          label={label}
          onClose={() => setExpandedUrl(null)}
        />
      )}
    </>
  );
}

type Point = { x: number; y: number };
type ImageView = Point & { zoom: number; rotation: number };
const INITIAL_VIEW: ImageView = { x: 0, y: 0, zoom: 1, rotation: 0 };
const TOOL_BUTTON =
  "flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-2 text-foreground-muted transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-30";

function ImagePreview({
  src,
  label,
  onClose
}: {
  src: string;
  label: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [view, setView] = useState(INITIAL_VIEW);
  const viewRef = useRef(view);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{
    view: ImageView;
    center: Point;
    distance: number;
  } | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height
      });
      const next = { ...viewRef.current, zoom: 1, x: 0, y: 0 };
      viewRef.current = next;
      setView(next);
      pointers.current.clear();
      gesture.current = null;
    });
    observer.observe(frame.current!);
    return () => {
      observer.disconnect();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const sideways = view.rotation % 180 !== 0;
  const fit =
    natural.width && natural.height && size.width && size.height
      ? Math.min(
          size.width / (sideways ? natural.height : natural.width),
          size.height / (sideways ? natural.width : natural.height)
        )
      : 0;

  function update(next: ImageView) {
    const maxX = Math.max(
      0,
      ((next.rotation % 180 ? natural.height : natural.width) *
        fit *
        next.zoom -
        size.width) /
        2
    );
    const maxY = Math.max(
      0,
      ((next.rotation % 180 ? natural.width : natural.height) *
        fit *
        next.zoom -
        size.height) /
        2
    );
    next = {
      ...next,
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y))
    };
    viewRef.current = next;
    setView(next);
  }

  function measurePointers() {
    const points = [...pointers.current.values()];
    const first = points[0];
    if (!first) return null;
    const second = points[1] ?? first;
    const bounds = frame.current!.getBoundingClientRect();
    return {
      center: {
        x: (first.x + second.x) / 2 - bounds.left - bounds.width / 2,
        y: (first.y + second.y) / 2 - bounds.top - bounds.height / 2
      },
      distance: Math.hypot(first.x - second.x, first.y - second.y),
      count: points.length
    };
  }

  function startGesture() {
    const sample = measurePointers();
    gesture.current = sample ? { view: viewRef.current, ...sample } : null;
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });
    const sample = measurePointers()!;
    const origin = gesture.current;
    const zoom =
      sample.count > 1 && origin.distance
        ? Math.max(
            1,
            Math.min(5, (origin.view.zoom * sample.distance) / origin.distance)
          )
        : origin.view.zoom;
    const ratio = zoom / origin.view.zoom;
    update({
      ...origin.view,
      zoom,
      x: sample.center.x - (origin.center.x - origin.view.x) * ratio,
      y: sample.center.y - (origin.center.y - origin.view.y) * ratio
    });
  }

  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    startGesture();
  }

  function zoomBy(factor: number) {
    const current = viewRef.current;
    update({
      ...current,
      zoom: Math.max(1, Math.min(5, current.zoom * factor))
    });
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          dialog.current?.close();
      }}
      className={`${styles.dialog} overflow-hidden bg-surface text-foreground shadow-2xl backdrop:bg-black/70`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5">
        <h2 id={titleId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="旋转图片"
            title="旋转图片"
            className={TOOL_BUTTON}
            onClick={() => {
              pointers.current.clear();
              gesture.current = null;
              update({ ...INITIAL_VIEW, rotation: (view.rotation + 90) % 360 });
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden
            >
              <path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="缩小图片"
            title="缩小图片"
            disabled={view.zoom <= 1}
            className={TOOL_BUTTON}
            onClick={() => zoomBy(1 / 1.5)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden
            >
              <path d="M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="适应屏幕"
            title="适应屏幕"
            className={`${TOOL_BUTTON} text-xs tabular-nums`}
            onClick={() => update({ ...view, zoom: 1, x: 0, y: 0 })}
          >
            {view.zoom === 1 ? "适应" : `${Math.round(view.zoom * 100)}%`}
          </button>
          <button
            type="button"
            aria-label="放大图片"
            title="放大图片"
            disabled={view.zoom >= 5}
            className={TOOL_BUTTON}
            onClick={() => zoomBy(1.5)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden
            >
              <path d="M5 12h14M12 5v14" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="关闭预览"
            title="关闭预览"
            autoFocus
            className={TOOL_BUTTON}
            onClick={() => dialog.current?.close()}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
      <div
        ref={frame}
        role="group"
        aria-label="图片查看区域"
        className={`relative min-h-0 touch-none overflow-hidden bg-muted ${view.zoom > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY
          });
          startGesture();
        }}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
        onLostPointerCapture={pointerEnd}
      >
        {/* 已鉴权的 Blob 图片需要按原始比例旋转和缩放。 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          draggable={false}
          onLoad={(event) =>
            setNatural({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight
            })
          }
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
          style={
            fit
              ? {
                  width: natural.width * fit,
                  height: natural.height * fit,
                  maxWidth: "none",
                  left: "50%",
                  top: "50%",
                  transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) rotate(${view.rotation}deg) scale(${view.zoom})`
                }
              : undefined
          }
        />
      </div>
    </dialog>
  );
}
