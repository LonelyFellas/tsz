import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Divider,
  Flex,
  Popconfirm,
  Space,
  Tag,
  Typography
} from "antd";
import type { OpenCodeProviderConnection } from "@tsz/types";
import { api } from "@/lib/auth";

const methodNames: Record<OpenCodeProviderConnection["method"], string> = {
  oauth: "登录授权",
  key: "API Key",
  external: "外部授权",
  env: "环境变量"
};

export function OpenCodeProviders({
  adminId,
  disabled,
  onDisconnected
}: {
  adminId: string;
  disabled: boolean;
  onDisconnected?: () => void;
}) {
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
        <Typography.Text strong>模型供应商凭据</Typography.Text>
        <Typography.Text type="secondary">
          同一供应商使用一份当前凭据。切换会影响后续调用，可能改变计费账户。
        </Typography.Text>
        {providers.isPending && (
          <Typography.Text type="secondary">正在读取连接…</Typography.Text>
        )}
        {providers.isError ? (
          <Alert
            type="error"
            showIcon
            title="无法读取供应商连接，请重试。"
            action={
              <Button onClick={() => void providers.refetch()}>重试</Button>
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
                      {connection.active && <Tag color="success">当前使用</Tag>}
                    </Space>
                    {connection.id ? (
                      <Space wrap>
                        {!connection.active && (
                          <Popconfirm
                            title="切换到这份凭据？"
                            description="该供应商的后续请求将使用这份凭据，切换后需要重新探测模型。"
                            okText="确认切换"
                            cancelText="取消"
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
                              aria-label={`使用 ${provider.name} ${name}`}
                            >
                              使用此凭据
                            </Button>
                          </Popconfirm>
                        )}
                        <Popconfirm
                          title={`登出这份${methodNames[connection.method]}？`}
                          description={
                            connection.active && provider.connections.length > 1
                              ? "仅删除这份凭据。OpenCode 将自动使用剩余凭据，可能改变计费账户；可先取消并切换到你想使用的凭据。"
                              : "仅删除这份凭据，其他凭据会保留。使用它的后续请求可能失败。"
                          }
                          okText="确认登出"
                          cancelText="取消"
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
                            aria-label={`登出 ${provider.name} ${name}`}
                          >
                            登出
                          </Button>
                        </Popconfirm>
                      </Space>
                    ) : (
                      <Typography.Text type="secondary">
                        需在服务器侧管理
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
            暂无已连接的模型供应商。
          </Typography.Text>
        )}
        {change.isError && (
          <Alert
            type="error"
            showIcon
            title="未能确认凭据操作完成，请刷新连接后重试。"
          />
        )}
        {change.isSuccess && (
          <Alert
            type="success"
            showIcon
            title={
              change.variables.action === "activate"
                ? "当前凭据已切换，请重新探测模型。"
                : "这份凭据已登出，其他凭据已保留；当前使用项以列表为准。"
            }
          />
        )}
      </Flex>
    </>
  );
}
