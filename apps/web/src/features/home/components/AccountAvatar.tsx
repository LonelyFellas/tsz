"use client";

import Image from "next/image";
import { useState } from "react";
import type { User } from "@tsz/types";
import { displayNameOf } from "@/lib/user";
import { env } from "@/lib/env";

const SITE_ORIGIN = new URL(env.NEXT_PUBLIC_SITE_URL).origin;

export function AccountAvatar({
  user,
  open = false,
  offsetX = 0,
  identity = "student"
}: {
  user: User;
  open?: boolean;
  offsetX?: number;
  identity?: "student" | "teacher";
}) {
  const [errorUrl, setErrorUrl] = useState("");
  const [loadedUrl, setLoadedUrl] = useState("");
  const displayName = displayNameOf(user);
  const initial = Array.from(displayName)[0]!.toUpperCase();
  const showImage = !!user.avatar_url && user.avatar_url !== errorUrl;
  // 本站原图走 Next 的内部 API 代理，避免缩略图回取再次占用公网出口。
  const localAvatarPath = user.avatar_url.startsWith(`${SITE_ORIGIN}/`)
    ? user.avatar_url.slice(SITE_ORIGIN.length)
    : user.avatar_url;
  const avatarSrc = /^\/api\/v1\/avatars\/[0-9a-f-]+$/i.test(localAvatarPath)
    ? localAvatarPath
    : user.avatar_url;

  return (
    <span
      style={open ? { translate: `${offsetX}px 32px` } : undefined}
      className={`relative flex h-full w-full items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background transition-[scale,translate,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background motion-reduce:transition-none ${open ? "scale-[1.75] ring-4 ring-surface shadow-sm" : ""}`}
    >
      <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full">
        <span aria-hidden>{initial}</span>
        {showImage && (
          <Image
            key={user.avatar_url}
            src={avatarSrc}
            alt={displayName}
            width={56}
            height={56}
            loading="eager"
            fetchPriority="high"
            // 只优化本站公开头像端点；历史外部头像保持直连。
            unoptimized={
              !/^\/api\/v1\/avatars\/[0-9a-f-]+$/i.test(avatarSrc) &&
              !/^https:\/\/(?:test\.|www\.)?tianshengzhi\.com\/api\/v1\/avatars\/[^/?#]+$/.test(
                avatarSrc
              )
            }
            className={`absolute inset-0 h-full w-full bg-white object-cover ${loadedUrl === user.avatar_url ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setLoadedUrl(user.avatar_url)}
            onError={() => setErrorUrl(user.avatar_url)}
          />
        )}
      </span>
      {open && (
        <span
          aria-hidden
          className={`absolute -right-0.5 -bottom-0.5 flex size-2.5 items-center justify-center rounded-full text-[7px] leading-none font-semibold text-white ring-[1.5px] ring-surface ${identity === "teacher" ? "bg-role-teacher" : "bg-role-student"}`}
        >
          {identity === "teacher" ? "师" : "学"}
        </span>
      )}
    </span>
  );
}
