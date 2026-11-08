import { useAiTranslation, type AiTranslation } from "./i18n";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Tag, Flex, Typography } from "@tsz/ui/admin/display";
import { Select } from "@tsz/ui/admin/forms";
import { RadarIcon, RotateCwIcon } from "lucide-react";
import type { OpenCodeModelSelection, OpenCodeModelProbe } from "@tsz/types";
import { api } from "@/lib/auth";

function probeLabel(model: OpenCodeModelProbe, t: AiTranslation): string {
  if (model.status === "available") return t("available");
  if (model.status === "checking") return t("checking");
  if (model.status === "unverified") return t("unverified");
  if (model.error === "timeout") return t("timeout");
  if (model.error === "disabled" || model.error === "not_configured")
    return t("not_configured");
  if (model.error === "interrupted") return t("interrupted");
  if (model.error === "invalid_response") return t("invalid_response");
  if (model.error === "runtime_failed") return t("runtime_failed");
  return model.http_status
    ? t("http_unavailable", { status: model.http_status })
    : t("unavailable");
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
  const { t } = useAiTranslation();
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
      label: t("model_unavailable_option", {
        model: modelId,
        provider: providerId
      }),
      searchLabel: `${modelId} ${providerId}`,
      disabled: true
    });
  }
  const currentName = current.isError
    ? t("read_failed")
    : current.data
      ? currentProbe
        ? displayName(currentProbe)
        : current.data.model_id
      : t("reading_ellipsis");

  return (
    <div className="settings-models">
      <div role="region" aria-label={t("current_model")}>
        <div className="settings-model-note">{t("current")}</div>
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
      <p className="settings-model-note">{t("new_tasks_only")}</p>
      <div className="settings-model-controls">
        <Select
          aria-label={t("question_model")}
          showSearch
          optionFilterProp="searchLabel"
          placeholder={t("choose_model")}
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
          {t("save_model")}
        </Button>
      </div>
      <Flex align="center" gap={8} wrap>
        <Button
          icon={<RadarIcon aria-hidden />}
          loading={probe.isPending || running}
          disabled={catalog.isError || !models.length || save.isPending}
          onClick={() => probe.mutate()}
        >
          {running
            ? t("checking_progress", {
                done: passed + failed,
                total: models.length
              })
            : t("test_models")}
        </Button>
        <Button
          type="text"
          icon={<RotateCwIcon />}
          aria-label={t("refresh_models")}
          loading={catalog.isFetching || current.isFetching}
          onClick={() => {
            void current.refetch();
            void catalog.refetch();
          }}
        >
          {t("refresh")}
        </Button>
      </Flex>
      <p className="settings-model-note">{t("test_cost_notice")}</p>
      {current.data?.source === "chatgpt" && (
        <Typography.Link
          href="https://chatgpt.com/settings/usage"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("chatgpt_usage")}
        </Typography.Link>
      )}
      {save.isSuccess && !current.isError && (
        <Alert type="success" showIcon title={t("model_saved")} />
      )}
      {save.isError && (
        <Alert type="error" showIcon title={t("model_save_failed")} />
      )}
      {probe.isError && (
        <Alert type="error" showIcon title={t("probe_failed")} />
      )}
      {current.isError && (
        <Alert type="error" showIcon title={t("current_failed")} />
      )}
      {catalog.isError && (
        <Alert type="error" showIcon title={t("catalog_failed")} />
      )}
      {catalog.data?.state === "idle" && catalog.data.batch_id && (
        <Alert type="info" showIcon title={t("connection_changed")} />
      )}
      {catalog.data?.state === "interrupted" && (
        <Alert type="warning" showIcon title={t("probe_interrupted")} />
      )}
      {current.data &&
        catalog.isSuccess &&
        (!currentProbe?.enabled || currentProbe.status === "unavailable") && (
          <Alert type="warning" showIcon title={t("current_unavailable")} />
        )}
      {catalog.isSuccess && !models.length && (
        <Alert type="info" showIcon title={t("no_models")} />
      )}
      <details className="settings-model-details">
        <summary>{t("probe_results", { count: models.length })}</summary>
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
                {probeLabel(model, t)}
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
