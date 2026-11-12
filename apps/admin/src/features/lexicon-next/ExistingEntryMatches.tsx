import { Alert, Button, Card, Space, Spin, Tag } from "@tsz/ui/admin/display";
import { Pagination } from "@tsz/ui/admin/table";
import type { NextEntryMatches } from "@tsz/types";
import { useEffect, useRef } from "react";
import { usePartOfSpeechLabel } from "@/features/dictionary/part-of-speech/PartOfSpeechLabels";

export function ExistingEntryMatches({
  result,
  disabled,
  loading,
  onPageChange
}: {
  result: NextEntryMatches;
  disabled: boolean;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const posLabel = usePartOfSpeechLabel();
  const region = useRef<HTMLElement>(null);
  const previousResult = useRef(result);
  useEffect(() => {
    if (previousResult.current !== result) {
      region.current?.focus();
      previousResult.current = result;
    }
  }, [result]);
  return (
    <section ref={region} tabIndex={-1} aria-label="智能词库匹配结果">
      <Card
        title="智能词库"
        extra={
          <Space>
            {loading && <Spin size="small" aria-label="正在读取匹配词条" />}
            <span>{result.pagination.total} 条匹配</span>
          </Space>
        }
      >
        {result.items.length ? (
          <div className="lexicon-next-matches">
            {result.items.map((entry) => {
              const names = [...new Set(entry.forms.map((form) => form.text))];
              if (!names.length) names.push(entry.headword);
              return (
                <article key={entry.id} className="lexicon-next-match">
                  <div className="lexicon-next-section-heading lexicon-next-existing-heading">
                    <Space wrap>
                      <strong className="tsz-words">{names.join(" / ")}</strong>
                      {entry.annotation_visible && entry.annotation && (
                        <sup>{entry.annotation}</sup>
                      )}
                      <Tag
                        color={
                          entry.status === "draft" ? "processing" : "default"
                        }
                      >
                        {entry.status === "draft" ? "草稿" : "垃圾桶"}
                      </Tag>
                      <Tag>{entry.kind === "word" ? "单词" : "短语"}</Tag>
                      {entry.part_of_speech.map((pos) => (
                        <Tag key={pos}>{posLabel(pos)}</Tag>
                      ))}
                    </Space>
                    <Button
                      type="link"
                      href={`/lexicon-next/${entry.id}`}
                      disabled={disabled}
                    >
                      {entry.status === "draft" ? "继续创建" : "查看词条"}
                    </Button>
                  </div>
                  {entry.gloss && (
                    <p className="lexicon-next-preview">{entry.gloss}</p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <Alert type="info" showIcon title="未找到智能词库中的匹配词条。" />
        )}
        {result.pagination.total_pages > 1 && (
          <Pagination
            size="small"
            current={result.pagination.page}
            pageSize={result.pagination.page_size}
            total={result.pagination.total}
            showSizeChanger={false}
            disabled={disabled}
            onChange={onPageChange}
          />
        )}
      </Card>
    </section>
  );
}
