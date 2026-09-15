import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Empty,
  Flex,
  Pagination,
  Popover,
  Space,
  Tag,
  Typography
} from "antd";
import type { AdminWordV3, SharedSentence } from "@tsz/types";
import { api } from "@/lib/auth";
import {
  SenseSectionBody,
  SenseSectionTitle
} from "../dictionary/word-creation-v3/V3MeaningsAndExamplesStep";
import { V3EnglishTextPreview } from "../dictionary/word-creation-v3/components/V3EnglishTextPreview";
import { SentenceEditor } from "./SentenceEditor";
import "./WordSentences.css";

const TRANSLATION_BANDS = [
  { band: "word_for_word", label: "初" },
  { band: "balanced_fluency", label: "中" },
  { band: "adapted_creation", label: "高" }
] as const;

export function WordSentences({
  sourceWord,
  senseId,
  editor,
  onOpen,
  onClose,
  readOnly,
  registerLeaveGuard,
  focusSentenceId,
  onFocusHandled
}: {
  sourceWord: AdminWordV3;
  senseId: string;
  editor?: SharedSentence | "new";
  onOpen: (editor: SharedSentence | "new") => void;
  onClose: () => void;
  readOnly?: boolean;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
  /** 引用跳转落点：展开区块并直接打开这条例句，不依赖它在哪一页。 */
  focusSentenceId?: string;
  onFocusHandled?: () => void;
}) {
  const entryId = sourceWord.id;
  const savedSense = sourceWord.meanings.pos
    .flatMap((pos) => pos.senses)
    .find((sense) => sense.id === senseId);
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["shared-sentences", entryId, senseId, sourceWord.revision, page],
    queryFn: () =>
      api.sentences.list({
        entry_id: entryId,
        sense_id: senseId,
        page,
        page_size: 5
      }),
    enabled: !!savedSense
  });
  const rows = query.data?.items ?? [];
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["shared-sentences"] });
    // 例句关联改了，本词条被引用的节点也跟着变：让向导的引用索引重取，禁用态即时更新。
    void client.invalidateQueries({
      queryKey: ["inbound-references", entryId]
    });
  };
  const failure = (error: unknown) => {
    void message.error(
      error instanceof Error ? error.message : "操作失败，请重试"
    );
  };
  const edit = async (item: SharedSentence) => {
    try {
      onOpen(await api.sentences.get(item.id));
    } catch (error) {
      failure(error);
    }
  };
  useEffect(() => {
    if (!focusSentenceId) return;
    let cancelled = false;
    setCollapsed(false);
    void api.sentences
      .get(focusSentenceId)
      .then((sentence) => {
        if (!cancelled) onOpen(sentence);
      })
      .catch((error: unknown) => {
        if (!cancelled) failure(error);
      })
      .finally(() => {
        if (!cancelled) onFocusHandled?.();
      });
    return () => {
      cancelled = true;
    };
    // 只按目标例句 id 触发；onOpen / onFocusHandled 每次渲染都是新函数。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSentenceId]);
  const remove = (item: SharedSentence) => {
    const confirmation = modal.confirm({
      title: "从当前词义解除关联？",
      content: "解除这条例句与当前词义的全部关联，例句和其他词义的关联将保留。",
      onOk: (close) => {
        confirmation.update({
          okButtonProps: { loading: true },
          cancelButtonProps: { disabled: true }
        });
        void api.sentences
          .unlink(item.id, entryId, {
            base_revision: item.revision,
            sense_id: senseId
          })
          .then(() => {
            setPage(1);
            refresh();
            close();
          })
          .catch((error: unknown) => {
            void failure(error);
            confirmation.update({
              okButtonProps: { loading: false },
              cancelButtonProps: { disabled: false }
            });
          });
      }
    });
  };
  return (
    <section
      className={`word-sense-section${collapsed ? " is-collapsed" : ""}`}
      data-sentence-entry-id={entryId}
      data-sentence-sense-id={senseId}
    >
      <SenseSectionTitle
        label="多维例句"
        count={query.data?.total ?? 0}
        unit="条"
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />
      <SenseSectionBody collapsed={collapsed}>
        {editor ? (
          <SentenceEditor
            key={editor === "new" ? "new" : `${editor.id}:${editor.revision}`}
            sourceWord={sourceWord}
            sourceSenseId={senseId}
            initialLevel={savedSense?.level}
            registerLeaveGuard={registerLeaveGuard}
            sentence={editor === "new" ? undefined : editor}
            onClose={onClose}
            onSaved={() => {
              if (editor === "new") setPage(1);
              onClose();
              refresh();
            }}
          />
        ) : (
          <Flex vertical gap="small">
            <Typography.Text type="secondary">
              {savedSense
                ? "展示句内关联到当前词义的例句。修改会同步到例句库。"
                : "先保存词义，再添加例句。"}
            </Typography.Text>
            {query.isError && (
              <Alert
                type="error"
                title="例句加载失败"
                action={
                  <Button onClick={() => void query.refetch()}>重试</Button>
                }
              />
            )}
            {!rows.length && !query.isFetching && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无关联例句"
              />
            )}
            {rows.map((item) => (
              <Flex
                key={item.id}
                vertical
                gap={12}
                className="shared-sentence-row"
              >
                <Flex
                  align="center"
                  justify="space-between"
                  gap="small"
                  className="shared-sentence-header"
                >
                  <Tag>{item.content.sentence.level}</Tag>
                  {!readOnly && (
                    <Space>
                      <Button size="small" onClick={() => void edit(item)}>
                        编辑
                      </Button>
                      <Popover content="从当前词义解除关联" trigger="hover">
                        <Button size="small" onClick={() => remove(item)}>
                          解除
                        </Button>
                      </Popover>
                    </Space>
                  )}
                </Flex>
                <Flex vertical gap={12} style={{ minWidth: 0 }}>
                  <div className="shared-sentence-english">
                    <V3EnglishTextPreview
                      value={item.content.sentence.en_text}
                      hideCommonDialect
                      showPlayback
                    />
                  </div>
                  <Flex
                    vertical
                    gap={8}
                    className="shared-sentence-translations"
                  >
                    {TRANSLATION_BANDS.flatMap(({ band, label }) =>
                      item.content.sentence.zh_translations
                        .filter(
                          (translation) =>
                            translation.band === band &&
                            translation.content.text.trim()
                        )
                        .map((translation) => (
                          <Flex
                            key={translation.id}
                            role="group"
                            aria-label={`${label}阶译文`}
                            align="start"
                            gap={10}
                            className="shared-sentence-translation"
                          >
                            <Tag
                              color="blue"
                              style={{ marginInlineEnd: 0, flexShrink: 0 }}
                            >
                              {label}
                            </Tag>
                            <Typography.Text
                              type="secondary"
                              style={{ whiteSpace: "pre-wrap" }}
                            >
                              {translation.content.text}
                            </Typography.Text>
                          </Flex>
                        ))
                    )}
                  </Flex>
                </Flex>
              </Flex>
            ))}
            {(query.data?.total ?? 0) > 5 && (
              <Pagination
                size="small"
                current={page}
                pageSize={5}
                total={query.data?.total}
                onChange={setPage}
                showSizeChanger={false}
              />
            )}
            {!readOnly && (
              <Button
                block
                type="dashed"
                className="word-section-add-button"
                icon={<PlusOutlined aria-hidden />}
                disabled={!savedSense}
                onClick={() => onOpen("new")}
              >
                添加例句
              </Button>
            )}
          </Flex>
        )}
      </SenseSectionBody>
    </section>
  );
}
