import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Empty,
  Flex,
  Pagination,
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
import { editableEnglishText } from "../dictionary/word-creation-v3/meaningsModel";
import { SentenceEditor } from "./SentenceEditor";

const textOf = (item: SharedSentence) =>
  editableEnglishText(item.content.sentence.en_text)
    .map((row) => row.text)
    .join(" / ");

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
  registerLeaveGuard
}: {
  sourceWord: AdminWordV3;
  senseId: string;
  editor?: SharedSentence | "new";
  onOpen: (editor: SharedSentence | "new") => void;
  onClose: () => void;
  readOnly?: boolean;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
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
                align="start"
                gap="small"
                className="shared-sentence-row"
                wrap
              >
                <Tag>{item.content.sentence.level}</Tag>
                <Flex vertical style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <Typography.Paragraph
                    ellipsis={{ rows: 2, tooltip: textOf(item) }}
                    style={{ marginBottom: 4 }}
                  >
                    {textOf(item)}
                  </Typography.Paragraph>
                  <Flex vertical gap={4}>
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
                            gap={6}
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
                {!readOnly && (
                  <Space>
                    <Button size="small" onClick={() => void edit(item)}>
                      编辑
                    </Button>
                    <Button size="small" onClick={() => remove(item)}>
                      从当前词义解除关联
                    </Button>
                  </Space>
                )}
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
