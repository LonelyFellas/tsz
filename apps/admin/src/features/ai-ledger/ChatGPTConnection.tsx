import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OpenAIOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Flex,
  Modal,
  Select,
  Space,
  Tag,
  Typography
} from "antd";
import type { ChatGPTLogin } from "@tsz/types";
import { api } from "@/lib/auth";

export function ChatGPTConnection({ adminId }: { adminId: string }) {
  const client = useQueryClient();
  const [attempt, setAttempt] = useState<ChatGPTLogin>();
  const [revocationUnconfirmed, setRevocationUnconfirmed] = useState(false);
  const [welcome, setWelcome] = useState<string>();
  const accountKey = ["chatgpt-accounts", adminId];
  const accounts = useQuery({
    queryKey: accountKey,
    queryFn: ({ signal }) => api.chatgpt.accounts({ signal }),
    retry: false,
    gcTime: 0
  });
  const active = accounts.data?.accounts.find(
    (a) => a.client_id === accounts.data.active
  );
  const status = useQuery({
    queryKey: ["chatgpt-login", adminId, attempt?.attempt_id],
    queryFn: ({ signal }) =>
      api.chatgpt.loginStatus(attempt!.attempt_id, { signal }),
    enabled: !!attempt,
    retry: false,
    gcTime: 0,
    refetchInterval: (query) =>
      !query.state.error &&
      (!query.state.data || query.state.data.status === "pending")
        ? 2000
        : false
  });
  const refresh = async () => {
    await Promise.all(
      [
        "chatgpt-accounts",
        "opencode-model-probes",
        "opencode-current-model"
      ].map((key) => client.invalidateQueries({ queryKey: [key, adminId] }))
    );
  };
  const login = useMutation({
    mutationFn: (clientId: string | null) => api.chatgpt.login(clientId),
    onSuccess: (value) => {
      setAttempt(value);
      setRevocationUnconfirmed(false);
    }
  });
  const cancel = useMutation({
    mutationFn: () => api.chatgpt.cancelLogin(attempt!.attempt_id),
    onSuccess: async (value) => {
      client.setQueryData(
        ["chatgpt-login", adminId, attempt!.attempt_id],
        value
      );
      if (value.status !== "pending") setAttempt(undefined);
      await refresh();
    }
  });
  const useAccount = useMutation({
    mutationFn: (id: string) => api.chatgpt.useAccount(id),
    onSuccess: async () => {
      setAttempt(undefined);
      await refresh();
    }
  });
  const logout = useMutation({
    mutationFn: (id: string) => api.chatgpt.logout(id),
    onSuccess: async (result) => {
      setAttempt(undefined);
      setRevocationUnconfirmed(!result.remote_revoked);
      await refresh();
    }
  });
  useEffect(() => {
    if (!attempt && accounts.data?.pending_login)
      setAttempt(accounts.data.pending_login);
  }, [attempt, accounts.data?.pending_login]);
  useEffect(() => {
    if (status.data?.status === "complete") {
      void Promise.all(
        [
          "chatgpt-accounts",
          "opencode-model-probes",
          "opencode-current-model"
        ].map((key) => client.invalidateQueries({ queryKey: [key, adminId] }))
      );
    }
  }, [status.data?.status, client, adminId]);
  useEffect(() => {
    if (status.data?.status === "complete" && active?.plan_enabled) {
      const key = `tsz-chatgpt-plan-notice:${adminId}:${active.client_id}`;
      try {
        if (localStorage.getItem(key)) return;
      } catch {
        /* Storage may be unavailable; the notice can still be dismissed. */
      }
      setWelcome(key);
    }
  }, [status.data?.status, active?.client_id, active?.plan_enabled, adminId]);
  const pending =
    !!attempt && (!status.data || status.data.status === "pending");
  const busy =
    login.isPending ||
    cancel.isPending ||
    useAccount.isPending ||
    logout.isPending;
  const available = !!accounts.data?.configured && !accounts.isError;
  const label = accounts.isError
    ? "状态不可用"
    : accounts.isPending
      ? "正在读取"
      : active?.signed_in
        ? active.plan_enabled
          ? "已授权套餐"
          : "已登录，未授权套餐"
        : "未登录";
  const dismissWelcome = () => {
    try {
      if (welcome) localStorage.setItem(welcome, "1");
    } catch {
      /* No credentials are stored in the browser. */
    }
    setWelcome(undefined);
  };

  return (
    <section aria-label="ChatGPT 账号">
      <Flex vertical gap={12}>
        <Flex justify="space-between" align="center" wrap gap={12}>
          <Space>
            <OpenAIOutlined />
            <Typography.Text strong>ChatGPT</Typography.Text>
            <Tag>{label}</Tag>
          </Space>
          <Button
            icon={<ReloadOutlined />}
            loading={accounts.isFetching}
            onClick={() => void refresh()}
            aria-label="刷新 ChatGPT 账号状态"
          >
            刷新状态
          </Button>
        </Flex>
        <Typography.Text>
          使用你的 ChatGPT 套餐完成出题。请在运行 Agent
          的同一台电脑上打开授权页面。
        </Typography.Text>
        {!!accounts.data?.accounts.length && !accounts.isError && (
          <Select
            aria-label="ChatGPT 账号"
            style={{ width: 520, maxWidth: "100%" }}
            value={accounts.data.active ?? undefined}
            disabled={busy || pending}
            loading={useAccount.isPending}
            options={accounts.data.accounts.map((account) => ({
              value: account.client_id,
              label: `${account.email || "ChatGPT 账号"} · ${account.client_id}${account.signed_in ? "" : "（已退出）"}`
            }))}
            onChange={(id) => {
              useAccount.reset();
              useAccount.mutate(id);
            }}
          />
        )}
        <Space wrap>
          <Button
            icon={<OpenAIOutlined />}
            disabled={!available || pending || busy}
            loading={login.isPending}
            onClick={() => {
              cancel.reset();
              login.mutate(active?.client_id ?? null);
            }}
          >
            Continue with ChatGPT
          </Button>
          {active && (
            <Button
              disabled={!available || pending || busy}
              onClick={() => login.mutate(null)}
            >
              添加其他账号
            </Button>
          )}
          {active?.signed_in && (
            <Button
              disabled={!available || pending || busy}
              loading={logout.isPending}
              onClick={() => {
                logout.reset();
                logout.mutate(active.client_id);
              }}
            >
              退出 ChatGPT
            </Button>
          )}
          <Typography.Link
            href="https://chatgpt.com/settings/usage"
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            管理 ChatGPT 用量
          </Typography.Link>
        </Space>
        {!accounts.isError && accounts.data && !accounts.data.configured && (
          <Alert
            type="info"
            showIcon
            title="此 Agent 尚未启用 ChatGPT 登录，请先在本机启用后刷新。"
          />
        )}
        {accounts.isError && (
          <Alert
            type="error"
            showIcon
            title="无法读取 ChatGPT 账号状态，请刷新重试。"
          />
        )}
        {(login.isError || useAccount.isError || logout.isError) && (
          <Alert
            type="error"
            showIcon
            title="ChatGPT 账号操作未完成，请刷新状态后重试；若已有登录正在进行，请先完成或取消。"
          />
        )}
        {active?.signed_in && !active.plan_enabled && !accounts.isError && (
          <Alert
            type="warning"
            showIcon
            title="该账号尚未授权套餐使用，请重新登录并授权后再选择模型。"
          />
        )}
        {revocationUnconfirmed && (
          <Alert
            type="warning"
            showIcon
            title="本地已退出，远端撤销未确认。请前往 ChatGPT 用量设置断开此应用。"
          />
        )}
        {pending && (
          <Alert
            type="info"
            showIcon
            title="等待完成 ChatGPT 授权"
            description={
              <Flex vertical gap={8}>
                <Typography.Text>
                  在官方页面登录并授权，完成后自动刷新账号与模型。授权链接有效至{" "}
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
                    前往 ChatGPT 授权
                  </Button>
                  <Button
                    loading={cancel.isPending}
                    onClick={() => cancel.mutate()}
                  >
                    取消 ChatGPT 登录
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
            title="暂时无法确认 ChatGPT 授权结果，请刷新结果或取消登录后重试。"
            action={
              <Button onClick={() => void status.refetch()}>
                刷新授权结果
              </Button>
            }
          />
        )}
        {cancel.isError && (
          <Alert
            type="error"
            showIcon
            title="取消 ChatGPT 登录失败，请重试。"
          />
        )}
        {status.data?.status === "failed" && (
          <Alert
            type="error"
            showIcon
            title={
              status.data.error === "denied"
                ? "你已取消 ChatGPT 授权，可重新登录。"
                : "ChatGPT 授权未完成，请重新登录。"
            }
          />
        )}
        {status.data?.status === "expired" && (
          <Alert
            type="warning"
            showIcon
            title="ChatGPT 登录链接已过期，请重新登录。"
          />
        )}
        {status.data?.status === "complete" && (
          <Alert
            type="success"
            showIcon
            title="ChatGPT 登录已完成。请在下方显式探测并选择出题模型。"
          />
        )}
        <Typography.Text>
          账号状态反映本机保存的授权，模型是否可用以探测结果为准。切换账号后需重新探测；已有任务继续使用原账号和模型。
        </Typography.Text>
      </Flex>
      <Modal
        open={!!welcome}
        title="你正在使用 ChatGPT 套餐"
        okText="知道了"
        cancelButtonProps={{ hidden: true }}
        onOk={dismissWelcome}
        onCancel={dismissWelcome}
      >
        符合条件的出题与探测请求会使用你的 ChatGPT
        套餐或已授权的额度。你可以在“管理 ChatGPT
        用量”中查看和调整应用限制；登录不会自动切换当前出题模型。
      </Modal>
    </section>
  );
}
