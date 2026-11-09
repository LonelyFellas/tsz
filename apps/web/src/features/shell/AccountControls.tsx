"use client";
import { useWebText } from "@/i18n/client";
import { webShell } from "@/i18n/messages/shell";

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
import { InterfaceLanguage } from "@/i18n/InterfaceLanguage";
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
  const uiText = useWebText(webShell);
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
                <div className="space-y-6">
                  <ThemeModeControl />
                  <InterfaceLanguage />
                </div>
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
            aria-label={uiText("webShell:preferences")}
            className="inline-flex size-11 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary data-[state=open]:bg-surface data-[state=open]:text-primary data-[state=open]:shadow-glass"
          >
            <Settings className="size-5" strokeWidth={1.5} aria-hidden />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            aria-label={uiText("webShell:preferences")}
            className="tsz-drawer w-[330px] rounded-3xl border-border/60 bg-surface/90 p-5 shadow-float backdrop-blur-xl"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold tracking-tight">
                {uiText("webShell:preferences")}
              </h2>
              <PopoverClose
                aria-label={uiText("webShell:close_preferences")}
                className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <X className="size-[18px]" strokeWidth={1.5} aria-hidden />
              </PopoverClose>
            </div>
            <div className="space-y-6">
              <ThemeModeControl />
              <InterfaceLanguage />
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
