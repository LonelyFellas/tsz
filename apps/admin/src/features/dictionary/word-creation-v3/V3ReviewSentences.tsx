import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Empty, Pagination, Skeleton, Tag } from "antd";
import { api } from "@/lib/auth";
import { V3EnglishTextPreview } from "./components/V3EnglishTextPreview";
import { sentenceTranslationsV3 } from "./meaningsModel";

/** 独立例句库按词义分页读取；失败与未加载不伪装成空数据。 */
export function V3ReviewSentences({
  entryId,
  senseId,
  revision
}: {
  entryId: string;
  senseId: string;
  revision: number;
}) {
  const [page, setPage] = useState(1);
  const root = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(
    typeof IntersectionObserver === "undefined"
  );
  useEffect(() => {
    if (visible || !root.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px" }
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [visible]);
  const query = useQuery({
    enabled: visible,
    queryKey: ["shared-sentences", "review", entryId, senseId, revision, page],
    queryFn: () =>
      api.sentences.list({
        entry_id: entryId,
        sense_id: senseId,
        page,
        page_size: 5
      })
  });
  return (
    <section
      ref={root}
      className="v3-dictionary-sentences"
      aria-label="多维例句"
    >
      <h4>多维例句 {query.data && <span>{query.data.total} 条</span>}</h4>
      {query.isPending ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : query.isError ? (
        <Alert
          type="error"
          title="例句加载失败"
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      ) : (
        <>
          {query.data.items.length === 0 && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无关联例句"
            />
          )}
          {query.data.items.map((item) => (
            <article className="v3-dictionary-example" key={item.id}>
              <Tag>{item.content.sentence.level}</Tag>
              <V3EnglishTextPreview
                value={item.content.sentence.en_text}
                hideCommonDialect
                showPlayback
              />
              <div className="v3-dictionary-translations">
                {sentenceTranslationsV3(item.content.sentence).map(
                  (translation) => (
                    <div key={translation.id}>
                      <span>
                        {translation.band === "word_for_word"
                          ? "初"
                          : translation.band === "balanced_fluency"
                            ? "中"
                            : "高"}
                      </span>
                      <p>{translation.content.text}</p>
                    </div>
                  )
                )}
              </div>
              {item.content.annotations.length > 0 && (
                <div className="v3-dictionary-links">
                  {item.content.annotations.map((annotation) => {
                    const target = annotation.target;
                    const entry =
                      target.state === "pending"
                        ? undefined
                        : item.entries.find(
                            (entry) => entry.id === target.target_entry_id
                          );
                    const sense =
                      target.state === "linked"
                        ? entry?.senses.find(
                            (sense) => sense.id === target.target_sense_id
                          )
                        : undefined;
                    return (
                      <span key={annotation.id}>
                        <Tag
                          color={target.state === "pending" ? "orange" : "blue"}
                        >
                          {target.state === "pending" ? "待关联" : "已关联"}
                        </Tag>
                        {annotation.source_segments
                          .map((segment) => segment.surface)
                          .join(" … ")}{" "}
                        →{" "}
                        {target.state === "pending"
                          ? target.headword
                          : (entry?.headword ?? "词条")}
                        {sense ? ` · ${sense.gloss}` : ""}
                      </span>
                    );
                  })}
                </div>
              )}
            </article>
          ))}
          {query.data.total > 5 && (
            <Pagination
              size="small"
              current={page}
              pageSize={5}
              total={query.data.total}
              showSizeChanger={false}
              onChange={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}
