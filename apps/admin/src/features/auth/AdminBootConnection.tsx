import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react";
import { Button, Card } from "@tsz/ui/admin/display";
import { useAdminTranslation } from "@/i18n";
import { FullscreenCenter } from "@/layouts/FullscreenCenter";
import "./admin-boot-connection.css";

export function AdminBootConnection({
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
  const state = refreshUnconfirmed
    ? "sign_in"
    : retrying || !connectionError
      ? "connecting"
      : "unavailable";
  const Icon = state === "connecting" ? LoaderCircleIcon : CircleAlertIcon;
  const title =
    state === "sign_in"
      ? t("connection_sign_in_title")
      : state === "unavailable"
        ? t("connection_unavailable_title")
        : t("connection_connecting_title");
  const description =
    state === "sign_in"
      ? t("connection_sign_in_help")
      : state === "unavailable"
        ? t("boot_connection_unavailable_help")
        : t("boot_connection_connecting_help");

  return (
    <FullscreenCenter vertical>
      <section
        className={`admin-boot-connection admin-boot-connection--${state}`}
        role={state === "connecting" ? "status" : "alert"}
        aria-live="polite"
        aria-labelledby="admin-boot-connection-title"
      >
        <Card
          title={
            <div className="admin-boot-connection__heading">
              <Icon
                aria-hidden="true"
                className={
                  state === "connecting"
                    ? "admin-boot-connection__spinner"
                    : undefined
                }
              />
              <h1 id="admin-boot-connection-title">{title}</h1>
            </div>
          }
        >
          <p className="admin-boot-connection__description">{description}</p>
          <Button
            block
            type={state === "connecting" ? "default" : "primary"}
            loading={retrying}
            onClick={() => {
              if (refreshUnconfirmed) window.location.assign("/login");
              else onRetry();
            }}
          >
            {refreshUnconfirmed
              ? t("recovery_sign_in")
              : t("recovery_retry_connection")}
          </Button>
        </Card>
      </section>
    </FullscreenCenter>
  );
}
