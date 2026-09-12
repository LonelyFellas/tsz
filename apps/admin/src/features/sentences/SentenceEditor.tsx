import { PronunciationPreviewProvider } from "../dictionary/word-creation/PronunciationPreview";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Flex,
  Input,
  Modal,
  Pagination,
  Radio,
  Select,
  Space,
  Tag,
  Typography
} from "antd";
import type {
  SharedSentence,
  SharedSentenceContent,
  SentenceTarget
} from "@tsz/types";
import { api } from "@/lib/auth";
import { V3LinkedEnglishTextField } from "../dictionary/word-creation-v3/components/V3LinkedEnglishTextField";
import { V3SentenceTranslationsField } from "../dictionary/word-creation-v3/components/V3SentenceTranslationsField";
import { editableEnglishText } from "../dictionary/word-creation-v3/meaningsModel";
import { sentenceTokens } from "../dictionary/word-creation-v3/tokens";
import { newSentence, selectedSegments } from "./model";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"].map((value) => ({
  value,
  label: value
}));

function AnnotationPicker({
  content,
  entries,
  disabled,
  onChange,
  onPendingChange
}: {
  onPendingChange: (pending: boolean) => void;
  entries: SharedSentence["entries"];
  content: SharedSentenceContent;
  disabled: boolean;
  onChange: (value: SharedSentenceContent) => void;
}) {
  const rows = editableEnglishText(content.sentence.en_text);
  const [dialect, setDialect] = useState(rows[0]?.dialect ?? "common");
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"linked" | "pending">("linked");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [targetPage, setTargetPage] = useState(1);
  const [targetId, setTargetId] = useState<string>();
  const [targetLabels, setTargetLabels] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      entries.map((e) => [e.id, `${e.headword} · ${e.id.slice(-8)}`])
    )
  );
  const [kind, setKind] = useState("word");
  const [headword, setHeadword] = useState("");
  const [gloss, setGloss] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setTargetPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const targets = useQuery({
    queryKey: ["sentence-target-entries", debounced, targetPage],
    queryFn: () =>
      api.words.list({ q: debounced, page: targetPage, page_size: 50 }),
    enabled: mode === "linked" && debounced.trim().length > 0
  });
  const row = rows.find((item) => item.dialect === dialect) ?? rows[0];
  const text = row?.text ?? "";
  const tokens = useMemo(() => sentenceTokens(text), [text]);
  const chosen = tokens.filter((token) => selected.includes(token.key));
  const segments = selectedSegments(text, chosen);
  useEffect(
    () => onPendingChange(segments.length > 0),
    [segments.length, onPendingChange]
  );
  const literal = segments.map((s) => s.surface).join(" … ");
  const blocked = (start: number, end: number) =>
    content.annotations.some(
      (a) =>
        a.source_dialect === row?.dialect &&
        a.source_segments.some((s) => start < s.end && end > s.start)
    );
  const add = () => {
    if (!segments.length || (mode === "linked" ? !targetId : !headword.trim()))
      return;
    const target: SentenceTarget =
      mode === "linked"
        ? { state: "linked", target_entry_id: targetId! }
        : {
            state: "pending",
            kind,
            headword: headword.trim(),
            gloss: gloss.trim() || null
          };
    if (targetId) {
      const word = targets.data?.words.find((word) => word.id === targetId);
      if (word)
        setTargetLabels((current) => ({
          ...current,
          [targetId]: `${word.presentation.label}${word.annotation ? `（${word.annotation}）` : ""} · ${word.id.slice(-8)}`
        }));
    }
    onChange({
      ...content,
      annotations: [
        ...content.annotations,
        {
          id: crypto.randomUUID(),
          source_dialect: row!.dialect,
          source_segments: segments,
          target
        }
      ]
    });
    setSelected([]);
    setTargetId(undefined);
  };
  return (
    <Flex vertical gap="small">
      <Typography.Text strong>句内关联</Typography.Text>
      <Typography.Text type="secondary">
        点选一个或多个词，可组合为短语。关联只确定目标；其他词条确认后才正式收录。
      </Typography.Text>
      {rows.length > 1 && (
        <Radio.Group
          value={row?.dialect}
          disabled={disabled}
          onChange={(e) => {
            setDialect(e.target.value);
            setSelected([]);
          }}
          options={rows.map((r) => ({
            label: r.dialect === "uk" ? "英式" : "美式",
            value: r.dialect
          }))}
        />
      )}
      <Space wrap>
        {tokens.map((token) => (
          <Button
            key={token.key}
            size="small"
            disabled={disabled || blocked(token.start, token.end)}
            type={selected.includes(token.key) ? "primary" : "default"}
            onClick={() => {
              const next = selected.includes(token.key)
                ? selected.filter((key) => key !== token.key)
                : [...selected, token.key];
              setSelected(next);
              const literal = selectedSegments(
                text,
                tokens.filter((t) => next.includes(t.key))
              )
                .map((s) => s.surface)
                .join(" ");
              setSearch(literal);
              setHeadword(literal);
              setKind(next.length > 1 ? "phrase" : "word");
              setTargetId(undefined);
            }}
          >
            {token.text}
          </Button>
        ))}
      </Space>
      {!!segments.length && (
        <Flex
          vertical
          gap="small"
          style={{ padding: 12, border: "1px solid #d9d9d9", borderRadius: 8 }}
        >
          <Typography.Text>选中：{literal}</Typography.Text>
          <Radio.Group
            value={mode}
            disabled={disabled}
            onChange={(e) => setMode(e.target.value)}
            options={[
              { label: "关联已有词条", value: "linked" },
              { label: "词条未创建，记为待关联", value: "pending" }
            ]}
          />
          {mode === "linked" ? (
            <>
              <Select
                aria-label="选择具体词条"
                showSearch={{ filterOption: false, onSearch: setSearch }}
                placeholder="输入词面检索，再选择具体词条"
                loading={targets.isFetching}
                value={targetId}
                onChange={setTargetId}
                disabled={disabled}
                options={targets.data?.words.map((word) => ({
                  value: word.id,
                  label: `${word.presentation.label} · ${word.kind === "phrase" ? "短语" : "单词"} · ${word.gloss || word.annotation || "未填写释义"} · ${word.id.slice(-8)}${word.status === "draft" ? "（草稿）" : ""}`
                }))}
              />
              {targets.data && targets.data.page.total > 50 && (
                <Pagination
                  aria-label="词条检索分页"
                  size="small"
                  current={targetPage}
                  pageSize={50}
                  total={targets.data.page.total}
                  showSizeChanger={false}
                  onChange={(page) => {
                    setTargetPage(page);
                    setTargetId(undefined);
                  }}
                />
              )}
              {targets.isError && (
                <Alert type="error" title="词条查询失败，请重新搜索" />
              )}
            </>
          ) : (
            <Space wrap>
              <Select
                aria-label="待关联类型"
                value={kind}
                onChange={setKind}
                options={[
                  { value: "word", label: "单词" },
                  { value: "phrase", label: "短语" }
                ]}
                disabled={disabled}
              />
              <Input
                aria-label="待关联词面"
                value={headword}
                onChange={(e) => setHeadword(e.target.value)}
                placeholder="词或短语原形"
                maxLength={200}
                disabled={disabled}
              />
              <Input
                aria-label="待关联释义"
                value={gloss}
                onChange={(e) => setGloss(e.target.value)}
                placeholder="释义或上下文（可选）"
                maxLength={2000}
                disabled={disabled}
              />
            </Space>
          )}
          <Button
            onClick={add}
            disabled={
              disabled || (mode === "linked" ? !targetId : !headword.trim())
            }
          >
            确认这处标注
          </Button>
        </Flex>
      )}
      <Space wrap>
        {content.annotations.map((a) => (
          <Tag
            key={a.id}
            color={a.target.state === "linked" ? "blue" : "orange"}
            closable={!disabled}
            onClose={() =>
              onChange({
                ...content,
                annotations: content.annotations.filter(
                  (item) => item.id !== a.id
                )
              })
            }
          >
            {a.source_segments.map((s) => s.surface).join(" … ")}：
            {a.target.state === "linked"
              ? `已关联 ${targetLabels[a.target.target_entry_id] || "具体词条"}`
              : `待关联 ${a.target.headword}${a.target.gloss ? `（${a.target.gloss}）` : ""}`}
          </Tag>
        ))}
      </Space>
    </Flex>
  );
}

