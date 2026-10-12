import { useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Breadcrumb,
  Tooltip,
  Tag,
  Empty,
  Input,
  Modal,
  Pagination,
  Result,
  Space,
  Typography
} from "antd";
import {
  ArrowLeftOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  DeleteOutlined,
  HolderOutlined,
  PlusOutlined,
  SearchOutlined
} from "@ant-design/icons";
import "@/features/wordlists/wordlist-editor.css";
import { HttpError } from "@tsz/api-client";
import type {
  AdminWordlistEdit,
  CreateAdminWordlist,
  WordlistCandidate
} from "@tsz/types";
import { api, useAuthStore, usePermission } from "@/lib/auth";

type Row = {
  key: string;
  entryId: string | null;
  text: string;
  note: string;
  candidate?: WordlistCandidate | null;
};
const emptyRow = (): Row => ({
  key: crypto.randomUUID(),
  entryId: null,
  text: "",
  note: ""
});
export function WordListEditorPage() {
  const { id } = useParams<{ id: string }>();
  const profile = useAuthStore((s) => s.profile);
  const allowed = usePermission(id ? "wordlists.edit" : "wordlists.create");
  const snapshot = useQuery({
    queryKey: [
      "admin-wordlists",
      profile?.id,
      "edit",
      id,
      profile?.permission_version
    ],
    enabled: !!profile && allowed && !!id,
    queryFn: ({ signal }) => api.wordlists.edit(id!, { signal }),
    refetchOnWindowFocus: false,
    refetchOnMount: "always"
  });
  if (!allowed || !profile) return <Result status="403" title="暂无编辑权限" />;
  if (id && snapshot.isError)
    return (
      <Alert
        type="error"
        title="词表加载失败"
        action={<Button onClick={() => void snapshot.refetch()}>重试</Button>}
      />
    );
  if (id && (!snapshot.data || !snapshot.isFetchedAfterMount))
    return <p>正在加载…</p>;
  return (
    <Editor
      key={`${profile.id}:${profile.permission_version}:${id ?? "new"}`}
      adminId={profile.id}
      initial={snapshot.data}
    />
  );
}
export function Editor({
  adminId,
  initial: snapshot
}: {
  adminId: string;
  initial?: AdminWordlistEdit;
}) {
  // Keep the optimistic-lock revision tied to the fields the editor opened.
  const [initial] = useState(snapshot);
  const navigate = useNavigate();
  const client = useQueryClient();
  const [name, setName] = useState(initial?.detail.wordlist.name ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    initial
      ? initial.items.map((item) => ({
          key: crypto.randomUUID(),
          entryId: item.entry_id,
          text: item.candidate?.label ?? "内容不可用",
          note: item.admin_note,
          candidate: item.candidate
        }))
      : [emptyRow()]
  );
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [invalidRow, setInvalidRow] = useState<string>();
  const [confirmSave, setConfirmSave] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<CreateAdminWordlist | null>(null);
  const saved = useRef(false);
  const inFlight = useRef(false);
  const drag = useRef<string | null>(null);
  const blocker = useBlocker(() => !saved.current && dirty);
  const id = initial?.detail.wordlist.id;
  const allowNotes = !initial?.detail.wordlist.owner_user_id;
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function change(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
    setError("");
  }
  function move(key: string, target: string) {
    setRows((rs) => {
      const from = rs.findIndex((r) => r.key === key),
        to = rs.findIndex((r) => r.key === target);
      if (from < 0 || to < 0) return rs;
      const next = [...rs];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row!);
      return next;
    });
    setDirty(true);
  }
  const contentChanged =
    !initial ||
    name.trim() !== initial.detail.wordlist.name ||
    JSON.stringify(rows.map((r) => r.entryId)) !==
      JSON.stringify(initial.items.map((r) => r.entry_id));
  function validate() {
    if (!name.trim() || [...name].length > 100) {
      setError("请填写 1–100 字的词表名称");
      return false;
    }
    const seen = new Set<string>();
    const bad = rows.find((r) => {
      if (
        !r.entryId ||
        !r.candidate ||
        seen.has(r.entryId) ||
        [...r.note].length > 1000
      )
        return true;
      seen.add(r.entryId);
      return false;
    });
    if (bad) {
      setFilter("");
      setPage(Math.floor(rows.indexOf(bad) / 50) + 1);
      setInvalidRow(bad.key);
      setError(
        `第 ${rows.indexOf(bad) + 1} 行：${!bad.entryId ? "请从搜索结果中选择词汇" : !bad.candidate ? "该词汇已不可用，请更换或删除" : seen.has(bad.entryId) ? "词汇重复，请更换或删除" : "备注不能超过 1000 字"}`
      );
      return false;
    }
    if (!rows.length) {
      setError("至少添加一个词条");
      return false;
    }
    setInvalidRow(undefined);
    return true;
  }
  async function save() {
    if (inFlight.current || !validate()) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const data = {
        name: name.trim(),
        items: rows.map((r) => ({
          entry_id: r.entryId!,
          admin_note: allowNotes ? r.note : ""
        }))
      };
      if (id && initial)
        await api.wordlists.update(id, {
          ...data,
          expected_revision: initial.detail.wordlist.revision
        });
      else {
        pending.current ??= { ...data, idempotency_key: crypto.randomUUID() };
        await api.wordlists.create(pending.current);
      }
      saved.current = true;
      setDirty(false);
      await client.invalidateQueries({
        queryKey: ["admin-wordlists", adminId]
      });
      navigate("/wordlists");
    } catch (e) {
      const unknown = !(e instanceof HttpError) || e.status >= 500;
      if (!id && !unknown) pending.current = null;
      setUncertain(!id && unknown);
      setError(
        unknown
          ? "未能确认是否保存成功，请重试。"
          : e instanceof HttpError && e.status === 409
            ? "词表已被修改，请重新打开后再编辑。"
            : "保存失败，请检查词汇后重试。"
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
      setConfirmSave(false);
    }
  }
  const filtered = rows.filter((r) =>
    r.text.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())
  );
  const visible = filtered.slice((page - 1) * 50, page * 50);
  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
    setFilter("");
    setPage(Math.floor(rows.length / 50) + 1);
    setDirty(true);
  }
  return (
    <div className="wordlist-editor">
      <Breadcrumb
        items={[{ title: "词表管理" }, { title: id ? "编辑词表" : "新建词表" }]}
      />
      <header className="wordlist-editor__header">
        <div className="wordlist-editor__heading">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            aria-label="返回词表列表"
            disabled={saving}
            onClick={() => navigate("/wordlists")}
          />
          <Typography.Title level={3} title={name.trim() || undefined}>
            {name.trim() || (id ? "编辑词表" : "新建词表")}
          </Typography.Title>
          {initial && (
            <Tag
              color={
                initial.detail.wordlist.state === "published"
                  ? "green"
                  : "default"
              }
            >
              {initial.detail.wordlist.state === "published" ? "公开" : "私密"}
            </Tag>
          )}
        </div>
        <Space>
          <Button disabled={saving} onClick={() => navigate("/wordlists")}>
            取消
          </Button>
          <Button
            type="primary"
            loading={saving}
            onClick={() => {
              if (!validate()) return;
              if (
                initial?.detail.wordlist.state === "published" &&
                contentChanged
              )
                setConfirmSave(true);
              else void save();
            }}
          >
            {uncertain ? "重试保存" : "保存"}
          </Button>
        </Space>
      </header>
      {error && <Alert showIcon type="error" title={error} />}
      <section className="wordlist-editor__panel wordlist-editor__basics">
        <label className="wordlist-editor__label" htmlFor="wordlist-name">
          词表名称<span className="wordlist-editor__required"> *</span>
        </label>
        <Input
          id="wordlist-name"
          aria-label="词表名称"
          placeholder="请输入词表名称"
          showCount
          maxLength={100}
          value={name}
          disabled={saving || uncertain}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
        />
      </section>
      <section className="wordlist-editor__panel">
        <div className="wordlist-editor__toolbar">
          <div className="wordlist-editor__section-title">
            <Typography.Title level={5}>词汇</Typography.Title>
            <span>{rows.length} 个</span>
          </div>
          <Space wrap>
            <Input
              className="wordlist-editor__filter"
              prefix={<SearchOutlined />}
              aria-label="筛选词汇"
              placeholder="搜索表内词汇"
              allowClear
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
            />
            <Button
              icon={<PlusOutlined />}
              disabled={saving || uncertain || rows.length >= 10000}
              onClick={addRow}
            >
              添加词汇
            </Button>
          </Space>
        </div>
        <div className="wordlist-editor__columns" aria-hidden="true">
          <span />
          <span>单词 / 短语</span>
          <span>释义</span>
          <span />
        </div>
        <div className="wordlist-editor__rows">
          {visible.map((row) => {
            const index = rows.indexOf(row);
            const reorderDisabled = saving || uncertain || !!filter;
            return (
              <div
                key={row.key}
                className={`wordlist-editor__row${invalidRow === row.key ? " wordlist-editor__row--invalid" : ""}`}
                onDragStart={() => {
                  drag.current = row.key;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag.current && !reorderDisabled)
                    move(drag.current, row.key);
                  drag.current = null;
                }}
              >
                <div className="wordlist-editor__leading">
                  <Tooltip title="拖动排序">
                    <span
                      className="wordlist-editor__drag"
                      draggable={!reorderDisabled}
                      aria-hidden="true"
                    >
                      <HolderOutlined />
                    </span>
                  </Tooltip>
                  <span className="wordlist-editor__index">{index + 1}</span>
                </div>
                <WordRow
                  row={row}
                  index={index + 1}
                  adminId={adminId}
                  disabled={saving || uncertain}
                  invalid={invalidRow === row.key}
                  allowNotes={allowNotes}
                  onChange={(patch) => change(row.key, patch)}
                />
                <div className="wordlist-editor__actions">
                  <Tooltip title="上移">
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowUpOutlined />}
                      aria-label={`上移第 ${index + 1} 行`}
                      disabled={reorderDisabled || index === 0}
                      onClick={() => move(row.key, rows[index - 1]!.key)}
                    />
                  </Tooltip>
                  <Tooltip title="下移">
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowDownOutlined />}
                      aria-label={`下移第 ${index + 1} 行`}
                      disabled={reorderDisabled || index === rows.length - 1}
                      onClick={() => move(row.key, rows[index + 1]!.key)}
                    />
                  </Tooltip>
                  <Tooltip title="删除">
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`删除第 ${index + 1} 行`}
                      disabled={saving || uncertain}
                      onClick={() =>
                        Modal.confirm({
                          title: "删除词汇？",
                          content: row.text || "此行尚未填写词汇",
                          okText: "删除",
                          okButtonProps: { danger: true },
                          cancelText: "取消",
                          onOk: () => {
                            setRows((rs) =>
                              rs.filter((r) => r.key !== row.key)
                            );
                            setPage(1);
                            setDirty(true);
                          }
                        })
                      }
                    />
                  </Tooltip>
                </div>
              </div>
            );
          })}
          {!visible.length && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={filter ? "未找到相关词汇" : "还没有添加词汇"}
            />
          )}
        </div>
        <div className="wordlist-editor__footer">
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            disabled={saving || uncertain || rows.length >= 10000}
            onClick={addRow}
          >
            添加词汇
          </Button>
          {filtered.length > 50 && (
            <Pagination
              size="small"
              current={page}
              pageSize={50}
              total={filtered.length}
              showSizeChanger={false}
              onChange={setPage}
            />
          )}
        </div>
      </section>
      <Modal
        title="保存后转为私密"
        open={confirmSave}
        confirmLoading={saving}
        onCancel={() => {
          if (!saving) setConfirmSave(false);
        }}
        onOk={() => void save()}
      >
        <p>保存后，词表将转为私密并取消推荐。需要时可重新设为公开。</p>
      </Modal>
      <Modal
        title="放弃修改？"
        open={blocker.state === "blocked"}
        okText="退出"
        cancelText="继续编辑"
        okButtonProps={{ disabled: saving }}
        onCancel={() => blocker.state === "blocked" && blocker.reset()}
        onOk={() => blocker.state === "blocked" && blocker.proceed()}
      >
        <p>当前修改尚未保存。</p>
      </Modal>
    </div>
  );
}

