import { useAiTranslation } from "./i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Divider,
  Flex,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { Popconfirm } from "@tsz/ui/admin/overlays";
import type { OpenCodeProviderConnection } from "@tsz/types";
import { api } from "@/lib/auth";

export function OpenCodeProviders({
  adminId,
  disabled,
  onDisconnected
}: {
  adminId: string;
  disabled: boolean;
  onDisconnected?: () => void;
}) {
  const { t } = useAiTranslation();
  const methodNames: Record<OpenCodeProviderConnection["method"], string> = {
    oauth: t("auth_login"),
    key: "API Key",
    external: t("external_auth"),
    env: t("env")
  };
  const client = useQueryClient();
  const providers = useQuery({
    queryKey: ["opencode-connections", adminId],
    queryFn: ({ signal }) => api.opencode.connectedProviders({ signal }),
    retry: false,
    gcTime: 0
  });
  const change = useMutation({
    mutationFn: ({
      providerId,
      connectionId,
      action
    }: {
      providerId: string;
      connectionId: string;
      action: "activate" | "disconnect";
    }) =>
      action === "activate"
        ? api.opencode.activateConnection(providerId, connectionId)
        : api.opencode.disconnectConnection(providerId, connectionId),
    onSuccess: (_, { action }) => {
      if (action === "disconnect") onDisconnected?.();
    },
    onSettled: async () => {
      await Promise.all(
        [
          "opencode-connections",
          "opencode-connection",
          "opencode-providers",
          "opencode-model-probes",
          "opencode-models",
          "opencode-current-model"
        ].map((key) => client.invalidateQueries({ queryKey: [key, adminId] }))
      );
    }
  });
  const busy = disabled || change.isPending || providers.isFetching;
  return (
    <>
      <Divider />
      <Flex vertical gap={12}>
        <Typography.Text strong>{t("credentials")}</Typography.Text>
        <Typography.Text type="secondary">
          {t("credentials_help")}
        </Typography.Text>
        {providers.isPending && (
          <Typography.Text type="secondary">
            {t("connections_loading")}
          </Typography.Text>
        )}
        {providers.isError ? (
          <Alert
            type="error"
            showIcon
            title={t("providers_failed")}
            action={
              <Button onClick={() => void providers.refetch()}>
                {t("retry")}
              </Button>
            }
          />
        ) : (
          providers.data?.providers.map((provider) => (
            <Flex key={provider.id} vertical gap={8}>
              <Typography.Text strong>{provider.name}</Typography.Text>
              {provider.connections.map((connection) => {
                const name = `${methodNames[connection.method]} · ${connection.label}${connection.id ? ` · …${connection.id.slice(-8)}` : ""}`;
                return (
                  <Flex
                    key={connection.id ?? `env:${connection.label}`}
                    justify="space-between"
                    align="center"
                    gap={12}
                    wrap
                  >
                    <Space wrap>
                      <Typography.Text style={{ overflowWrap: "anywhere" }}>
                        {name}
                      </Typography.Text>
                      {connection.active && (
                        <Tag color="success">{t("current")}</Tag>
                      )}
                    </Space>
                    {connection.id ? (
                      <Space wrap>
                        {!connection.active && (
                          <Popconfirm
                            title={t("switch_confirm")}
                            description={t("switch_help")}
                            okText={t("switch")}
                            cancelText={t("cancel")}
                            styles={{
                              root: {
                                maxWidth: "min(400px, calc(100vw - 48px))"
                              }
                            }}
                            disabled={busy}
                            onConfirm={() =>
                              change
                                .mutateAsync({
                                  providerId: provider.id,
                                  connectionId: connection.id!,
                                  action: "activate"
                                })
                                .catch(() => undefined)
                            }
                          >
                            <Button
                              disabled={busy}
                              aria-label={t("use_credential_label", {
                                provider: provider.name,
                                name
                              })}
                            >
                              {t("use_credential")}
                            </Button>
                          </Popconfirm>
                        )}
                        <Popconfirm
                          title={t("disconnect_confirm", {
                            method: methodNames[connection.method]
                          })}
                          description={
                            connection.active && provider.connections.length > 1
                              ? t("disconnect_fallback")
                              : t("disconnect_help")
                          }
                          okText={t("disconnect")}
                          cancelText={t("cancel")}
                          okButtonProps={{ danger: true }}
                          styles={{
                            root: { maxWidth: "min(400px, calc(100vw - 48px))" }
                          }}
                          disabled={busy}
                          onConfirm={() =>
                            change
                              .mutateAsync({
                                providerId: provider.id,
                                connectionId: connection.id!,
                                action: "disconnect"
                              })
                              .catch(() => undefined)
                          }
                        >
                          <Button
                            danger
                            disabled={busy}
                            aria-label={t("disconnect_label", {
                              provider: provider.name,
                              name
                            })}
                          >
                            {t("logout")}
                          </Button>
                        </Popconfirm>
                      </Space>
                    ) : (
                      <Typography.Text type="secondary">
                        {t("server_managed")}
                      </Typography.Text>
                    )}
                  </Flex>
                );
              })}
            </Flex>
          ))
        )}
        {providers.isSuccess && !providers.data.providers.length && (
          <Typography.Text type="secondary">
            {t("no_providers")}
          </Typography.Text>
        )}
        {change.isError && (
          <Alert type="error" showIcon title={t("credential_unconfirmed")} />
        )}
        {change.isSuccess && (
          <Alert
            type="success"
            showIcon
            title={
              change.variables.action === "activate"
                ? t("credential_switched")
                : t("credential_disconnected")
            }
          />
        )}
      </Flex>
    </>
  );
}
