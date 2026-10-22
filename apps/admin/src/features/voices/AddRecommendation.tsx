import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import type {
  AdminDubbingGroupsResponse,
  AdminSpeechVoice,
  AdminVoiceParameters
} from "@tsz/types";
import { Alert, Button, Form, Input, Select, Space } from "antd";
import { useEffect, useState } from "react";
import { api, useAuthStore } from "@/lib/auth";
import { newWordNodeId } from "@/features/dictionary/word-model/primitives";

export function AddRecommendation({
  voice,
  readParameters,
  onBusyChange,
  onClose
}: {
  voice: AdminSpeechVoice;
  readParameters: () => Promise<AdminVoiceParameters>;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const accountId = useAuthStore((state) => state.profile?.id);
  const client = useQueryClient();
  const groups = useQuery({
    queryKey: ["admin-dubbing-groups", accountId],
    queryFn: ({ signal }) => api.speech.groups(signal),
    retry: false
  });
  const [form] = Form.useForm<{ group: string; name: string }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    onBusyChange(pending);
    return () => onBusyChange(false);
  }, [pending, onBusyChange]);
  const locale =
    voice.locale === "en-GB" ? "uk" : voice.locale === "en-US" ? "us" : null;

  async function add() {
    if (pending || done || !groups.data || !locale) return;
    let values: { group: string; name: string };
    let parameters: AdminVoiceParameters;
    try {
      values = await form.validateFields();
      parameters = await readParameters();
    } catch {
      return;
    }
    const group = groups.data.groups.find((item) => item.id === values.group);
    if (!group) return;
    if (group[locale].length >= 20) {
      setError("该口音已有 20 个推荐，请先在分组配音中整理。");
      return;
    }
    setPending(true);
    setError("");
    try {
      const saved = await api.speech.saveGroups({
        base_revision: groups.data.revision,
        groups: groups.data.groups.map((item) =>
          item.id === group.id
            ? {
                ...item,
                [locale]: [
                  ...item[locale],
                  {
                    id: newWordNodeId(),
                    name: values.name.trim(),
                    voice_alias: voice.alias,
                    parameters
                  }
                ]
              }
            : item
        )
      });
      await client.cancelQueries({
        queryKey: ["admin-dubbing-groups", accountId],
        exact: true
      });
      if (useAuthStore.getState().profile?.id !== accountId) return;
      client.setQueryData<AdminDubbingGroupsResponse>(
        ["admin-dubbing-groups", accountId],
        saved
      );
      setDone(true);
    } catch (cause) {
      setError(
        cause instanceof HttpError && cause.status === 409
          ? "推荐分组已被修改，请刷新分组后再添加。"
          : "添加失败，当前参数保留，请重试。"
      );
    } finally {
      setPending(false);
    }
  }

  if (done)
    return (
      <Alert
        type="success"
        showIcon
        title="已加入分组推荐。后续修改个人参数不会改变这份推荐。"
        action={<Button onClick={onClose}>完成</Button>}
      />
    );
  return (
    <div>
      {groups.isError && (
        <Alert
          type="error"
          title="分组加载失败。"
          action={<Button onClick={() => void groups.refetch()}>重试</Button>}
        />
      )}
      {groups.isSuccess && !groups.data.groups.length && (
        <Alert type="info" title="请先到分组配音创建分组，再添加当前音色。" />
      )}
      <Form
        form={form}
        layout="vertical"
        initialValues={{ name: voice.display_name }}
        disabled={pending}
      >
        <Form.Item
          name="group"
          label="推荐分组"
          rules={[{ required: true, message: "请选择推荐分组" }]}
        >
          <Select
            aria-label="推荐分组"
            loading={groups.isPending}
            options={groups.data?.groups.map((group) => ({
              value: group.id,
              label: group.name
            }))}
          />
        </Form.Item>
        <Form.Item
          name="name"
          label="推荐版本名称"
          rules={[
            {
              required: true,
              whitespace: true,
              max: 40,
              message: "请输入不超过 40 字的推荐名称"
            }
          ]}
        >
          <Input aria-label="推荐版本名称" maxLength={40} />
        </Form.Item>
        <Space>
          <Button
            type="primary"
            disabled={
              !groups.isSuccess || !groups.data.groups.length || !locale
            }
            loading={pending}
            onClick={() => void add()}
          >
            确认加入推荐
          </Button>
          <Button disabled={pending} onClick={onClose}>
            取消添加
          </Button>
        </Space>
      </Form>
      {error && (
        <Alert
          type="error"
          title={error}
          action={
            <Button
              onClick={() => {
                void groups.refetch();
                setError("");
              }}
            >
              刷新分组
            </Button>
          }
        />
      )}
    </div>
  );
}
