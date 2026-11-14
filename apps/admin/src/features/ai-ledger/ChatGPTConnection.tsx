import { useAiTranslation, AiText } from "./i18n";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SparklesIcon, RotateCwIcon } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Flex,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { Drawer, Modal } from "@tsz/ui/admin/overlays";
import { Form, Input, Select } from "@tsz/ui/admin/forms";
import type { ChatGPTLogin } from "@tsz/types";
import { api } from "@/lib/auth";

export function ChatGPTConnection({ adminId }: { adminId: string }) {
  const { t } = useAiTranslation();
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
    ? t("state_unavailable")
    : accounts.isPending
      ? t("reading")
      : accounts.data && !accounts.data.configured
        ? t("not_enabled")
        : active?.signed_in
          ? active.plan_enabled
            ? t("plan_authorised")
            : t("signed_in_no_plan")
          : t("signed_out");
  const dismissWelcome = () => {
    try {
      if (welcome) localStorage.setItem(welcome, "1");
    } catch {
      /* No credentials are stored in the browser. */
    }
    setWelcome(undefined);
  };

  return (
    <section className="settings-provider" aria-label={t("chatgpt_account")}>
      <div className="settings-provider__summary">
        <span className="settings-provider__icon">
          <SparklesIcon />
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
                setup.isError
                  ? t("login_unavailable")
                  : pending
                    ? t("awaiting_auth")
                    : label
              }
            />
          </div>
          <div className="settings-provider__description">
            {active?.email || t("chatgpt_plan")}
          </div>
        </div>
        <div className="settings-provider__actions">
          <Button
            type="text"
            icon={<RotateCwIcon />}
            loading={accounts.isFetching || setup.isFetching}
            onClick={() => void refresh()}
            aria-label={t("chatgpt_refresh")}
          />
          <Button
            aria-label={
              pending
                ? t("chatgpt_continue")
                : active?.signed_in
                  ? t("chatgpt_manage")
                  : t("chatgpt_login")
            }
            onClick={() => setOpen(true)}
          >
            {pending
              ? t("continue_login")
              : active?.signed_in
                ? t("manage")
                : t("login")}
          </Button>
        </div>
      </div>
      <Drawer
        rootClassName="profile-settings-dialog"
        closable={{ "aria-label": t("close") }}
        title={t("chatgpt_account")}
        open={open}
        onClose={() => setOpen(false)}
        size={480}
        destroyOnHidden={false}
      >
        <div className="settings-dialog-content">
          <Tag>{label}</Tag>
          {setup.data?.login_method === "local" && (
            <Typography.Text>{t("local_login")}</Typography.Text>
          )}
          {!!accounts.data?.accounts.length && !accounts.isError && (
            <Select
              aria-label={t("chatgpt_account")}
              className="settings-chatgpt-device"
              value={accounts.data.active ?? undefined}
              disabled={busy || pending}
              loading={useAccount.isPending}
              options={accounts.data.accounts.map((account) => ({
                value: account.client_id,
                label: `${account.email || t("chatgpt_account")}${(accounts.data?.accounts.length ?? 0) > 1 ? ` (${account.client_id.slice(-6)})` : ""}${account.signed_in ? "" : t("account_signed_out")}`
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
                icon={<SparklesIcon />}
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
                {t("continue_with_chatgpt")}
              </Button>
            )}
            {remote && active?.signed_in && (
              <Button
                disabled={busy || setup.isPending || setup.isError}
                onClick={() => setRemoteIntent("current")}
              >
                {t("login_again")}
              </Button>
            )}
            {active && (
              <Button
                disabled={
                  !available ||
                  setup.isPending ||
                  setup.isError ||
                  pending ||
                  busy
                }
                onClick={() =>
                  remote ? setRemoteIntent("new") : login.mutate(null)
                }
              >
                {t("add_account")}
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
                {t("chatgpt_logout")}
              </Button>
            )}
            <Typography.Link
              href="https://chatgpt.com/settings/usage"
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              {t("chatgpt_usage")}
            </Typography.Link>
          </Space>
          {setup.isError && (
            <Alert type="error" showIcon title={t("setup_failed")} />
          )}
          {remote &&
            available &&
            (!active?.signed_in || remoteIntent !== undefined) && (
              <section
                className="settings-ssh"
                aria-label={t("computer_login")}
              >
                <Typography.Title level={5}>
                  {t("computer_login")}
                </Typography.Title>
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
                      label={t("ssh_host")}
                      rules={[
                        {
                          required: true,
                          message: <AiText message="ssh_required" />
                        },
                        {
                          pattern:
                            /^(?:[a-zA-Z0-9_.-]+@)?[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,
                          message: <AiText message="ssh_invalid" />
                        }
                      ]}
                    >
                      <Input
                        placeholder={t("ssh_example")}
                        maxLength={253}
                        autoComplete="off"
                      />
                    </Form.Item>
                  </Form>
                  <Typography.Text>{t("ssh_run")}</Typography.Text>
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
                    {t("refresh_accounts")}
                  </Button>
                </Flex>
              </section>
            )}
          {!accounts.isError && accounts.data && !accounts.data.configured && (
            <Alert type="info" showIcon title={t("chatgpt_disabled")} />
          )}
          {accounts.isError && (
            <Alert type="error" showIcon title={t("chatgpt_read_failed")} />
          )}
          {(login.isError || useAccount.isError || logout.isError) && (
            <Alert type="error" showIcon title={t("chatgpt_action_failed")} />
          )}
          {active?.signed_in && !active.plan_enabled && !accounts.isError && (
            <Alert type="warning" showIcon title={t("plan_required")} />
          )}
          {revocationUnconfirmed && (
            <Alert
              type="warning"
              showIcon
              title={t("revocation_unconfirmed")}
            />
          )}
          {pending && (
            <Alert
              type="info"
              showIcon
              title={t("chatgpt_wait")}
              description={
                <Flex vertical gap={8}>
                  <Typography.Text>
                    {t("chatgpt_auth_help", {
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
                      {t("chatgpt_authorise")}
                    </Button>
                    <Button
                      loading={cancel.isPending}
                      onClick={() => cancel.mutate()}
                    >
                      {t("chatgpt_cancel")}
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
              title={t("chatgpt_result_failed")}
              action={
                <Button onClick={() => void status.refetch()}>
                  {t("refresh_auth")}
                </Button>
              }
            />
          )}
          {cancel.isError && (
            <Alert type="error" showIcon title={t("chatgpt_cancel_failed")} />
          )}
          {status.data?.status === "failed" && (
            <Alert
              type="error"
              showIcon
              title={
                status.data.error === "denied"
                  ? t("chatgpt_denied")
                  : t("chatgpt_incomplete")
              }
            />
          )}
          {status.data?.status === "expired" && (
            <Alert type="warning" showIcon title={t("chatgpt_expired")} />
          )}
          {status.data?.status === "complete" && (
            <Alert type="success" showIcon title={t("chatgpt_complete")} />
          )}
        </div>
      </Drawer>
      <Modal
        open={!!welcome}
        title={t("chatgpt_plan")}
        okText={t("understood")}
        footer={(_, { OkBtn }) => <OkBtn />}
        onOk={dismissWelcome}
        onCancel={dismissWelcome}
      >
        {t("plan_notice")}
      </Modal>
    </section>
  );
}
