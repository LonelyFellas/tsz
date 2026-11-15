import type { NextSentenceSource, NextSentenceVariant } from "@tsz/types";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Tag } from "@tsz/ui/admin/display";
import { Input, Select } from "@tsz/ui/admin/forms";
import { Plus, Trash2 } from "lucide-react";
import type { LexiconNextRequests } from "@/pages/LexiconNext";

const sourceNames: Record<NextSentenceSource["source_type"], string> = {
  dictionary: "词典引用",
  web: "网页引用",
  adapted: "改写",
  ai_composed: "AI 原创",
  human_composed: "人工原创"
};
export function SentenceSources({ rows }: { rows?: NextSentenceSource[] }) {
  return rows?.length ? (
    <ul className="next-sentence-sources">
      {rows.map((row) => (
        <li key={row.id}>
          <Tag>{sourceNames[row.source_type]}</Tag>
          {row.url ? (
            <a href={row.url} target="_blank" rel="noopener noreferrer">
              {row.title || row.url}
            </a>
          ) : (
            row.title
          )}
          {row.locator && <span> · {row.locator}</span>}
          {["dictionary", "web", "adapted"].includes(row.source_type) && (
            <Tag color="warning">未核验</Tag>
          )}
        </li>
      ))}
    </ul>
  ) : (
    <span className="lexicon-next-muted">未登记来源</span>
  );
}
export function SentenceSourceFields({
  rows,
  label,
  disabled,
  onChange
}: {
  rows: NextSentenceSource[];
  label: string;
  disabled: boolean;
  onChange: (rows: NextSentenceSource[]) => void;
}) {
  const update = (index: number, patch: Partial<NextSentenceSource>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div
      className="next-sentence-source-fields"
      role="group"
      aria-label={label}
    >
      <strong>{label}</strong>
      {rows.map((row, index) => (
        <div className="next-sentence-source-row" key={row.id}>
          <Select
            aria-label={`${label} ${index + 1} 类型`}
            disabled={disabled}
            value={row.source_type}
            options={Object.entries(sourceNames).map(([value, label]) => ({
              value,
              label
            }))}
            onChange={(source_type) => update(index, { source_type })}
          />
          <Input
            aria-label={`${label} ${index + 1} 名称`}
            placeholder="来源名称"
            value={row.title}
            maxLength={500}
            disabled={disabled}
            onChange={(e) => update(index, { title: e.target.value })}
          />
          <Input
            aria-label={`${label} ${index + 1} 链接`}
            placeholder="网页链接"
            value={row.url}
            maxLength={2000}
            disabled={disabled}
            onChange={(e) => update(index, { url: e.target.value })}
          />
          <Input
            aria-label={`${label} ${index + 1} 定位`}
            placeholder="页码、条目或段落"
            value={row.locator}
            maxLength={2000}
            disabled={disabled}
            onChange={(e) => update(index, { locator: e.target.value })}
          />
          <Button
            aria-label={`移除${label} ${index + 1}`}
            disabled={disabled}
            icon={<Trash2 />}
            danger
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Button
        icon={<Plus />}
        disabled={disabled || rows.length >= 20}
        onClick={() =>
          onChange([
            ...rows,
            {
              id: crypto.randomUUID(),
              source_type: "human_composed",
              title: "",
              url: "",
              locator: ""
            }
          ])
        }
      >
        添加{label}
      </Button>
    </div>
  );
}
export function SentenceMetadataFields({
  value,
  requests,
  disabled,
  onChange
}: {
  value: NextSentenceVariant;
  requests: LexiconNextRequests;
  disabled: boolean;
  onChange: (value: NextSentenceVariant) => void;
}) {
  const catalog = useQuery({
    queryKey: ["admin-lexicon-next", "equivalent-catalog"],
    queryFn: requests.equivalentCatalog,
    staleTime: 5 * 60 * 1000,
    retry: false
  });
  const metadata = value.metadata ?? {
    register_ids: [],
    domain_ids: [],
    sources: []
  };
  return (
    <Card
      title="原文信息"
      size="small"
      extra={
        <Button
          size="small"
          disabled={disabled}
          loading={catalog.isFetching}
          onClick={() => void catalog.refetch()}
        >
          刷新目录
        </Button>
      }
    >
      {catalog.isError && (
        <Alert
          type="error"
          title="语体与领域目录加载失败"
          action={<Button onClick={() => void catalog.refetch()}>重试</Button>}
        />
      )}
      <div className="next-sentence-fields">
        {(["register_ids", "domain_ids"] as const).map((field) => {
          const rows =
            catalog.data?.[
              field === "register_ids" ? "registers" : "domains"
            ] ?? [];
          const label = field === "register_ids" ? "语体色彩" : "行业领域";
          const missing = metadata[field].some(
            (id) => !rows.some((row) => row.id === id)
          );
          return (
            <label key={field}>
              {label}
              <Select
                mode="multiple"
                aria-label={label}
                value={metadata[field]}
                loading={catalog.isPending}
                disabled={disabled || !catalog.data}
                options={[
                  ...rows.map((row) => ({ value: row.id, label: row.name_zh })),
                  ...metadata[field]
                    .filter((id) => !rows.some((row) => row.id === id))
                    .map((id) => ({
                      value: id,
                      label: "配置不存在",
                      disabled: true
                    }))
                ]}
                onChange={(ids) =>
                  onChange({
                    ...value,
                    metadata: { ...metadata, [field]: ids }
                  })
                }
              />
              {missing && catalog.data && (
                <span role="alert">所选配置不存在，请重新加载目录。</span>
              )}
            </label>
          );
        })}
      </div>
      <SentenceSourceFields
        label="原文来源"
        rows={metadata.sources}
        disabled={disabled}
        onChange={(sources) =>
          onChange({ ...value, metadata: { ...metadata, sources } })
        }
      />
    </Card>
  );
}
