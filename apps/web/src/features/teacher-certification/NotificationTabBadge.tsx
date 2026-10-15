"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";

export function NotificationTabBadge() {
  const userId = useUserStore((state) => state.user?.id);
  const hydrated = useUserStore((state) => state.hydrated);
  const query = useQuery({
    queryKey: ["notifications", userId, 1],
    queryFn: () => api.teacherCertification.notifications(1),
    enabled: hydrated && !!userId,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: "always"
  });
  const count = hydrated && userId ? (query.data?.unread_count ?? 0) : 0;

  useEffect(() => {
    if (count <= 0) return;
    const prefix = `(${count}) `;
    let baseTitle = document.title;
    let appliedTitle = "";
    let disposed = false;
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.type = "image/png";
    icon.sizes = "64x64";
    const source = document.querySelector<HTMLLinkElement>('link[rel="icon"]');

    function sync() {
      // Next 的路由切换会重新写入标题和图标，保留新页面的标题。
      if (document.title !== appliedTitle) baseTitle = document.title;
      appliedTitle = prefix + baseTitle;
      if (document.title !== appliedTitle) document.title = appliedTitle;
      if (icon.href) {
        const icons = document.head.querySelectorAll('link[rel="icon"]');
        if (icons[icons.length - 1] !== icon) document.head.append(icon);
      }
    }
    const observer = new MutationObserver(sync);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true
    });
    sync();

    if (source) {
      const image = new Image();
      image.onload = () => {
        if (disposed) return;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 64;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(image, 0, 0, 64, 64);
        const label = count > 99 ? "99+" : String(count);
        const width = label.length === 1 ? 30 : label.length === 2 ? 40 : 48;
        context.fillStyle = "#dc2626";
        context.beginPath();
        context.roundRect(64 - width, 0, width, 30, 15);
        context.fill();
        context.fillStyle = "#ffffff";
        context.font = `bold ${label.length === 3 ? 20 : 24}px sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(label, 64 - width / 2, 16);
        icon.href = canvas.toDataURL("image/png");
        sync();
      };
      image.src = source.href;
    }

    return () => {
      disposed = true;
      observer.disconnect();
      icon.remove();
      if (document.title === appliedTitle) document.title = baseTitle;
    };
  }, [count]);

  return null;
}
