"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
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
  return (
    <div className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-xl bg-muted">
      {current?.url ? (
        <Image
          src={current.url}
          alt={label}
          fill
          unoptimized
          className="object-contain"
        />
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
  );
}
