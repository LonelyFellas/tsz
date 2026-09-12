import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Flex,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from "antd";
import type { Dayjs } from "dayjs";
import type { SharedSentence, SentenceListQuery } from "@tsz/types";
import { Link } from "react-router-dom";
import { api } from "@/lib/auth";
import { editableEnglishText } from "../dictionary/word-creation-v3/meaningsModel";
import { SentenceEditor } from "./SentenceEditor";

function sentenceText(item: SharedSentence) {
  return editableEnglishText(item.content.sentence.en_text)
    .map((row) => row.text)
    .join(" / ");
}
function entryLink(entry: SharedSentence["entries"][number]) {
  return (
    <Link
      title={`词条 ID：${entry.id}`}
      to={`/words/${entry.id}/v3/wizard/meanings`}
    >
      {entry.headword || entry.id} {entry.kind === "phrase" ? "短语" : "单词"}
    </Link>
  );
}

export function SentenceLibrary({
  entryId,
  readOnly = false
}: {
  entryId?: string;
  readOnly?: boolean;
}) {
  const { modal, message } = App.useApp();
  const client = useQueryClient();
  const [filters, setFilters] = useState<SentenceListQuery>({
    page: 1,
    page_size: 10
  });
  const [keyword, setKeyword] = useState("");
  const [level, setLevel] = useState<string>();
  const [dates, setDates] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [editor, setEditor] = useState<SharedSentence | "new">();
  const [detail, setDetail] = useState<SharedSentence>();
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [candidatePage, setCandidatePage] = useState(1);
  const [pending, setPending] = useState(false);
  const [claim, setClaim] = useState<SharedSentence>();
  const [claimIds, setClaimIds] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ["shared-sentences", entryId, filters],
    queryFn: () => api.sentences.list({ ...filters, entry_id: entryId })
  });
  const candidates = useQuery({
    queryKey: ["shared-sentences", "candidates", entryId, candidatePage],
    queryFn: () =>
      api.sentences.list({
        entry_id: entryId,
        candidates: true,
        page: candidatePage,
        page_size: 5
      }),
    enabled: !!entryId && !readOnly
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["shared-sentences"] });
    setSelected([]);
  };
  const failure = (e: unknown) =>
    message.error(e instanceof Error ? e.message : "操作失败，请重试");
  const open = async (id: string, editing: boolean) => {
    try {
      const fresh = await api.sentences.get(id);
      if (editing) setEditor(fresh);
      else setDetail(fresh);
    } catch (e) {
      void failure(e);
    }
  };
  const remove = (items: SharedSentence[]) =>
    modal.confirm({
      title: `删除 ${items.length} 条共享例句？`,
      content: (
        <Flex vertical gap="small">
          {items.map((item) => (
            <Typography.Text key={item.id}>
              {sentenceText(item).slice(0, 100)}：影响{" "}
              {item.entries.filter((e) => e.collected).length} 个已收录词条。
            </Typography.Text>
          ))}
          <Typography.Text type="danger">
            删除后所有词条的当前引用一起消失。
          </Typography.Text>
        </Flex>
      ),
      okButtonProps: { danger: true },
      onOk: async () => {
        const errors: string[] = [];
        for (const item of items) {
          try {
            await api.sentences.delete(item.id, {
              base_revision: item.revision
            });
          } catch (e) {
            errors.push(
              `${item.id}：${e instanceof Error ? e.message : "删除失败"}`
            );
          }
        }
        refresh();
        if (errors.length)
          modal.error({ title: "部分例句未删除", content: errors.join("；") });
      }
    });
  const uncollect = (item: SharedSentence) =>
    modal.confirm({
      title: "从当前词条移除收录？",
      content: "例句及其他词条收录保留。",
      onOk: async () => {
        try {
          await api.sentences.uncollect(item.id, entryId!, {
            base_revision: item.revision
          });
          refresh();
        } catch (e) {
          void failure(e);
          throw e;
        }
      }
    });
  const collect = async () => {
    if (!claim || !entryId) return;
    setPending(true);
    try {
      await api.sentences.collect(claim.id, {
        base_revision: claim.revision,
        entry_id: entryId,
        annotation_ids: claimIds
      });
      setClaim(undefined);
      refresh();
    } catch (e) {
      void failure(e);
    } finally {
      setPending(false);
    }
  };
  const rows = query.data?.items ?? [];
  return (
    <Flex vertical gap="middle">
      <Flex justify="space-between" align="center">
        <Typography.Title level={entryId ? 4 : 2} style={{ margin: 0 }}>
          多维例句
        </Typography.Title>
        {entryId && !readOnly && (
          <Button type="primary" onClick={() => setEditor("new")}>
            创编例句
          </Button>
        )}
      </Flex>
      {entryId && (
        <Typography.Text type="secondary">
          例句独立保存并发布；当前词条收录与句内关联分别维护。
        </Typography.Text>
      )}
      {!entryId && (
        <Space wrap>
          <Input
            aria-label="例句关键词"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="输入 ID / 例句 / 创建人"
            style={{ width: 250 }}
            onPressEnter={() =>
              setFilters({
                ...filters,
                page: 1,
                q: keyword || undefined,
                level,
                created_from: dates?.[0]?.startOf("day").toISOString(),
                created_to: dates?.[1]?.endOf("day").toISOString()
              })
            }
          />
          <Select
            aria-label="筛选例句等级"
            allowClear
            placeholder="例句等级"
            value={level}
            onChange={setLevel}
            style={{ width: 130 }}
            options={["A1", "A2", "B1", "B2", "C1", "C2"].map((value) => ({
              value,
              label: value
            }))}
          />
          <Typography.Text>创建时间</Typography.Text>
          <DatePicker.RangePicker value={dates} onChange={setDates} />
          <Button
            type="primary"
            onClick={() =>
              setFilters({
                ...filters,
                page: 1,
                q: keyword || undefined,
                level,
                created_from: dates?.[0]?.startOf("day").toISOString(),
                created_to: dates?.[1]?.endOf("day").toISOString()
              })
            }
          >
            搜索
          </Button>
          <Button
            onClick={() => {
              setKeyword("");
              setLevel(undefined);
              setDates(null);
              setFilters({ page: 1, page_size: 10 });
            }}
          >
            重置
          </Button>
          <Button
            danger
            disabled={!selected.length}
            onClick={() =>
              remove(rows.filter((row) => selected.includes(row.id)))
            }
          >
            删除所选
          </Button>
        </Space>
      )}
      {query.isError && (
        <Alert
          type="error"
          title="例句加载失败"
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={entryId && !readOnly ? 16 : 24}>
          <Table<SharedSentence>
            rowKey="id"
            dataSource={rows}
            loading={query.isFetching}
            scroll={{ x: entryId ? 700 : 1350 }}
            rowSelection={
              !entryId
                ? { selectedRowKeys: selected, onChange: setSelected }
                : undefined
            }
            pagination={{
              current: filters.page,
              pageSize: filters.page_size,
              total: query.data?.total,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              showTotal: (total) => `共 ${total} 条`,
              onChange: (page, page_size) => {
                setFilters((current) => ({ ...current, page, page_size }));
                setSelected([]);
              }
            }}
            columns={[
              ...(!entryId
                ? [
                    {
                      title: "ID",
                      dataIndex: "id",
                      width: 125,
                      render: (id: string) => (
                        <Typography.Text copyable={{ text: id }} title={id}>
                          {id.slice(0, 8)}
                        </Typography.Text>
                      )
                    }
                  ]
                : []),
              {
                title: "等级",
                width: 65,
                render: (_, row) => row.content.sentence.level
              },
              {
                title: "例句",
                width: 350,
                render: (_, row) => (
                  <Typography.Paragraph
                    style={{ margin: 0 }}
                    ellipsis={{ rows: 2, tooltip: sentenceText(row) }}
                  >
                    {sentenceText(row)}
                  </Typography.Paragraph>
                )
              },
              {
                title: "关联词条",
                width: 190,
                render: (_, row) => (
                  <Flex vertical>
                    {row.entries.slice(0, 2).map((e) => (
                      <span key={e.id}>
                        {entryLink(e)}{" "}
                        {e.collected ? (
                          <Tag>已收录</Tag>
                        ) : (
                          <Tag color="blue">已标注</Tag>
                        )}
                      </span>
                    ))}
                    {row.entries.length > 2 && (
                      <Typography.Text
                        title={row.entries.map((e) => e.headword).join("、")}
                      >
                        …
                      </Typography.Text>
                    )}
                    {row.content.annotations.some(
                      (a) => a.target.state === "pending"
                    ) && <Tag color="orange">含待关联</Tag>}
                  </Flex>
                )
              },
              ...(!entryId
                ? [
                    {
                      title: "创建时间",
                      width: 170,
                      render: (_: unknown, row: SharedSentence) =>
                        new Date(row.created_at).toLocaleString("zh-CN")
                    },
                    { title: "创建人", dataIndex: "created_by", width: 100 },
                    {
                      title: "更新时间",
                      width: 170,
                      render: (_: unknown, row: SharedSentence) =>
                        new Date(row.updated_at).toLocaleString("zh-CN")
                    }
                  ]
                : []),
              {
                title: "操作",
                fixed: "right",
                width: readOnly ? 70 : 220,
                render: (_, row) => (
                  <Space>
                    <Button
                      size="small"
                      onClick={() => void open(row.id, false)}
                    >
                      查看
                    </Button>
                    {!readOnly && (
                      <>
                        <Button
                          size="small"
                          onClick={() => void open(row.id, true)}
                        >
                          编辑
                        </Button>
                        {entryId ? (
                          <Button size="small" onClick={() => uncollect(row)}>
                            移除收录
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            danger
                            onClick={() => remove([row])}
                          >
                            删除
                          </Button>
                        )}
                      </>
                    )}
                  </Space>
                )
              }
            ]}
          />
        </Col>
        {entryId && !readOnly && (
          <Col xs={24} xl={8}>
            <Card title={`可收录例句（${candidates.data?.total ?? 0}）`}>
              <Typography.Paragraph type="secondary">
                以下例句已标注此词条，或含可能匹配的待关联文字。请核对上下文和具体词条后确认。
              </Typography.Paragraph>
              {candidates.isError && (
                <Alert
                  type="error"
                  title="候选加载失败"
                  action={
                    <Button onClick={() => void candidates.refetch()}>
                      重试
                    </Button>
                  }
                />
              )}
              <Table<SharedSentence>
                size="small"
                rowKey="id"
                loading={candidates.isFetching}
                dataSource={candidates.data?.items ?? []}
                pagination={{
                  current: candidatePage,
                  pageSize: 5,
                  total: candidates.data?.total,
                  onChange: setCandidatePage,
                  showSizeChanger: false
                }}
                columns={[
                  { title: "例句", render: (_, row) => sentenceText(row) },
                  {
                    title: "操作",
                    width: 180,
                    render: (_, row) => (
                      <Space>
                        <Button
                          size="small"
                          onClick={() => void open(row.id, false)}
                        >
                          查看
                        </Button>
                        <Button
                          size="small"
                          type="primary"
                          onClick={async () => {
                            try {
                              setClaim(await api.sentences.get(row.id));
                              setClaimIds([]);
                            } catch (e) {
                              void failure(e);
                            }
                          }}
                        >
                          确认收录
                        </Button>
                      </Space>
                    )
                  }
                ]}
              />
            </Card>
          </Col>
        )}
      </Row>
      {editor && (
        <SentenceEditor
          key={editor === "new" ? "new" : `${editor.id}:${editor.revision}`}
          sentence={editor === "new" ? undefined : editor}
          sourceEntryId={entryId}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            refresh();
            void message.success("例句已保存并发布");
          }}
        />
      )}
      {detail && (
        <Modal
          open
          title="查看例句"
          width={850}
          onCancel={() => setDetail(undefined)}
          footer={<Button onClick={() => setDetail(undefined)}>关闭</Button>}
        >
          <Flex vertical gap="middle">
            <Descriptions
              items={[
                { key: "id", label: "ID", children: detail.id },
                {
                  key: "level",
                  label: "等级",
                  children: detail.content.sentence.level
                }
              ]}
            />
            <Typography.Paragraph>{sentenceText(detail)}</Typography.Paragraph>
            {detail.content.sentence.zh_translations.map((t) => (
              <Typography.Paragraph key={t.id}>
                {t.band === "word_for_word"
                  ? "初阶"
                  : t.band === "balanced_fluency"
                    ? "中阶"
                    : "高阶"}
                ：{t.content.text}
              </Typography.Paragraph>
            ))}
            <Space wrap>
              {detail.entries.map((e) => (
                <span key={e.id}>
                  {entryLink(e)}（{e.collected ? "已收录" : "仅标注"}）
                </span>
              ))}
            </Space>
            {detail.content.annotations.map((a) => (
              <Typography.Text key={a.id}>
                {a.source_segments.map((s) => s.surface).join(" … ")} →{" "}
                {a.target.state === "linked"
                  ? (detail.entries.find(
                      (e) =>
                        e.id ===
                        (a.target.state === "linked"
                          ? a.target.target_entry_id
                          : "")
                    )?.headword ?? a.target.target_entry_id)
                  : `待关联：${a.target.headword} ${a.target.gloss ?? ""}`}
              </Typography.Text>
            ))}
          </Flex>
        </Modal>
      )}
      {claim && (
        <Modal
          open
          title="确认关联并收录到当前词条"
          onCancel={() => !pending && setClaim(undefined)}
          confirmLoading={pending}
          onOk={() => void collect()}
          okButtonProps={{
            disabled:
              !claim.content.annotations.some(
                (a) =>
                  a.target.state === "linked" &&
                  a.target.target_entry_id === entryId
              ) && claimIds.length === 0
          }}
        >
          <Typography.Paragraph>{sentenceText(claim)}</Typography.Paragraph>
          <Typography.Paragraph>
            当前词条 ID：{entryId}。同拼写的词条不会自动合并，请核对语境。
          </Typography.Paragraph>
          <Checkbox.Group
            value={claimIds}
            onChange={(values) => setClaimIds(values as string[])}
            options={claim.content.annotations
              .filter((a) => a.target.state === "pending")
              .map((a) => ({
                value: a.id,
                label:
                  a.target.state === "pending"
                    ? `${a.source_segments.map((s) => s.surface).join(" … ")} → ${a.target.headword}（${a.target.kind === "phrase" ? "短语" : "单词"}） ${a.target.gloss ?? ""}`
                    : ""
              }))}
          />
          <Typography.Paragraph type="secondary">
            勾选的待关联标记将绑定此具体词条；未勾选的保持待关联。
          </Typography.Paragraph>
        </Modal>
      )}
    </Flex>
  );
}
