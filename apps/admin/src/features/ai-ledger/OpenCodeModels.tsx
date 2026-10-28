import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Divider,
  Flex,
  Form,
  Input,
  Select,
  Space,
  Typography
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { OpenCodeModelSelection } from "@tsz/types";
import { api } from "@/lib/auth";

const direct: OpenCodeModelSelection = {
  source: "direct",
  provider_id: "deepseek",
  model_id: "deepseek-flash"
};
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
  const catalogKey = ["opencode-models", adminId];
  const currentKey = ["opencode-current-model", adminId];
  const providerKey = ["opencode-providers", adminId];
  const catalog = useQuery({
    queryKey: catalogKey,
    queryFn: ({ signal }) => api.opencode.models({ signal }),
    enabled: configured,
    retry: false,
    gcTime: 0
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
  const options = [
    { value: encode(direct), label: "DeepSeek / deepseek-flash（直连）" },
    ...(catalog.isError ? [] : (catalog.data?.models ?? [])).map((m) => ({
      value: encode({
        source: "opencode",
        provider_id: m.provider_id,
        model_id: m.model_id
      }),
      label: `${m.provider_id} / ${m.name} (${m.model_id})`,
      disabled: !m.enabled
    }))
  ];
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
      ? `${current.data.provider_id} / ${current.data.model_id}${current.data.source === "direct" ? "（直连）" : "（OpenCode）"}`
      : "正在读取…";
  return (
    <>
      <Divider />
      <Flex vertical gap={12}>
        <Typography.Text strong>当前出题模型：{currentName}</Typography.Text>
        <Typography.Text type="secondary">
          保存后用于新建出题任务，已创建的任务继续使用原模型。
        </Typography.Text>
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
            disabled={save.isPending || current.isError || !current.data}
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
            icon={<ReloadOutlined />}
            aria-label="刷新模型"
            loading={catalog.isFetching || current.isFetching}
            onClick={() => {
              void current.refetch();
              if (configured) void catalog.refetch();
            }}
          >
            刷新模型
          </Button>
        </Flex>
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
            title="无法获取模型列表，请刷新模型重试。"
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
        {current.data?.source === "opencode" &&
          catalog.isSuccess &&
          !catalog.data.models.some(
            (m) =>
              m.enabled &&
              m.provider_id === current.data?.provider_id &&
              m.model_id === current.data?.model_id
          ) && (
            <Alert
              type="warning"
              showIcon
              title="当前模型已不在可用列表中，请重新连接服务商或选择其他模型。"
            />
          )}
        {save.isError && (
          <Alert
            type="error"
            showIcon
            title="模型保存失败，请确认模型仍可用后重试。"
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
