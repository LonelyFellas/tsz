import { useAiTranslation, AiText } from "./i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button } from "@tsz/ui/admin/display";
import { Form, Input, Select } from "@tsz/ui/admin/forms";
import { api } from "@/lib/auth";

export function OpenCodeKeyForm({
  adminId,
  disabled = false
}: {
  adminId: string;
  disabled?: boolean;
}) {
  const { t } = useAiTranslation();
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
        label={t("provider")}
        rules={[
          { required: true, message: <AiText message="provider_required" /> }
        ]}
      >
        <Select
          showSearch
          optionFilterProp="label"
          placeholder={t("choose_provider")}
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
          {
            required: true,
            whitespace: true,
            message: <AiText message="key_required" />
          },
          { max: 8192, message: <AiText message="key_too_long" /> }
        ]}
      >
        <Input.Password
          autoComplete="new-password"
          placeholder={t("paste_key")}
        />
      </Form.Item>
      <p className="settings-model-note">{t("key_cost_notice")}</p>
      <Button
        type="primary"
        htmlType="submit"
        loading={connect.isPending}
        disabled={
          disabled || providers.isError || !providers.data?.providers.length
        }
      >
        {t("save_key")}
      </Button>
      {providers.isError && (
        <Alert
          type="error"
          showIcon
          title={t("provider_read_failed")}
          action={
            <Button onClick={() => void providers.refetch()}>
              {t("retry")}
            </Button>
          }
        />
      )}
      {connect.isError && (
        <Alert type="error" showIcon title={t("key_failed")} />
      )}
      {connect.isSuccess && (
        <Alert type="success" showIcon title={t("key_saved")} />
      )}
    </Form>
  );
}
