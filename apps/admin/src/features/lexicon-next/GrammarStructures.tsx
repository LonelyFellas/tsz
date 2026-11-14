import { lazy, Suspense, useLayoutEffect, useState } from "react";
import type {
  NextGrammarStructure,
  NextGrammarVariant,
  PartOfSpeechCatalogItem,
  RichTextV3
} from "@tsz/types";
import { Button, Card, Space } from "@tsz/ui/admin/display";
import { Select } from "@tsz/ui/admin/forms";
import { App } from "@tsz/ui/admin/overlays";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { toRichTextV2 } from "@tsz/voice-editor/core";
import { VoiceEditorModal } from "@/features/dictionary/word-creation-v3/components/VoiceEditorModal";
import { localeLabels } from "./model";
import "@tsz/voice-editor/styles.css";
const VoiceEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceEditor
  }))
);

function GrammarText({
  variant,
  label,
  disabled,
  onChange,
  registerLeaveGuard
}: {
  variant: NextGrammarVariant;
  label: string;
  disabled: boolean;
  onChange: (value: RichTextV3) => void;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
}) {
  const [draft, setDraft] = useState<RichTextV3>();
  const dirty =
    draft !== undefined &&
    JSON.stringify(draft) !== JSON.stringify(variant.content);
  const { modal } = App.useApp();
  useLayoutEffect(() => {
    if (draft === undefined || !registerLeaveGuard) return;
    registerLeaveGuard(async () => {
      if (!dirty) {
        setDraft(undefined);
        return true;
      }
      return new Promise<boolean>((resolve) =>
        modal.confirm({
          title: "放弃语法结构修改？",
          content: "尚未完成的标注和正文修改将被丢弃。",
          okText: "放弃修改",
          cancelText: "继续编辑",
          onOk: () => {
            setDraft(undefined);
            resolve(true);
          },
          onCancel: () => resolve(false)
        })
      );
    });
    return () => registerLeaveGuard(undefined);
  }, [draft, dirty, modal, registerLeaveGuard]);
  return (
    <>
      <div className="lexicon-next-grammar-text">
        <RichTextReadOnly
          className="tsz-words"
          value={variant.content}
          emptyText="未填写语法结构"
        />
        <Button
          icon={<Pencil />}
          aria-label={`编辑${label}`}
          disabled={disabled}
          onClick={() => setDraft(structuredClone(variant.content))}
        />
      </div>
      <VoiceEditorModal
        open={draft !== undefined}
        title={label}
        footer={null}
        keyboard={!dirty}
        onCancel={() => setDraft(undefined)}
      >
        {draft && (
          <Suspense fallback={<span role="status">正在加载编辑器</span>}>
            <VoiceEditor
              mode="grammar"
              value={toRichTextV2(draft)}
              contextLabel={label}
              contextKey={variant.id}
              speechSettingsEnabled={false}
              showAudioUpload={false}
              previewEnabled={false}
              onChange={setDraft}
              renderActions={(canComplete) => (
                <Space>
                  <Button onClick={() => setDraft(undefined)}>取消</Button>
                  <Button
                    type="primary"
                    disabled={!canComplete}
                    onClick={() => {
                      onChange(draft);
                      setDraft(undefined);
                    }}
                  >
                    完成
                  </Button>
                </Space>
              )}
            />
          </Suspense>
        )}
      </VoiceEditorModal>
    </>
  );
}

export function GrammarStructures({
  rows,
  pos,
  catalog,
  target,
  disabled,
  referenceCount,
  registerLeaveGuard,
  onChange
}: {
  rows: NextGrammarStructure[];
  pos: string;
  catalog?: PartOfSpeechCatalogItem;
  target: string;
  disabled: boolean;
  referenceCount: (id: string) => number;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
  onChange: (
    update: (rows: NextGrammarStructure[]) => NextGrammarStructure[]
  ) => void;
}) {
  const { modal } = App.useApp();
  return (
    <Card size="small" title={`语法结构 · ${localeLabels[target] ?? target}`}>
      {rows
        .filter((row) => row.part_of_speech === pos)
        .map((row, index) => {
          const variant =
            row.variants.find((v) => v.locale === target) ??
            row.variants.find((v) => v.locale === "en");
          const subParts = catalog?.sub_parts ?? [];
          return (
            <div key={row.id} className="lexicon-next-grammar-row">
              <span>{index + 1}</span>
              <Select
                aria-label={`语法结构 ${index + 1} 细分词性`}
                disabled={disabled}
                placeholder="请选择细分词性"
                value={row.sub_pos || undefined}
                options={[
                  ...(!catalog?.sub_pos_required
                    ? [{ value: "", label: "不指定细分词性" }]
                    : []),
                  ...(row.sub_pos &&
                  !subParts.some((part) => part.code === row.sub_pos)
                    ? [
                        {
                          value: row.sub_pos,
                          label: "已失效的细分词性",
                          disabled: true
                        }
                      ]
                    : []),
                  ...subParts.map((part) => ({
                    value: part.code,
                    label: part.name_zh
                  }))
                ]}
                onChange={(sub_pos: string) =>
                  onChange((rows) =>
                    rows.map((item) =>
                      item.id === row.id ? { ...item, sub_pos } : item
                    )
                  )
                }
              />
              {variant ? (
                <GrammarText
                  variant={variant}
                  registerLeaveGuard={registerLeaveGuard}
                  label={`语法结构 ${index + 1} ${localeLabels[target] ?? target}内容`}
                  disabled={disabled}
                  onChange={(content) =>
                    onChange((rows) =>
                      rows.map((item) =>
                        item.id === row.id
                          ? {
                              ...item,
                              variants: item.variants.map((v) =>
                                v.id === variant.id ? { ...v, content } : v
                              )
                            }
                          : item
                      )
                    )
                  }
                />
              ) : (
                <Button
                  disabled={disabled}
                  onClick={() =>
                    onChange((rows) =>
                      rows.map((item) =>
                        item.id === row.id
                          ? {
                              ...item,
                              variants: [
                                ...item.variants,
                                {
                                  id: crypto.randomUUID(),
                                  locale: target,
                                  content: {
                                    version: 2,
                                    text: "",
                                    annotations: []
                                  }
                                }
                              ]
                            }
                          : item
                      )
                    )
                  }
                >
                  添加{localeLabels[target]}内容
                </Button>
              )}
              <Button
                icon={<Trash2 />}
                type="text"
                danger
                disabled={disabled}
                aria-label={`删除语法结构 ${index + 1}`}
                onClick={() => {
                  const count = referenceCount(row.id);
                  const remove = () =>
                    onChange((rows) =>
                      rows.filter((item) => item.id !== row.id)
                    );
                  if (count)
                    modal.confirm({
                      title: "删除语法结构？",
                      content: `将清除 ${count} 条释义的语法结构关联，释义正文保留。`,
                      okText: "删除",
                      cancelText: "取消",
                      okButtonProps: { danger: true },
                      onOk: remove
                    });
                  else remove();
                }}
              />
            </div>
          );
        })}
      <Button
        block
        type="dashed"
        icon={<Plus />}
        disabled={disabled || !pos}
        onClick={() =>
          onChange((rows) => [
            ...rows,
            {
              id: crypto.randomUUID(),
              part_of_speech: pos,
              variants: ["en-GB", "en-US"].map((locale) => ({
                id: crypto.randomUUID(),
                locale,
                content: { version: 2, text: "", annotations: [] }
              }))
            }
          ])
        }
      >
        添加语法结构
      </Button>
    </Card>
  );
}
