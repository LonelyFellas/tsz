import { useRef, useState, useSyncExternalStore } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  WifiOffIcon
} from "lucide-react";
import { Button } from "@tsz/ui/admin/display";
import { Popover } from "@tsz/ui/admin/overlays";
import { useAdminTranslation } from "@/i18n";

import "./admin-connection-status.css";

function subscribeNetwork(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
const isOnline = () => navigator.onLine;

export function AdminConnectionStatus({
  connectionError,
  refreshUnconfirmed,
  retrying,
  onRetry
}: {
  connectionError: boolean;
  refreshUnconfirmed: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useAdminTranslation();
  const online = useSyncExternalStore(subscribeNetwork, isOnline);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const state = refreshUnconfirmed
    ? "sign_in"
    : retrying
      ? "connecting"
      : !online
        ? "offline"
        : connectionError
          ? "unavailable"
          : "connected";
  const Icon =
    state === "connecting"
      ? LoaderCircleIcon
      : state === "offline"
        ? WifiOffIcon
        : state === "connected"
          ? CheckIcon
          : CircleAlertIcon;

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next && contentRef.current?.contains(document.activeElement))
      triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={changeOpen}
      fresh
      zIndex={110}
      classNames={{ container: "admin-connection__popover" }}
      content={
        <div ref={contentRef}>
          <h2 className="admin-connection__title">
            {t(`connection_${state}_title`)}
          </h2>
          <p className="admin-connection__description">
            {t(`connection_${state}_help`)}
          </p>
          {state !== "connected" && (
            <Button
              block
              loading={retrying}
              onClick={() => {
                if (refreshUnconfirmed) window.location.assign("/login");
                else {
                  triggerRef.current?.focus({ preventScroll: true });
                  onRetry();
                }
              }}
            >
              {t(refreshUnconfirmed ? "recovery_sign_in" : "recovery_retry")}
            </Button>
          )}
        </div>
      }
    >
      <Button
        ref={triggerRef}
        type="text"
        className="admin-connection__trigger"
        data-state={state}
        aria-label={t(`connection_${state}`)}
      >
        <Icon
          size={16}
          aria-hidden="true"
          className={
            state === "connecting" ? "admin-connection__spinner" : undefined
          }
        />
        <span role="status" aria-live="polite" aria-atomic="true">
          {t(`connection_${state}`)}
        </span>
        <ChevronDownIcon size={12} aria-hidden="true" />
      </Button>
    </Popover>
  );
}