export function SentenceEditor({
  sentence,
  sourceEntryId,
  onClose,
  onSaved
}: {
  sentence?: SharedSentence;
  sourceEntryId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { modal } = App.useApp();
  const [content, setContent] = useState<SharedSentenceContent>(() =>
    sentence ? structuredClone(sentence.content) : newSentence()
  );
  const [saving, setSaving] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState(false);
  const [error, setError] = useState("");
  const [changedPositions, setChangedPositions] = useState(false);
  const finish = async () => {
    if (pendingAnnotation) {
      setError("请先确认当前句内标注，或取消所选片段。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const next = structuredClone(content);
      // Empty starter rows are editing affordances, not published translations.
      next.sentence.zh_translations = next.sentence.zh_translations.filter(
        (t) => t.content.text.trim()
      );
      if (!next.sentence.zh_translations.length) {
        setError("请至少填写一条译文");
        return;
      }
      const alias =
        next.sentence.zh_translations.find(
          (t) => t.id === next.sentence.zh_text_id
        ) ?? next.sentence.zh_translations[0]!;
      next.sentence.zh_text_id = alias.id;
      next.sentence.zh_text = alias.content;
      if (sentence)
        await api.sentences.update(sentence.id, {
          base_revision: sentence.revision,
          content: next
        });
      else if (sourceEntryId)
        await api.sentences.create({
          source_entry_id: sourceEntryId,
          content: next
        });
      else throw new Error("请从具体词条内创建例句");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，输入已保留，请重试");
    } finally {
      setSaving(false);
    }
  };
  const close = () =>
    modal.confirm({
      title: "放弃本次未完成的例句编辑？",
      content: "尚未点完成的修改不会保存。此前已经完成的例句不受影响。",
      onOk: onClose
    });
  return (
    <PronunciationPreviewProvider>
      <Modal
        open
        title={sentence ? "编辑共享例句" : "创编例句"}
        width={1100}
        onCancel={close}
        maskClosable={false}
        closable={!saving}
        footer={
          <Space>
            <Button disabled={saving} onClick={close}>
              取消
            </Button>
            <Button
              type="primary"
              loading={saving}
              onClick={() => void finish()}
            >
              完成
            </Button>
          </Space>
        }
      >
        <Flex vertical gap="middle">
          <Alert
            type="info"
            title={
              sentence
                ? `修改会同步影响 ${sentence.entries.filter((e) => e.collected).length} 个已收录词条`
                : "完成后立即发布例句并收录到当前词条，取消外层词条编辑不会撤销。"
            }
          />
          {error && (
            <Alert
              type="error"
              title={error}
              description="若提示版本冲突，请保留所需内容，关闭后重新打开最新例句再编辑。"
            />
          )}
          {changedPositions && (
            <Alert
              type="warning"
              title="正文变化使部分原标注位置失效，请重新点选对应片段。"
            />
          )}
          <Space>
            <Typography.Text>等级</Typography.Text>
            <Select
              aria-label="例句等级"
              value={content.sentence.level}
              options={LEVELS}
              disabled={saving}
              onChange={(level) =>
                setContent((current) => ({
                  ...current,
                  sentence: { ...current.sentence, level }
                }))
              }
            />
          </Space>
          <V3LinkedEnglishTextField
            label="例句"
            suffix="英文"
            value={content.sentence.en_text}
            wordId={sourceEntryId}
            linksEnabled={false}
            readOnly={saving}
            onChange={(en_text) => {
              const rows = editableEnglishText(en_text);
              const annotations = content.annotations.filter((a) => {
                const row = rows.find((r) => r.dialect === a.source_dialect);
                return (
                  row &&
                  a.source_segments.every(
                    (s) =>
                      Array.from(row.text).slice(s.start, s.end).join("") ===
                      s.surface
                  )
                );
              });
              if (annotations.length !== content.annotations.length)
                setChangedPositions(true);
              setContent({
                ...content,
                sentence: { ...content.sentence, en_text },
                annotations
              });
            }}
          />
          <AnnotationPicker
            onPendingChange={setPendingAnnotation}
            entries={sentence?.entries ?? []}
            content={content}
            disabled={saving}
            onChange={setContent}
          />
          <V3SentenceTranslationsField
            sentence={content.sentence}
            index={0}
            disabled={saving}
            onChange={(zh_translations) =>
              setContent((current) => ({
                ...current,
                sentence: { ...current.sentence, zh_translations }
              }))
            }
          />
        </Flex>
      </Modal>
    </PronunciationPreviewProvider>
  );
}
