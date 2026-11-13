import { useAdminTranslation } from "@/i18n";
import { DictionaryFormTypeLabels } from "@/features/dictionary/part-of-speech/FormTypeLabels";
import { DictionaryPartOfSpeechLabels } from "@/features/dictionary/part-of-speech/PartOfSpeechLabels";
import {
  XIcon,
  LayoutGridIcon,
  ChevronDownIcon,
  NotebookTextIcon
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useOutletContext } from "react-router-dom";
import type { RootOutletContext } from "@/providers";
import { AdminHeader } from "@/features/auth/AdminHeader";
import { BusinessPermissionGuard } from "@/features/auth/BusinessPermissionGuard";
import { adminAccountIdentity } from "@/lib/adminAuthorization";
import { useAuthStore } from "@/lib/auth";
import { AdminRouteGuard } from "@/features/auth/AdminRouteGuard";
import { ConsoleSidebar } from "@/features/console/ConsoleSidebar";

import "./console-shell.css";

// 顶栏始终位于业务表格的固定列之上。
export const CONSOLE_HEADER_Z_INDEX = 100;

export function ConsoleLayout() {
  const { t } = useAdminTranslation();
  const rootContext = useOutletContext<RootOutletContext | undefined>();
  const identity = useAuthStore((s) => adminAccountIdentity(s.profile));
  const { pathname } = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [navigationLeft, setNavigationLeft] = useState(16);

  const changeNavigationOpen = (open: boolean) => {
    if (open && triggerRef.current) {
      const width = Math.min(540, window.innerWidth - 32);
      setNavigationLeft(
        Math.max(
          16,
          Math.min(
            triggerRef.current.getBoundingClientRect().left,
            window.innerWidth - width - 16
          )
        )
      );
    }
    setNavigationOpen(open);
  };

  useEffect(() => {
    if (!navigationOpen) return;
    const reposition = () => {
      const width = Math.min(540, window.innerWidth - 32);
      setNavigationLeft(
        Math.max(
          16,
          Math.min(
            triggerRef.current?.getBoundingClientRect().left ?? 16,
            window.innerWidth - width - 16
          )
        )
      );
    };
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [navigationOpen]);

  useEffect(() => setNavigationOpen(false), [pathname]);

  return (
    <AdminRouteGuard>
      <Dialog.Root
        open={navigationOpen}
        onOpenChange={changeNavigationOpen}
        modal={false}
      >
        <div className="console-shell">
          <div className="console-workspace">
            <header
              className="console-topbar"
              style={{ zIndex: CONSOLE_HEADER_Z_INDEX }}
            >
              <div className="console-header-left">
                <Link
                  to="/"
                  className="console-brand"
                  aria-label={t("nav_brand_home")}
                >
                  <span className="console-brand-mark">
                    <NotebookTextIcon size={20} aria-hidden="true" />
                  </span>
                  <span>天生会背</span>
                </Link>
                <Dialog.Trigger asChild>
                  <button
                    ref={triggerRef}
                    type="button"
                    className="console-navigation-trigger"
                  >
                    <LayoutGridIcon size={16} aria-hidden="true" />
                    <span>{t("nav_menu")}</span>
                    <ChevronDownIcon size={14} aria-hidden="true" />
                  </button>
                </Dialog.Trigger>
              </div>
              <div className="console-header-account">
                {rootContext?.connectionStatus}
                <AdminHeader />
              </div>
            </header>
            <main className="console-content">
              <BusinessPermissionGuard key={identity}>
                {pathname.startsWith("/words") ? (
                  <DictionaryFormTypeLabels>
                    <DictionaryPartOfSpeechLabels>
                      <Outlet />
                    </DictionaryPartOfSpeechLabels>
                  </DictionaryFormTypeLabels>
                ) : (
                  <Outlet />
                )}
              </BusinessPermissionGuard>
            </main>
          </div>
        </div>
        <Dialog.Portal>
          <Dialog.Content
            className="console-navigation-panel"
            style={{ left: navigationLeft }}
            aria-describedby={undefined}
          >
            <div className="console-navigation-heading">
              <Dialog.Title>{t("nav_menu")}</Dialog.Title>
              <div className="console-navigation-dismiss">
                <kbd aria-hidden="true">Esc</kbd>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="console-navigation-close"
                    aria-label={t("nav_close")}
                  >
                    <XIcon />
                  </button>
                </Dialog.Close>
              </div>
            </div>
            <ConsoleSidebar
              showBrand={false}
              presentation="panel"
              onNavigate={() => setNavigationOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AdminRouteGuard>
  );
}
