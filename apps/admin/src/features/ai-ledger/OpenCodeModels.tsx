import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Divider,
  Tag,
  Flex,
  Form,
  Input,
  Select,
  Space,
  Typography
} from "antd";
import { RadarChartOutlined, ReloadOutlined } from "@ant-design/icons";
import type { OpenCodeModelSelection, OpenCodeModelProbe } from "@tsz/types";
import { api } from "@/lib/auth";

function probeLabel(model: OpenCodeModelProbe): string {
  if (model.status === "available") return "探针通过";
  if (model.status === "checking") return "正在探测";
  if (model.status === "unverified") return "待探测";
  if (model.error === "timeout") return "探测超时";
  if (model.error === "disabled" || model.error === "not_configured")
    return "未启用或未配置";
  if (model.error === "interrupted") return "探测中断";
  if (model.error === "invalid_response") return "响应无效";
  if (model.error === "runtime_failed") return "调用失败，请重新探测";
  return model.http_status ? `不可用（HTTP ${model.http_status}）` : "不可用";
}

const encode = (m: OpenCodeModelSelection) =>
  JSON.stringify([m.source, m.provider_id, m.model_id]);

export function OpenCodeModels({
  adminId,
  configured
}: {
  adminId: string;
  configured: boolean;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<string>();
  const [keyForm] = Form.useForm<{ provider_id: string; api_key: string }>();
  const catalogKey = ["opencode-model-probes", adminId];
  const currentKey = ["opencode-current-model", adminId];
  const providerKey = ["opencode-providers", adminId];
  const catalog = useQuery({
    queryKey: catalogKey,
    queryFn: ({ signal }) => api.opencode.probeReport({ signal }),
    retry: false,
    gcTime: 0,
    refetchInterval: (query) =>
      query.state.data?.state === "running" ? 2000 : false
  });
  const current = useQuery({
    queryKey: currentKey,
    queryFn: ({ signal }) => api.opencode.currentModel({ signal }),
    retry: false,
    gcTime: 0
  });
  const providers = useQuery({
    queryKey: providerKey,
    queryFn: ({ signal }) => api.opencode.providers({ signal }),
    enabled: configured,
    retry: false,
    gcTime: 0
  });
  const probe = useMutation({
    mutationFn: () => api.opencode.probeAll(),
    onSuccess: async (report) => {
      await client.cancelQueries({ queryKey: catalogKey });
      client.setQueryData(catalogKey, report);
      save.reset();
    }
  });
  const save = useMutation({
    mutationFn: (model: OpenCodeModelSelection) =>
      api.opencode.selectModel(model),
    onSuccess: async () => {
      setDraft(undefined);
      await client.invalidateQueries({ queryKey: currentKey });
    }
  });
  const connect = useMutation({
    mutationFn: async () => {
      const values = keyForm.getFieldsValue();
      await api.opencode.connectKey(values);
    },
    onSuccess: async () => {
      keyForm.setFieldValue("api_key", "");
      await Promise.all([
        client.invalidateQueries({ queryKey: catalogKey }),
        client.invalidateQueries({ queryKey: providerKey }),
        client.invalidateQueries({ queryKey: ["opencode-connection", adminId] })
      ]);
    },
    onSettled: () => keyForm.setFieldValue("api_key", "")
  });
  const models = catalog.isError ? [] : (catalog.data?.models ?? []);
  const options = models.map((m) => ({
    value: encode(m),
    label: `${probeLabel(m)} · ${m.source === "direct" ? "DeepSeek / deepseek-flash（直连）" : `${m.source === "chatgpt" ? "ChatGPT" : m.provider_id} / ${m.name} (${m.model_id})`}`,
    disabled: !m.enabled || m.status !== "available"
  }));
  const passed = models.filter((m) => m.status === "available").length;
  const failed = models.filter((m) => m.status === "unavailable").length;
  const running = catalog.data?.state === "running";
  const currentProbe = models.find(
    (m) => current.data && encode(m) === encode(current.data)
  );
  const selected = draft ?? (current.data ? encode(current.data) : undefined);
  if (selected && !options.some((option) => option.value === selected)) {
    const [, providerId, modelId] = JSON.parse(selected) as string[];
    options.push({
      value: selected,
      label: `${providerId} / ${modelId}（暂不可用）`,
      disabled: true
    });
  }
  const currentName = current.isError
    ? "暂时无法确认"
    : current.data
      ? `${current.data.source === "chatgpt" ? "ChatGPT" : current.data.provider_id} / ${current.data.model_id}${current.data.source === "direct" ? "（直连）" : current.data.source === "chatgpt" ? "（ChatGPT 套餐）" : "（OpenCode）"}`
      : "正在读取…";
  return (
    <>
      <Divider />
      <Flex vertical gap={12}>
        <Typography.Text strong>当前出题模型：{currentName}</Typography.Text>
        <Typography.Text type="secondary">
          保存后用于新建出题任务，已创建的任务继续使用原模型。
        </Typography.Text>
        {current.data?.source === "chatgpt" && (
          <Alert
            type="info"
            showIcon
            title="正在使用 ChatGPT 套餐"
            description={
              <Typography.Link
                href="https://chatgpt.com/settings/usage"
                target="_blank"
                rel="noopener noreferrer"
              >
                管理 ChatGPT 用量
              </Typography.Link>
            }
          />
        )}
        <Flex gap={8} wrap align="center">
          <Select
            aria-label="出题模型"
            showSearch
            optionFilterProp="label"
            placeholder="搜索并选择模型"
            style={{ width: 520, maxWidth: "100%" }}
            options={options}
            value={selected}
            loading={catalog.isFetching || current.isFetching}
            disabled={
              save.isPending ||
              current.isError ||
              !current.data ||
              catalog.isError ||
              catalog.isFetching
            }
            onChange={(value) => {
              setDraft(value);
              save.reset();
            }}
          />
          <Button
            type="primary"
            loading={save.isPending}
            disabled={
              !draft ||
              draft === (current.data && encode(current.data)) ||
              current.isError ||
              catalog.isFetching ||
              catalog.isError ||
              !options.some(
                (o) => o.value === draft && !("disabled" in o && o.disabled)
              )
            }
            onClick={() => {
              const [source, provider_id, model_id] = JSON.parse(draft!) as [
                OpenCodeModelSelection["source"],
                string,
                string
              ];
              save.mutate({ source, provider_id, model_id });
            }}
          >
            保存模型
          </Button>
          <Button
            icon={<RadarChartOutlined />}
            loading={probe.isPending || running}
            disabled={catalog.isError || !models.length || save.isPending}
            onClick={() => probe.mutate()}
          >
            {running
              ? `探测中 ${passed + failed}/${models.length}`
              : "探测全部"}
          </Button>
          <Button
            icon={<ReloadOutlined />}
            aria-label="刷新模型"
            loading={catalog.isFetching || current.isFetching}
            onClick={() => {
              void current.refetch();
              void catalog.refetch();
            }}
          >
            刷新模型
          </Button>
        </Flex>
        <Flex gap={8} wrap align="center">
          <Typography.Text>全部 {models.length} 个模型</Typography.Text>
          <Tag color="success">通过 {passed}</Tag>
          <Tag color="error">不可用 {failed}</Tag>
          <Tag>待完成 {models.length - passed - failed}</Tag>
          {catalog.data?.finished_at && (
            <Typography.Text type="secondary">
              上次完成：
              {new Date(catalog.data.finished_at).toLocaleString("zh-CN")}
            </Typography.Text>
          )}
        </Flex>
        <Typography.Text type="secondary">
          探针会对每个模型发起最小请求，可能按服务商计费。探针通过后可切换模型；下方账本统计出题调用。
        </Typography.Text>
        {probe.isError && (
          <Alert
            type="error"
            showIcon
            title="未能启动探针，请刷新模型后重试。"
          />
        )}
        {catalog.data?.state === "idle" && catalog.data.batch_id && (
          <Alert type="info" showIcon title="目录或凭据已变化，请重新探测。" />
        )}
        {catalog.data?.state === "interrupted" && (
          <Alert
            type="warning"
            showIcon
            title="上次探针中断，未完成项不可选，请重新探测。"
          />
        )}
        {currentProbe?.status === "unavailable" && (
          <Alert
            type="warning"
            showIcon
            title={`当前出题模型探针未通过：${probeLabel(currentProbe)}。请选择其他探针通过的模型。`}
          />
        )}
        {current.isError && (
          <Alert
            type="error"
            showIcon
            title="无法读取当前出题模型，请刷新模型重试。"
          />
        )}
        {catalog.isError && (
          <Alert
            type="error"
            showIcon
            title="无法获取模型及探针结果，请刷新模型重试。"
          />
        )}
        {configured &&
          catalog.isSuccess &&
          catalog.data.models.length === 0 && (
            <Alert
              type="info"
              showIcon
              title="暂未发现可用模型，可连接 OpenCode 或添加模型服务商的 API Key 后刷新。"
            />
          )}
        {(current.data?.source === "opencode" ||
          current.data?.source === "chatgpt") &&
          catalog.isSuccess &&
          !catalog.data.models.some(
            (m) =>
              m.enabled &&
              m.source === current.data?.source &&
              m.provider_id === current.data?.provider_id &&
              m.model_id === current.data?.model_id
          ) && (
            <Alert
              type="warning"
              showIcon
              title={
                current.data.source === "chatgpt"
                  ? "当前 ChatGPT 模型或账号已不在可用列表中，请重新登录、探测或选择其他模型。"
                  : "当前模型已不在可用列表中，请重新连接服务商或选择其他模型。"
              }
            />
          )}
        {save.isError && (
          <Alert
            type="error"
            showIcon
            title="模型保存失败，请刷新并确认所选模型已通过探针。"
          />
        )}
        {save.isSuccess && !current.isError && (
          <Alert type="success" showIcon title="出题模型已保存。" />
        )}
        {configured && (
          <>
            <Typography.Title level={5} style={{ margin: "12px 0 0" }}>
              添加付费模型
            </Typography.Title>
            <Typography.Text type="secondary">
              填写模型服务商的 API
              Key，保存后自动刷新模型列表。使用费用由对应服务商计费；保存 Key
              不会自动切换模型。
            </Typography.Text>
            <Form
              form={keyForm}
              layout="vertical"
              onFinish={() => connect.mutate()}
              disabled={connect.isPending}
              style={{ maxWidth: 640 }}
            >
              <Form.Item
                name="provider_id"
                label="模型服务商"
                rules={[{ required: true, message: "请选择模型服务商" }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="搜索模型服务商"
                  loading={providers.isFetching}
                  disabled={providers.isError || connect.isPending}
                  options={providers.data?.providers.map((p) => ({
                    value: p.id,
                    label: `${p.name}${p.connected ? "（已连接）" : ""}`
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="api_key"
                label="API Key"
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: "请输入 API Key"
                  },
                  { max: 8192, message: "API Key 过长" }
                ]}
              >
                <Input.Password
                  autoComplete="new-password"
                  placeholder="输入 API Key，已保存的 Key 不会回显"
                />
              </Form.Item>
              <Space wrap>
                <Button
                  htmlType="submit"
                  loading={connect.isPending}
                  disabled={
                    providers.isError || !providers.data?.providers.length
                  }
                >
                  保存 API Key
                </Button>
                {providers.isError && (
                  <Button onClick={() => void providers.refetch()}>
                    重试获取服务商
                  </Button>
                )}
              </Space>
            </Form>
            {providers.isError && (
              <Alert
                type="error"
                showIcon
                title="无法获取模型服务商，请重试。"
              />
            )}
            {connect.isError && (
              <Alert
                type="error"
                showIcon
                title="API Key 保存失败，请重新输入后重试。"
              />
            )}
            {connect.isSuccess && (
              <Alert
                type="success"
                showIcon
                title="API Key 已保存，请从模型列表中选择要使用的模型。"
              />
            )}
          </>
        )}
      </Flex>
    </>
  );
}
