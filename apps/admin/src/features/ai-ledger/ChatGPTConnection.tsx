import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OpenAIOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Flex,
  Form,
  Input,
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
  const [open, setOpen] = useState(false);
  const [sshHost, setSshHost] = useState("");
  const [remoteIntent, setRemoteIntent] = useState<"current" | "new">();
  const setup = useQuery({
    queryKey: ["chatgpt-setup", adminId],
    queryFn: ({ signal }) => api.chatgpt.setup({ signal }),
    retry: false,
    gcTime: 0
  });
  const remote = setup.data?.login_method === "ssh";
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
        "chatgpt-setup",
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
      setRemoteIntent(undefined);
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
    if (
      setup.data?.login_method === "local" &&
      !attempt &&
      accounts.data?.pending_login
    ) {
      setAttempt(accounts.data.pending_login);
      setOpen(true);
    }
  }, [setup.data?.login_method, attempt, accounts.data?.pending_login]);
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
    if (
      open &&
      (remote || status.data?.status === "complete") &&
      active?.plan_enabled
    ) {
      const key = `tsz-chatgpt-plan-notice:${adminId}:${active.client_id}`;
      try {
        if (localStorage.getItem(key)) return;
      } catch {
        /* Storage may be unavailable; the notice can still be dismissed. */
      }
      setWelcome(key);
    }
  }, [
    open,
    remote,
    status.data?.status,
    active?.client_id,
    active?.plan_enabled,
    adminId
  ]);
  const pending =
    !remote && !!attempt && (!status.data || status.data.status === "pending");
  const hostValid = /^(?:[a-zA-Z0-9_.-]+@)?[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(
    sshHost.trim()
  );
  const selectedRemote = remoteIntent === "new" ? undefined : active?.client_id;
  const accountValid =
    !selectedRemote ||
    /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/.test(selectedRemote);
  const remoteCommand =
    hostValid && accountValid
      ? `uv run python -m tsz_agent.auth login chatgpt --ssh-host '${sshHost.trim()}'${selectedRemote ? ` --account '${selectedRemote}'` : ""}`
      : undefined;
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
      : accounts.data && !accounts.data.configured
        ? "未启用"
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
    <section className="settings-provider" aria-label="ChatGPT 账号">
      <div className="settings-provider__summary">
        <span className="settings-provider__icon">
          <OpenAIOutlined />
        </span>
        <div className="settings-provider__identity">
          <div className="settings-provider__name">
            ChatGPT{" "}
            <Badge
              status={
                accounts.isError || setup.isError
                  ? "error"
                  : pending
                    ? "processing"
                    : active?.signed_in
                      ? "success"
                      : "default"
              }
              text={
                setup.isError ? "登录暂不可用" : pending ? "等待授权" : label
              }
            />
          </div>
          <div className="settings-provider__description">
            {active?.email || "使用 ChatGPT 套餐"}
          </div>
        </div>
        <div className="settings-provider__actions">
          <Button
            type="text"
            icon={<ReloadOutlined />}
            loading={accounts.isFetching || setup.isFetching}
            onClick={() => void refresh()}
            aria-label="刷新 ChatGPT 账号状态"
          />
          <Button
            aria-label={
              pending
                ? "继续登录 ChatGPT"
                : active?.signed_in
                  ? "管理 ChatGPT"
                  : "登录 ChatGPT"
            }
            loading={login.isPending}
            disabled={setup.isPending || setup.isError || !available}
            onClick={() => {
              setOpen(true);
              if (!remote && !active?.signed_in && !pending) {
                cancel.reset();
                login.mutate(active?.client_id ?? null);
              }
            }}
          >
            {pending ? "继续登录" : active?.signed_in ? "管理" : "登录"}
          </Button>
        </div>
      </div>
      <Drawer
        rootClassName="profile-settings-dialog"
        closable={{ "aria-label": "关闭" }}
        title="ChatGPT 账号"
        open={open}
        onClose={() => setOpen(false)}
        size={480}
        destroyOnHidden={false}
      >
        <div className="settings-dialog-content">
          <Tag>{label}</Tag>
          {!remote && (
            <Typography.Text>请在运行 Agent 的电脑上登录。</Typography.Text>
          )}
          {!!accounts.data?.accounts.length && !accounts.isError && (
            <Select
              aria-label="ChatGPT 账号"
              style={{ width: 520, maxWidth: "100%" }}
              value={accounts.data.active ?? undefined}
              disabled={busy || pending}
              loading={useAccount.isPending}
              options={accounts.data.accounts.map((account) => ({
                value: account.client_id,
                label: `${account.email || "ChatGPT 账号"}${(accounts.data?.accounts.length ?? 0) > 1 ? ` (${account.client_id.slice(-6)})` : ""}${account.signed_in ? "" : "（已退出）"}`
              }))}
              onChange={(id) => {
                useAccount.reset();
                useAccount.mutate(id);
              }}
            />
          )}
          <Space wrap>
            {!remote && (
              <Button
                icon={<OpenAIOutlined />}
                disabled={
                  !available ||
                  setup.isPending ||
                  setup.isError ||
                  pending ||
                  busy
                }
                loading={login.isPending}
                onClick={() => {
                  cancel.reset();
                  login.mutate(active?.client_id ?? null);
                }}
              >
                Continue with ChatGPT
              </Button>
            )}
            {remote && active?.signed_in && (
              <Button
                disabled={busy}
                onClick={() => setRemoteIntent("current")}
              >
                重新登录
              </Button>
            )}
            {active && (
              <Button
                disabled={!available || pending || busy}
                onClick={() =>
                  remote ? setRemoteIntent("new") : login.mutate(null)
                }
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
          {setup.isError && (
            <Alert
              type="error"
              showIcon
              title="无法确认登录方式，请刷新状态后重试。"
            />
          )}
          {remote &&
            available &&
            (!active?.signed_in || remoteIntent !== undefined) && (
              <section className="settings-ssh" aria-label="在电脑上登录">
                <Typography.Title level={5}>在电脑上登录</Typography.Title>
                <Flex vertical gap={12}>
                  <Form
                    layout="vertical"
                    initialValues={{ ssh_host: sshHost }}
                    onValuesChange={(values: { ssh_host?: string }) =>
                      setSshHost(values.ssh_host ?? "")
                    }
                  >
                    <Form.Item
                      name="ssh_host"
                      label="SSH 主机"
                      rules={[
                        { required: true, message: "请填写 SSH 主机" },
                        {
                          pattern:
                            /^(?:[a-zA-Z0-9_.-]+@)?[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,
                          message: "请使用 SSH 配置名称或 user@主机名"
                        }
                      ]}
                    >
                      <Input
                        placeholder="例如 tshb-test"
                        maxLength={253}
                        autoComplete="off"
                      />
                    </Form.Item>
                  </Form>
                  <Typography.Text>
                    在电脑的 tsz-agent 目录运行：
                  </Typography.Text>
                  {remoteCommand && (
                    <Typography.Paragraph
                      className="settings-ssh__command"
                      copyable={{ text: remoteCommand }}
                    >
                      <code>{remoteCommand}</code>
                    </Typography.Paragraph>
                  )}
                  <Button
                    loading={accounts.isFetching}
                    onClick={() => void refresh()}
                  >
                    刷新账号
                  </Button>
                </Flex>
              </section>
            )}
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
              title="已登录，可在出题模型中选择使用。"
            />
          )}
        </div>
      </Drawer>
      <Modal
        open={!!welcome}
        title="使用 ChatGPT 套餐"
        okText="知道了"
        footer={(_, { OkBtn }) => <OkBtn />}
        onOk={dismissWelcome}
        onCancel={dismissWelcome}
      >
        出题和模型测试会使用 ChatGPT 额度，可在“管理 ChatGPT 用量”中设置限额。
      </Modal>
    </section>
  );
}
