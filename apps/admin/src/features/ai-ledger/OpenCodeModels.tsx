import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Tag, Flex, Select, Typography } from "antd";
import { RadarIcon, RotateCwIcon } from "lucide-react";
import type { OpenCodeModelSelection, OpenCodeModelProbe } from "@tsz/types";
import { api } from "@/lib/auth";

function probeLabel(model: OpenCodeModelProbe): string {
  if (model.status === "available") return "可用";
  if (model.status === "checking") return "测试中";
  if (model.status === "unverified") return "未测试";
  if (model.error === "timeout") return "测试超时";
  if (model.error === "disabled" || model.error === "not_configured")
    return "未配置";
  if (model.error === "interrupted") return "已中断";
  if (model.error === "invalid_response") return "返回异常";
  if (model.error === "runtime_failed") return "调用失败";
  return model.http_status ? `不可用（HTTP ${model.http_status}）` : "不可用";
}

const encode = (model: OpenCodeModelSelection) =>
  JSON.stringify([model.source, model.provider_id, model.model_id]);
const sourceName = (model: OpenCodeModelSelection) =>
  model.source === "direct"
    ? "DeepSeek"
    : model.source === "chatgpt"
      ? "ChatGPT"
      : model.provider_id;

const displayName = (model: OpenCodeModelProbe) =>
  model.source === "chatgpt"
    ? model.name.replace(/（ChatGPT）$/, "")
    : model.source === "direct"
      ? model.name.replace(/（直连）$/, "")
      : model.name;

export function OpenCodeModels({ adminId }: { adminId: string }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<string>();
  const catalogKey = ["opencode-model-probes", adminId];
  const currentKey = ["opencode-current-model", adminId];
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
  const models = catalog.isError ? [] : (catalog.data?.models ?? []);
  const labelCounts = new Map<string, number>();
  for (const model of models) {
    const label = `${displayName(model)}（${sourceName(model)}）`;
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  const options = models.map((model) => {
    const label = `${displayName(model)}（${sourceName(model)}）`;
    return {
      value: encode(model),
      label:
        (labelCounts.get(label) ?? 0) > 1
          ? `${label} / ${model.model_id}`
          : label,
      searchLabel: `${label} ${model.model_id}`,
      disabled: !model.enabled || model.status !== "available"
    };
  });
  const passed = models.filter((model) => model.status === "available").length;
  const failed = models.filter(
    (model) => model.status === "unavailable"
  ).length;
  const running = catalog.data?.state === "running";
  const currentProbe = models.find(
    (model) => current.data && encode(model) === encode(current.data)
  );
  const selected = draft ?? (current.data ? encode(current.data) : undefined);
  if (selected && !options.some((option) => option.value === selected)) {
    const [, providerId, modelId] = JSON.parse(selected) as string[];
    options.push({
      value: selected,
      label: `${modelId}（${providerId}，不可用）`,
      searchLabel: `${modelId} ${providerId}`,
      disabled: true
    });
  }
  const currentName = current.isError
    ? "读取失败"
    : current.data
      ? currentProbe
        ? displayName(currentProbe)
        : current.data.model_id
      : "正在读取…";

  return (
    <div className="settings-models">
      <div role="region" aria-label="当前出题模型">
        <div className="settings-model-note">当前使用</div>
        <Flex align="center" gap={12} wrap style={{ marginTop: 8 }}>
          <Typography.Title
            level={4}
            style={{ margin: 0, overflowWrap: "anywhere" }}
          >
            {currentName}
          </Typography.Title>
          {current.data && <Tag>{sourceName(current.data)}</Tag>}
        </Flex>
      </div>
      <p className="settings-model-note">仅影响新任务。</p>
      <div className="settings-model-controls">
        <Select
          aria-label="出题模型"
          showSearch
          optionFilterProp="searchLabel"
          placeholder="选择模型"
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
              (option) => option.value === draft && !option.disabled
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
      </div>
      <Flex align="center" gap={8} wrap>
        <Button
          icon={<RadarIcon aria-hidden />}
          loading={probe.isPending || running}
          disabled={catalog.isError || !models.length || save.isPending}
          onClick={() => probe.mutate()}
        >
          {running ? `测试中 ${passed + failed}/${models.length}` : "测试模型"}
        </Button>
        <Button
          type="text"
          icon={<RotateCwIcon />}
          aria-label="刷新模型"
          loading={catalog.isFetching || current.isFetching}
          onClick={() => {
            void current.refetch();
            void catalog.refetch();
          }}
        >
          刷新
        </Button>
      </Flex>
      <p className="settings-model-note">测试可能消耗服务商额度。</p>
      {current.data?.source === "chatgpt" && (
        <Typography.Link
          href="https://chatgpt.com/settings/usage"
          target="_blank"
          rel="noopener noreferrer"
        >
          管理 ChatGPT 用量
        </Typography.Link>
      )}
      {save.isSuccess && !current.isError && (
        <Alert type="success" showIcon title="出题模型已保存。" />
      )}
      {save.isError && (
        <Alert type="error" showIcon title="模型保存失败，请刷新后重试。" />
      )}
      {probe.isError && (
        <Alert type="error" showIcon title="测试未能开始，请重试。" />
      )}
      {current.isError && (
        <Alert type="error" showIcon title="当前模型读取失败，请刷新。" />
      )}
      {catalog.isError && (
        <Alert type="error" showIcon title="模型列表读取失败，请刷新。" />
      )}
      {catalog.data?.state === "idle" && catalog.data.batch_id && (
        <Alert type="info" showIcon title="连接已变化，请重新测试。" />
      )}
      {catalog.data?.state === "interrupted" && (
        <Alert type="warning" showIcon title="测试已中断，请重试。" />
      )}
      {current.data &&
        catalog.isSuccess &&
        (!currentProbe?.enabled || currentProbe.status === "unavailable") && (
          <Alert
            type="warning"
            showIcon
            title="当前模型不可用，请重新测试或选择。"
          />
        )}
      {catalog.isSuccess && !models.length && (
        <Alert type="info" showIcon title="没有可选模型，请刷新。" />
      )}
      <details className="settings-model-details">
        <summary>查看测试结果（{models.length}）</summary>
        <div className="settings-model-results">
          {models.map((model) => (
            <div className="settings-model-result" key={encode(model)}>
              <div>
                <Typography.Text>{displayName(model)}</Typography.Text>
                <small>
                  {sourceName(model)} / {model.model_id}
                </small>
              </div>
              <Tag
                color={
                  model.status === "available"
                    ? "success"
                    : model.status === "unavailable"
                      ? "error"
                      : undefined
                }
              >
                {probeLabel(model)}
              </Tag>
            </div>
          ))}
          {catalog.data?.finished_at && (
            <Typography.Text type="secondary">
              {new Date(catalog.data.finished_at).toLocaleString("zh-CN")}
            </Typography.Text>
          )}
        </div>
      </details>
    </div>
  );
}