function WordRow({
  row,
  index,
  adminId,
  disabled,
  invalid,
  allowNotes,
  onChange
}: {
  row: Row;
  index: number;
  adminId: string;
  disabled: boolean;
  invalid: boolean;
  allowNotes: boolean;
  onChange: (patch: Partial<Row>) => void;
}) {
  const [searchText, setSearchText] = useState(row.text);
  useEffect(() => {
    const timer = setTimeout(() => setSearchText(row.text), 250);
    return () => clearTimeout(timer);
  }, [row.text]);
  const search = useQuery({
    queryKey: ["admin-wordlists", adminId, "suggestions", searchText],
    enabled:
      !row.entryId && searchText.trim().length > 0 && searchText === row.text,
    queryFn: ({ signal }) =>
      api.wordlists.suggestions({ q: searchText }, { signal })
  });
  return (
    <>
      <div className="wordlist-editor__word">
        <label
          className="wordlist-editor__mobile-label"
          htmlFor={`word-${row.key}`}
        >
          单词 / 短语
        </label>
        <Input
          id={`word-${row.key}`}
          aria-label={`词汇 ${index}`}
          value={row.text}
          disabled={disabled}
          status={invalid ? "error" : undefined}
          placeholder="输入单词或短语"
          onChange={(e) =>
            onChange({
              text: e.target.value,
              entryId: null,
              candidate: undefined
            })
          }
        />
        {!row.entryId && searchText === row.text && (
          <>
            {search.isFetching && (
              <div className="wordlist-editor__hint">正在搜索…</div>
            )}
            {search.isError && (
              <div className="wordlist-editor__hint">
                搜索失败，
                <Button
                  type="link"
                  size="small"
                  onClick={() => void search.refetch()}
                >
                  重试
                </Button>
              </div>
            )}
            {search.data && search.data.items.length > 0 && (
              <div className="wordlist-editor__suggestions">
                {search.data.items.map((candidate) => (
                  <button
                    type="button"
                    key={candidate.entry_id}
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        entryId: candidate.entry_id,
                        text: candidate.label,
                        candidate
                      })
                    }
                  >
                    <span>{candidate.label}</span>
                    <small>{candidate.glosses.join("；")}</small>
                  </button>
                ))}
              </div>
            )}
            {search.isSuccess && !search.data.items.length && (
              <div className="wordlist-editor__hint">
                未找到相关词汇，请换个关键词。
              </div>
            )}
          </>
        )}
      </div>
      <div className="wordlist-editor__meaning">
        <span className="wordlist-editor__mobile-label">释义</span>
        {row.entryId ? (
          row.candidate ? (
            row.candidate.glosses.length ? (
              row.candidate.glosses.map((gloss, i) => (
                <div key={i}>{gloss}</div>
              ))
            ) : (
              <span className="wordlist-editor__placeholder">暂无释义</span>
            )
          ) : (
            <Typography.Text type="warning">
              词汇已不可用，请更换或删除
            </Typography.Text>
          )
        ) : (
          <span className="wordlist-editor__placeholder">
            选择词汇后显示释义
          </span>
        )}
      </div>
      {allowNotes && (
        <div className="wordlist-editor__note">
          <label htmlFor={`note-${row.key}`}>备注</label>
          <Input.TextArea
            id={`note-${row.key}`}
            aria-label={`后台备注 ${index}`}
            placeholder="添加备注（仅后台可见）"
            maxLength={1000}
            showCount
            autoSize={{ minRows: 1, maxRows: 3 }}
            value={row.note}
            disabled={disabled}
            onChange={(e) => onChange({ note: e.target.value })}
          />
        </div>
      )}
    </>
  );
}
