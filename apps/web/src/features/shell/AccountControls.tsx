"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { Settings, X } from "lucide-react";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger
} from "@tsz/ui/components";
import { useUserStore } from "@/stores/user";
import { AccountMenu } from "@/features/home/components/AccountMenu";
import { LearningPreferences } from "@/features/student-home/LearningPreferences";
import { ThemeModeControl } from "@/features/theme/ThemeModeControl";
import { NotificationLink } from "./NotificationLink";

export type TopbarPanel = "navigation" | "settings" | "account" | null;

export function AccountControls({
  panel,
  setPanel,
  studying,
  guestPreferences = false
}: {
  panel: TopbarPanel;
  setPanel: Dispatch<SetStateAction<TopbarPanel>>;
  studying: boolean;
  guestPreferences?: boolean;
}) {
  const user = useUserStore((state) => state.user);
  const hydrated = useUserStore((state) => state.hydrated);
  const setAccountOpen = useCallback(
    (open: boolean) => {
      setPanel((current) =>
        open ? "account" : current === "account" ? null : current
      );
    },
    [setPanel]
  );

  return (
    <div className="flex items-center gap-2">
      {hydrated && user ? (
        <>
          <NotificationLink onNavigate={() => setPanel(null)} />
          <AccountMenu
            open={panel === "account"}
            onOpenChange={setAccountOpen}
            disableHover={panel === "navigation" || panel === "settings"}
            preferences={
              studying ? (
                <LearningPreferences userId={user.id} />
              ) : (
                <ThemeModeControl />
              )
            }
          />
        </>
      ) : guestPreferences ? (
        <Popover
          open={panel === "settings"}
          onOpenChange={(open) =>
            setPanel((current) =>
              open ? "settings" : current === "settings" ? null : current
            )
          }
        >
          <PopoverTrigger
            aria-label="偏好设置"
            className="inline-flex size-11 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary data-[state=open]:bg-surface data-[state=open]:text-primary data-[state=open]:shadow-glass"
          >
            <Settings className="size-5" strokeWidth={1.5} aria-hidden />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            aria-label="偏好设置"
            className="tsz-drawer w-[330px] rounded-3xl border-border/60 bg-surface/90 p-5 shadow-float backdrop-blur-xl"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold tracking-tight">偏好设置</h2>
              <PopoverClose
                aria-label="关闭偏好设置"
                className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <X className="size-[18px]" strokeWidth={1.5} aria-hidden />
              </PopoverClose>
            </div>
            <ThemeModeControl />
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
