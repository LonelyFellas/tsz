import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinkOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Flex, Space, Tag, Typography } from "antd";
import type { OpenCodeLogin } from "@tsz/types";
import { api } from "@/lib/auth";
import { OpenCodeModels } from "./OpenCodeModels";

export function OpenCodeConnection({ adminId }: { adminId: string }) {
  const client = useQueryClient();
  const [attempt, setAttempt] = useState<OpenCodeLogin>();
  const connectionKey = ["opencode-connection", adminId];
  const connection = useQuery({
    queryKey: connectionKey,
    queryFn: ({ signal }) => api.opencode.connection({ signal }),
    retry: false,
    gcTime: 0
  });
  const login = useMutation({
    mutationFn: () => api.opencode.login(),
    onSuccess: setAttempt
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
          "opencode-providers"
        ].map((key) => client.invalidateQueries({ queryKey: [key, adminId] }))
      );
  }, [status.data?.status, client, adminId]);

  const pending =
    !!attempt && (!status.data || status.data.status === "pending");
  const data = connection.isError ? undefined : connection.data;
  const connected = data?.connected;
  const state = connection.isError
    ? "连接状态不可用"
    : connection.isPending
      ? "正在检查"
      : connected
        ? "已连接"
        : "未连接";
  const failed = status.data?.status === "failed";
  const expired = status.data?.status === "expired";

  return (
    <Card
      title={
        <Space>
          OpenCode<Tag color={connected ? "success" : "default"}>{state}</Tag>
        </Space>
      }
    >
      <Flex vertical gap={12}>
        <Flex justify="space-between" align="center" wrap gap={12}>
          <Typography.Text type="secondary">
            登录 OpenCode Console，将账号连接到服务器，选择要使用的出题模型。
          </Typography.Text>
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              aria-label="刷新 OpenCode 连接状态"
              loading={connection.isFetching}
              onClick={() => void connection.refetch()}
            >
              刷新状态
            </Button>
            {!pending && (
              <Button
                type="primary"
                icon={<LinkOutlined />}
                loading={login.isPending}
                disabled={!data?.configured || !data.login_available}
                onClick={() => {
                  cancel.reset();
                  login.mutate();
                }}
              >
                {connected ? "重新连接 OpenCode" : "连接 OpenCode"}
              </Button>
            )}
          </Space>
        </Flex>
        {connection.isError && (
          <Alert
            type="error"
            showIcon
            title="无法读取 OpenCode 连接状态，请刷新重试。"
          />
        )}
        {data && !data.configured && (
          <Alert
            type="info"
            showIcon
            title="服务器尚未配置 OpenCode 服务，配置完成后即可在这里登录。"
          />
        )}
        {data?.configured && !data.login_available && (
          <Alert
            type="warning"
            showIcon
            title="当前 OpenCode 服务不支持账号授权，请检查服务版本和连接配置。"
          />
        )}
        {login.isError && (
          <Alert
            type="error"
            showIcon
            title="未能发起 OpenCode 登录，请重试。"
          />
        )}
        {pending && (
          <Alert
            type="info"
            showIcon
            title="等待你完成 OpenCode 授权"
            description={
              <Flex vertical gap={8}>
                <Typography.Text>
                  在官方页面登录并授权，完成后这里会自动更新。链接有效至{" "}
                  {new Date(attempt.expires_at).toLocaleTimeString("zh-CN")}。
                </Typography.Text>
                <Space wrap>
                  <Button
                    type="primary"
                    href={attempt.authorization_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    前往 OpenCode 登录
                  </Button>
                  <Button
                    loading={cancel.isPending}
                    onClick={() => cancel.mutate()}
                  >
                    取消登录
                  </Button>
                </Space>
              </Flex>
            }
          />
        )}
        {status.isError && (
          <Alert
            type="error"
            showIcon
            title="暂时无法确认授权结果"
            description="可以刷新授权结果；请勿重复授权。"
            action={
              <Button
                size="small"
                loading={status.isFetching}
                onClick={() => void status.refetch()}
              >
                刷新授权结果
              </Button>
            }
          />
        )}
        {cancel.isError && (
          <Alert type="error" showIcon title="取消登录失败，请重试。" />
        )}
        {failed && (
          <Alert
            type="error"
            showIcon
            title="OpenCode 授权失败，请重新连接。"
          />
        )}
        {expired && (
          <Alert type="warning" showIcon title="登录链接已过期，请重新连接。" />
        )}
        {status.data?.status === "complete" && (
          <Alert type="success" showIcon title="OpenCode 授权已完成。" />
        )}
      </Flex>
      <OpenCodeModels
        key={adminId}
        adminId={adminId}
        configured={!!data?.configured}
      />
    </Card>
  );
}
