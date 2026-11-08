import { useAiTranslation } from "./i18n";
import { useEffect, useState } from "react";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { LinkIcon, RotateCwIcon } from "lucide-react";
import { Alert, Badge, Button, Space, Typography } from "@tsz/ui/admin/display";
import { Drawer } from "@tsz/ui/admin/overlays";
import type { OpenCodeLogin } from "@tsz/types";
import { api } from "@/lib/auth";
import { OpenCodeProviders } from "./OpenCodeProviders";
import { OpenCodeKeyForm } from "./OpenCodeKeyForm";

export function OpenCodeConnection({ adminId }: { adminId: string }) {
  const { t } = useAiTranslation();
  const client = useQueryClient();
  const [attempt, setAttempt] = useState<OpenCodeLogin>();
  const [open, setOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const keyPending =
    useIsMutating({ mutationKey: ["opencode-connect-key", adminId] }) > 0;
  const connectionKey = ["opencode-connection", adminId];
  const connection = useQuery({
    queryKey: connectionKey,
    queryFn: ({ signal }) => api.opencode.connection({ signal }),
    retry: false,
    gcTime: 0
  });
  const login = useMutation({
    mutationFn: () => api.opencode.login(),
    onSuccess: (value) => {
      setAttempt(value);
    }
  });
  const status = useQuery({
    queryKey: ["opencode-login", adminId, attempt?.attempt_id],
    queryFn: ({ signal }) =>
      api.opencode.loginStatus(attempt!.attempt_id, { signal }),
    enabled: !!attempt,
    retry: false,
    gcTime: 0,
    refetchInterval: (query) =>
      !query.state.error &&
      (!query.state.data || query.state.data.status === "pending")
        ? 2000
        : false
  });
  const cancel = useMutation({
    mutationFn: () => api.opencode.cancelLogin(attempt!.attempt_id),
    onSuccess: () => {
      setAttempt(undefined);
      login.reset();
    }
  });
  useEffect(() => {
    if (status.data?.status === "complete")
      void Promise.all(
        [
          "opencode-connection",
          "opencode-models",
          "opencode-model-probes",
          "opencode-providers",
          "opencode-connections"
        ].map((key) => client.invalidateQueries({ queryKey: [key, adminId] }))
      );
  }, [status.data?.status, client, adminId]);
  const pending =
    !!attempt && (!status.data || status.data.status === "pending");
  const data = connection.isError ? undefined : connection.data;
  const connected = data?.connected;
  const manageOnly = connected || (data?.configured && !data.login_available);
  const state = connection.isError
    ? t("state_unavailable")
    : connection.isPending
      ? t("reading")
      : !data?.configured
        ? t("not_configured")
        : pending
          ? t("awaiting_auth")
          : connected
            ? t("connected")
            : t("not_connected");
  const refresh = () => {
    void connection.refetch();
    void client.invalidateQueries({
      queryKey: ["opencode-connections", adminId]
    });
  };

  return (
    <section className="settings-provider" aria-label={t("opencode_account")}>
      <div className="settings-provider__summary">
        <span className="settings-provider__icon">
          <LinkIcon />
        </span>
        <div className="settings-provider__identity">
          <div className="settings-provider__name">
            OpenCode{" "}
            <Badge
              status={
                connection.isError
                  ? "error"
                  : pending
                    ? "processing"
                    : connected
                      ? "success"
                      : "default"
              }
              text={state}
            />
          </div>
          <div className="settings-provider__description">
            {t("auth_or_key")}
          </div>
        </div>
        <div className="settings-provider__actions">
          <Button
            type="text"
            icon={<RotateCwIcon />}
            aria-label={t("opencode_refresh")}
            loading={connection.isFetching}
            onClick={refresh}
          />
          <Button
            aria-label={
              pending
                ? t("opencode_continue")
                : manageOnly
                  ? t("opencode_manage")
                  : t("opencode_connect")
            }
            onClick={() => setOpen(true)}
          >
            {pending
              ? t("continue_login")
              : manageOnly
                ? t("manage")
                : t("connect")}
          </Button>
        </div>
      </div>
      <Drawer
        rootClassName="profile-settings-dialog"
        closable={{ "aria-label": t("close") }}
        title="OpenCode"
        open={open}
        onClose={() => {
          setOpen(false);
          if (
            !client.isMutating({
              mutationKey: ["opencode-connect-key", adminId]
            })
          )
            setShowKey(false);
        }}
        size={480}
        destroyOnHidden={false}
      >
        <div className="settings-dialog-content">
          {connection.isError && (
            <Alert type="error" showIcon title={t("connection_failed")} />
          )}
          {data && !data.configured && (
            <Alert type="info" showIcon title={t("opencode_not_configured")} />
          )}
          {data?.configured && !data.login_available && (
            <Alert type="warning" showIcon title={t("key_only")} />
          )}
          {!pending && data?.login_available && (
            <Button
              onClick={() => {
                cancel.reset();
                login.mutate();
              }}
              loading={login.isPending}
              disabled={keyPending || cancel.isPending}
            >
              {connected ? t("login_again") : t("auth_login")}
            </Button>
          )}
          {login.isError && (
            <Alert type="error" showIcon title={t("login_failed")} />
          )}
          {pending && (
            <Alert
              type="info"
              showIcon
              title={t("opencode_wait")}
              description={
                <div className="settings-dialog-content">
                  <Typography.Text>
                    {t("link_expiry", {
                      time: new Date(attempt.expires_at).toLocaleTimeString(
                        "zh-CN"
                      )
                    })}
                  </Typography.Text>
                  <Space wrap>
                    <Button
                      type="primary"
                      href={attempt.authorization_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                    >
                      {t("opencode_login")}
                    </Button>
                    <Button
                      loading={cancel.isPending}
                      onClick={() => cancel.mutate()}
                    >
                      {t("cancel_login")}
                    </Button>
                  </Space>
                </div>
              }
            />
          )}
          {status.isError && (
            <Alert
              type="error"
              showIcon
              title={t("auth_read_failed")}
              action={
                <Button onClick={() => void status.refetch()}>
                  {t("refresh_auth")}
                </Button>
              }
            />
          )}
          {cancel.isError && (
            <Alert type="error" showIcon title={t("cancel_failed")} />
          )}
          {status.data?.status === "failed" && (
            <Alert type="error" showIcon title={t("opencode_auth_failed")} />
          )}
          {status.data?.status === "expired" && (
            <Alert type="warning" showIcon title={t("link_expired")} />
          )}
          {status.data?.status === "complete" && (
            <Alert type="success" showIcon title={t("opencode_complete")} />
          )}
          {data?.configured && (
            <OpenCodeProviders
              adminId={adminId}
              disabled={pending || login.isPending || keyPending}
              onDisconnected={() => {
                setAttempt(undefined);
                login.reset();
              }}
            />
          )}
          {showKey ? (
            <OpenCodeKeyForm
              adminId={adminId}
              disabled={
                !data?.configured || pending || login.isPending || keyPending
              }
            />
          ) : (
            data?.configured && (
              <Button
                disabled={pending || login.isPending || keyPending}
                onClick={() => setShowKey(true)}
              >
                {t("add_key")}
              </Button>
            )
          )}
        </div>
      </Drawer>
    </section>
  );
}
