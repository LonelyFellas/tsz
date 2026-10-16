"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@tsz/ui/components";
import {
  exportAvatarCrop,
  getAvatarCrop,
  type AvatarPosition
} from "../avatar-crop";

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

export function AvatarCropDialog({
  file,
  onCancel,
  onConfirm
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState<AvatarPosition>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    position: AvatarPosition;
  } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const url = URL.createObjectURL(file);
    const source = new Image();
    source.onload = () => {
      if (!alive) return;
      if (
        !source.naturalWidth ||
        !source.naturalHeight ||
        source.naturalWidth > 8192 ||
        source.naturalHeight > 8192 ||
        source.naturalWidth * source.naturalHeight > 32_000_000
      ) {
        setError("图片像素过大，请先缩小图片后重试");
        return;
      }
      setImage(source);
    };
    source.onerror = () => {
      if (alive) setError("图片无法读取，请选择有效的 JPG / PNG / WebP 图片");
    };
    source.src = url;
    return () => {
      alive = false;
      source.onload = source.onerror = null;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const crop = image
    ? getAvatarCrop(image.naturalWidth, image.naturalHeight, zoom, position)
    : null;

  async function confirm() {
    if (!image || !crop || busy) return;
    setBusy(true);
    setError("");
    try {
      onConfirm(await exportAvatarCrop(image, crop));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "图片处理失败，请重试");
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="avatar-crop-title"
      aria-describedby="avatar-crop-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-3xl border border-border bg-surface p-6 text-foreground shadow-float backdrop:bg-foreground/30 backdrop:backdrop-blur-sm"
    >
      <h2 id="avatar-crop-title" className="text-xl font-bold tracking-tight">
        裁剪头像
      </h2>
      <p
        id="avatar-crop-description"
        className="mt-2 text-sm leading-6 text-foreground-muted"
      >
        拖动图片或使用方向键调整位置，缩放后确认圆形预览。
      </p>
      {image && crop ? (
        <div className="my-6 flex justify-center">
          <div
            role="group"
            aria-label="调整头像位置"
            tabIndex={0}
            aria-disabled={busy}
            className="relative aspect-square w-64 max-w-full touch-none overflow-hidden rounded-full bg-white ring-4 ring-primary/15 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary cursor-grab active:cursor-grabbing"
            onPointerDown={(event) => {
              if (busy || event.button !== 0 || drag.current) return;
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                position
              };
            }}
            onPointerMove={(event) => {
              const start = drag.current;
              if (busy || !start || event.pointerId !== start.id) return;
              const width = event.currentTarget.getBoundingClientRect().width;
              const extraX = (image.naturalWidth / crop.size - 1) * width;
              const extraY = (image.naturalHeight / crop.size - 1) * width;
              setPosition({
                x: extraX
                  ? clamp(
                      start.position.x +
                        (2 * (event.clientX - start.x)) / extraX
                    )
                  : 0,
                y: extraY
                  ? clamp(
                      start.position.y +
                        (2 * (event.clientY - start.y)) / extraY
                    )
                  : 0
              });
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
            onKeyDown={(event) => {
              const movement: Record<string, AvatarPosition> = {
                ArrowLeft: { x: -0.1, y: 0 },
                ArrowRight: { x: 0.1, y: 0 },
                ArrowUp: { x: 0, y: -0.1 },
                ArrowDown: { x: 0, y: 0.1 }
              };
              const delta = movement[event.key];
              if (!delta || busy) return;
              event.preventDefault();
              setPosition((value) => ({
                x: clamp(value.x + delta.x),
                y: clamp(value.y + delta.y)
              }));
            }}
          >
            {/* 本地原图与 Canvas 共用浏览器解码结果，保留照片方向。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.src}
              alt="圆形头像预览"
              draggable={false}
              className="pointer-events-none absolute select-none max-w-none"
              style={{
                width: `${(image.naturalWidth / crop.size) * 100}%`,
                height: `${(image.naturalHeight / crop.size) * 100}%`,
                left: `${(-crop.x / crop.size) * 100}%`,
                top: `${(-crop.y / crop.size) * 100}%`
              }}
            />
          </div>
        </div>
      ) : !error ? (
        <p
          role="status"
          className="my-6 text-center text-sm text-foreground-muted"
        >
          正在读取图片…
        </p>
      ) : null}
      <label
        htmlFor="avatar-crop-zoom"
        className="flex items-center justify-between text-sm font-medium"
      >
        缩放{" "}
        <span className="text-foreground-muted">{Math.round(zoom * 100)}%</span>
      </label>
      <input
        id="avatar-crop-zoom"
        type="range"
        min={1}
        max={3}
        step={0.01}
        value={zoom}
        disabled={!image || busy}
        onChange={(event) => {
          drag.current = null;
          setZoom(Number(event.target.value));
        }}
        className="mt-2 min-h-11 w-full accent-primary"
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-5 flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={busy}
          onClick={onCancel}
        >
          取消
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={!image || busy}
          onClick={() => void confirm()}
        >
          {busy ? "正在处理…" : "确认并上传"}
        </Button>
      </div>
    </dialog>
  );
}
