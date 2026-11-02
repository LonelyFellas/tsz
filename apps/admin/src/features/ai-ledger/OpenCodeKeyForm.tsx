import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Form, Input, Select } from "antd";
import { api } from "@/lib/auth";

export function OpenCodeKeyForm({
  adminId,
  disabled = false
}: {
  adminId: string;
  disabled?: boolean;
}) {
  const client = useQueryClient();
  const [form] = Form.useForm<{ provider_id: string; api_key: string }>();
  const providerKey = ["opencode-providers", adminId];
  const providers = useQuery({
    queryKey: providerKey,
    queryFn: ({ signal }) => api.opencode.providers({ signal }),
    retry: false,
    gcTime: 0
  });
  const connect = useMutation({
    mutationKey: ["opencode-connect-key", adminId],
    mutationFn: async () => api.opencode.connectKey(form.getFieldsValue()),
    onSuccess: async () => {
      form.setFieldValue("api_key", "");
      await Promise.all(
        [
          "opencode-model-probes",
          "opencode-providers",
          "opencode-connections",
          "opencode-connection"
        ].map((key) => client.invalidateQueries({ queryKey: [key, adminId] }))
      );
    },
    onSettled: () => form.setFieldValue("api_key", "")
  });
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={() => connect.mutate()}
      disabled={disabled || connect.isPending}
    >
      <Form.Item
        name="provider_id"
        label="模型服务商"
        rules={[{ required: true, message: "请选择服务商" }]}
      >
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="选择服务商"
          loading={providers.isFetching}
          disabled={providers.isError || disabled || connect.isPending}
          options={providers.data?.providers.map((p) => ({
            value: p.id,
            label: p.name
          }))}
        />
      </Form.Item>
      <Form.Item
        name="api_key"
        label="API Key"
        rules={[
          { required: true, whitespace: true, message: "请输入 API Key" },
          { max: 8192, message: "API Key 过长" }
        ]}
      >
        <Input.Password
          autoComplete="new-password"
          placeholder="粘贴 API Key"
        />
      </Form.Item>
      <p className="settings-model-note">
        费用由服务商收取，保存后仍需选择模型。
      </p>
      <Button
        type="primary"
        htmlType="submit"
        loading={connect.isPending}
        disabled={
          disabled || providers.isError || !providers.data?.providers.length
        }
      >
        保存 API Key
      </Button>
      {providers.isError && (
        <Alert
          type="error"
          showIcon
          title="服务商读取失败"
          action={
            <Button onClick={() => void providers.refetch()}>重试</Button>
          }
        />
      )}
      {connect.isError && (
        <Alert type="error" showIcon title="保存失败，请重新输入。" />
      )}
      {connect.isSuccess && (
        <Alert type="success" showIcon title="API Key 已保存。" />
      )}
    </Form>
  );
}
