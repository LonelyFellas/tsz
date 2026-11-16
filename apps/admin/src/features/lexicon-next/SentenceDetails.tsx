import type { NextSentenceVariant } from "@tsz/types";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card } from "@tsz/ui/admin/display";
import { Select } from "@tsz/ui/admin/forms";
import type { LexiconNextRequests } from "@/pages/LexiconNext";

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
    </Card>
  );
}
