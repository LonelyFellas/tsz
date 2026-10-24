"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useUserStore } from "@/stores/user";
import { notificationQuery } from "@/features/teacher-certification/notification-query";

export function NotificationLink({ onNavigate }: { onNavigate: () => void }) {
  const userId = useUserStore((state) => state.user?.id);
  const hydrated = useUserStore((state) => state.hydrated);
  const query = useQuery({
    ...notificationQuery(userId),
    enabled: hydrated && !!userId
  });
  const count = hydrated && userId ? (query.data?.unread_count ?? 0) : 0;

  if (!hydrated || !userId) return null;

  return (
    <Link
      href="/account/notifications"
      onClick={onNavigate}
      aria-label={count > 0 ? `站内通知，${count} 条未读` : "站内通知"}
      title="站内通知"
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
    >
      <Bell className="size-5" strokeWidth={1.5} aria-hidden />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute top-0.5 right-0 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4 font-medium text-primary-foreground ring-2 ring-background"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
