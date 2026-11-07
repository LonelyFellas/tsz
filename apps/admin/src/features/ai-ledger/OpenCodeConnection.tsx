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
    ? "状态不可用"
    : connection.isPending
      ? "正在读取"
      : !data?.configured
        ? "未配置"
        : pending
          ? "等待授权"
          : connected
            ? "已连接"
            : "未连接";
  const refresh = () => {
    void connection.refetch();
    void client.invalidateQueries({
      queryKey: ["opencode-connections", adminId]
    });
  };

  return (
    <section className="settings-provider" aria-label="OpenCode 账号">
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
            登录授权或 API Key
          </div>
        </div>
        <div className="settings-provider__actions">
          <Button
            type="text"
            icon={<RotateCwIcon />}
            aria-label="刷新 OpenCode 连接状态"
            loading={connection.isFetching}
            onClick={refresh}
          />
          <Button
            aria-label={
              pending
                ? "继续登录 OpenCode"
                : manageOnly
                  ? "管理 OpenCode"
                  : "连接 OpenCode"
            }
            onClick={() => setOpen(true)}
          >
            {pending ? "继续登录" : manageOnly ? "管理" : "连接"}
          </Button>
        </div>
      </div>
      <Drawer
        rootClassName="profile-settings-dialog"
        closable={{ "aria-label": "关闭" }}
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
            <Alert type="error" showIcon title="连接状态读取失败，请刷新。" />
          )}
          {data && !data.configured && (
            <Alert type="info" showIcon title="OpenCode 服务未配置。" />
          )}
          {data?.configured && !data.login_available && (
            <Alert
              type="warning"
              showIcon
              title="此服务不支持登录授权，可添加 API Key。"
            />
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
              {connected ? "重新登录" : "登录授权"}
            </Button>
          )}
          {login.isError && (
            <Alert type="error" showIcon title="登录未能开始，请重试。" />
          )}
          {pending && (
            <Alert
              type="info"
              showIcon
              title="等待你完成 OpenCode 授权"
              description={
                <div className="settings-dialog-content">
                  <Typography.Text>
                    链接于{" "}
                    {new Date(attempt.expires_at).toLocaleTimeString("zh-CN")}{" "}
                    过期。
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
                </div>
              }
            />
          )}
          {status.isError && (
            <Alert
              type="error"
              showIcon
              title="授权结果读取失败"
              action={
                <Button onClick={() => void status.refetch()}>
                  刷新授权结果
                </Button>
              }
            />
          )}
          {cancel.isError && (
            <Alert type="error" showIcon title="取消登录失败，请重试。" />
          )}
          {status.data?.status === "failed" && (
            <Alert
              type="error"
              showIcon
              title="OpenCode 授权失败，请重新连接。"
            />
          )}
          {status.data?.status === "expired" && (
            <Alert
              type="warning"
              showIcon
              title="登录链接已过期，请重新连接。"
            />
          )}
          {status.data?.status === "complete" && (
            <Alert type="success" showIcon title="OpenCode 授权已完成。" />
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
                添加 API Key
              </Button>
            )
          )}
        </div>
      </Drawer>
    </section>
  );
}
