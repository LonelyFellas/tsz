import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
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
      {entry.headword || entry.id} ·{" "}
      {entry.senses.length
        ? entry.senses.map((sense) => sense.gloss || "暂无释义").join(" / ")
        : "待选择词义"}
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
  const [editor, setEditor] = useState<SharedSentence>();
  const [detail, setDetail] = useState<SharedSentence>();
  const [selected, setSelected] = useState<React.Key[]>([]);
  const query = useQuery({
    queryKey: ["shared-sentences", entryId, filters],
    queryFn: () => api.sentences.list({ ...filters, entry_id: entryId })
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
              {sentenceText(item).slice(0, 100)}：影响 {item.entries.length}{" "}
              个关联词条。
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
  const rows = query.data?.items ?? [];
  if (editor)
    return (
      <SentenceEditor
        key={`${editor.id}:${editor.revision}`}
        sentence={editor}
        onClose={() => setEditor(undefined)}
        onSaved={() => {
          setEditor(undefined);
          refresh();
        }}
      />
    );
  return (
    <Flex vertical gap="middle">
      <Flex justify="space-between" align="center">
        <Typography.Title level={entryId ? 4 : 2} style={{ margin: 0 }}>
          多维例句
        </Typography.Title>
      </Flex>
      {entryId && (
        <Typography.Text type="secondary">
          展示句内关联到当前词条的例句。修改会同步到例句库。
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
        <Col xs={24} xl={24}>
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
                      <span key={e.id}>{entryLink(e)} </span>
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
                        {!entryId && (
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
      </Row>

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
                <span key={e.id}>{entryLink(e)}</span>
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
                  : a.target.state === "entry_only"
                    ? "待选择词义"
                    : `待关联：${a.target.headword} ${a.target.gloss ?? ""}`}
              </Typography.Text>
            ))}
          </Flex>
        </Modal>
      )}
    </Flex>
  );
}
