import { SentenceSources } from "./SentenceDetails";
import { sentenceStyles, translationStyle } from "./sentenceModel";
import { SentenceReadingPreview } from "./SentenceReadingPreview";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { canAdminResourceAction } from "@tsz/shared/auth";
import type { NextSentence } from "@tsz/types";
import {
  Alert,
  Button,
  Flex,
  Skeleton,
  Space,
  Tag
} from "@tsz/ui/admin/display";
import { Input } from "@tsz/ui/admin/forms";
import { Modal } from "@tsz/ui/admin/overlays";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { toRichTextV2 } from "@tsz/voice-editor/core";
import { Plus, Trash2 } from "lucide-react";
import { AdminTable } from "@/components/AdminTable";
import { useAuthStore, usePermission } from "@/lib/auth";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import {
  PronunciationPreviewControls,
  PronunciationPreviewProvider
} from "@/features/dictionary/word-creation/PronunciationPreview";
import { EntryDialectContext } from "@/features/settings/useDialectPreference";
import {
  SenseSectionBody,
  SenseSectionTitle
} from "@/features/dictionary/word-creation-v3/components/V3SenseSection";
import { NextSentenceEditor } from "./NextSentenceEditor";
import { localeLabels } from "./model";
const sentenceKey = (actor: string | undefined, id: string) => [
  "admin-lexicon-next",
  "sentence",
  actor,
  id
];

function SentenceResource({
  id,
  target,
  medium,
  requests,
  actions
}: {
  id: string;
  target: string;
  medium: string;
  requests: LexiconNextRequests;
  actions?: (source: NextSentence) => React.ReactNode;
}) {
  const actor = useAuthStore((s) => s.profile);
  const canRead = usePermission("sentences.access");
  const query = useQuery({
    queryKey: sentenceKey(actor?.id, id),
    queryFn: () => requests.sentence(id),
    enabled: canRead,
    retry: false
  });
  const catalog = useQuery({
    queryKey: ["admin-lexicon-next", "equivalent-catalog"],
    queryFn: requests.equivalentCatalog,
    enabled:
      canRead &&
      !!query.data?.draft.variants.find((v) => v.locale === target)?.metadata,
    staleTime: 5 * 60 * 1000,
    retry: false
  });
  if (!canRead) return <Alert type="warning" title="没有例句查看权限" />;
  if (query.isPending) return <Skeleton active paragraph={{ rows: 2 }} />;
  if (query.isError)
    return (
      <Alert
        type="error"
        title={query.error.message}
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      />
    );
  const source = query.data;
  const variant = source.draft.variants.find((v) => v.locale === target);
  return (
    <Flex vertical gap={8}>
      {variant ? (
        <>
          <Space>
            <Tag>{variant.level}</Tag>
            <PronunciationPreviewControls
              pronunciationId={variant.id}
              recommendationArea="example"
              playbackOnly
              assetOnly
              dialect={target === "en-GB" ? "uk" : "us"}
              ariaLabelPrefix={`${localeLabels[target]}例句`}
              content={toRichTextV2(variant.content)}
              voiceProfile={variant.voice_profile}
              audioAssets={variant.audio_assets}
            />
            <RichTextReadOnly className="tsz-words" value={variant.content} />
          </Space>
          {variant.metadata && (
            <>
              {catalog.isError && (
                <Alert
                  type="error"
                  title="语体与领域目录加载失败"
                  action={
                    <Button onClick={() => void catalog.refetch()}>重试</Button>
                  }
                />
              )}
              <Space wrap>
                {(["register_ids", "domain_ids"] as const).flatMap((field) =>
                  variant.metadata![field].map((id) => (
                    <Tag key={id}>
                      {catalog.data?.[
                        field === "register_ids" ? "registers" : "domains"
                      ].find((row) => row.id === id)?.name_zh ??
                        (catalog.isPending
                          ? "正在读取标签"
                          : catalog.isError
                            ? "标签目录不可用"
                            : "配置不存在")}
                    </Tag>
                  ))
                )}
              </Space>
              <SentenceSources rows={variant.metadata.sources} />
            </>
          )}
          {variant.translations
            .filter((v) => v.locale === medium && v.content.text.trim())
            .map((row) => (
              <div key={row.id}>
                <Space>
                  <Tag>
                    {translationStyle(row)
                      ? sentenceStyles[translationStyle(row)!]
                      : "待评估"}
                  </Tag>
                  {row.metadata?.freedom != null && (
                    <span>{row.metadata.freedom.toFixed(1)}%</span>
                  )}
                  <RichTextReadOnly value={row.content} />
                </Space>
                {row.metadata && (
                  <SentenceSources rows={row.metadata.sources} />
                )}
              </div>
            ))}
        </>
      ) : (
        <span>尚未填写{localeLabels[target]}例句</span>
      )}
      {actions?.(source)}
    </Flex>
  );
}
export function SentenceExamplesPreview({
  detailsAvailable = false,
  senseLevel,
  ids,
  target,
  medium,
  requests
}: {
  detailsAvailable?: boolean;
  senseLevel?: string;
  ids?: string[];
  target: string;
  medium: string;
  requests: LexiconNextRequests;
}) {
  if (detailsAvailable && ids?.length)
    return (
      <SentenceReadingPreview
        ids={ids}
        target={target}
        medium={medium}
        senseLevel={senseLevel}
        requests={requests}
      />
    );
  return ids?.length ? (
    <EntryDialectContext.Provider
      value={target === "en-GB" ? "en-GB" : "en-US"}
    >
      <PronunciationPreviewProvider>
        <Flex vertical gap={16} aria-label="多维例句">
          {ids.map((id) => (
            <SentenceResource
              key={id}
              id={id}
              target={target}
              medium={medium}
              requests={requests}
            />
          ))}
        </Flex>
      </PronunciationPreviewProvider>
    </EntryDialectContext.Provider>
  ) : null;
}
function SentencePicker({
  target,
  medium,
  ids,
  requests,
  onSelect,
  onClose
}: {
  target: string;
  medium: string;
  ids: string[];
  requests: LexiconNextRequests;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const actor = useAuthStore((s) => s.profile);
  const [keyword, setKeyword] = useState("");
  const [selection, setSelection] = useState({ keyword: "", page: 1 });
  const query = useQuery({
    queryKey: [
      "admin-lexicon-next",
      "sentence-list",
      actor?.id,
      target,
      medium,
      selection
    ],
    queryFn: () =>
      requests.sentences({
        target_language: "en",
        target_locale: target,
        medium_locale: medium,
        ...selection,
        page_size: 20
      }),
    retry: false
  });
  return (
    <Modal
      open
      title={`引用${localeLabels[target]}例句`}
      width={960}
      footer={null}
      onCancel={onClose}
    >
      <Flex vertical gap={16}>
        <Space.Compact block>
          <Input
            aria-label="搜索例句"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => setSelection({ keyword, page: 1 })}
          />
          <Button onClick={() => setSelection({ keyword, page: 1 })}>
            搜索
          </Button>
        </Space.Compact>
        {query.isError && (
          <Alert
            type="error"
            title={query.error.message}
            action={<Button onClick={() => void query.refetch()}>重试</Button>}
          />
        )}
        {!query.isError && (
          <AdminTable
            tableId="next-sentence-picker"
            showColumnSettings={false}
            rowKey="id"
            loading={query.isPending}
            dataSource={query.data?.items ?? []}
            columns={[
              {
                title: "例句",
                key: "content",
                render: (_, row) => (
                  <RichTextReadOnly className="tsz-words" value={row.content} />
                )
              },
              { title: "等级", dataIndex: "level" },
              { title: "引用数", dataIndex: "reference_count" },
              {
                title: "操作",
                key: "action",
                render: (_, row) => (
                  <Button
                    disabled={ids.includes(row.id)}
                    onClick={() => onSelect(row.id)}
                  >
                    {ids.includes(row.id) ? "已引用" : "引用"}
                  </Button>
                )
              }
            ]}
            pagination={{
              current: selection.page,
              pageSize: 20,
              total: query.data?.pagination.total ?? 0,
              onChange: (page) =>
                setSelection((current) => ({ ...current, page }))
            }}
          />
        )}
      </Flex>
    </Modal>
  );
}
export function SenseSentenceExamples({
  detailsAvailable = false,
  ids = [],
  target,
  medium,
  disabled,
  requests,
  onChange,
  registerLeaveGuard
}: {
  detailsAvailable?: boolean;
  ids?: string[];
  target: string;
  medium: string;
  disabled: boolean;
  requests: LexiconNextRequests;
  onChange: (ids: string[]) => void;
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
}) {
  const actor = useAuthStore((s) => s.profile);
  const canRead = usePermission("sentences.access");
  const canCreate = usePermission("sentences.create");
  const client = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState<{ source: NextSentence | null }>();
  const [picking, setPicking] = useState(false);
  const validTarget = target === "en-GB" || target === "en-US";
  return (
    <>
      <SenseSectionTitle
        label="多维例句"
        count={ids.length}
        unit="条"
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
      />
      {!collapsed && (
        <SenseSectionBody collapsed={false}>
          <Flex vertical gap={16}>
            <EntryDialectContext.Provider
              value={target === "en-GB" ? "en-GB" : "en-US"}
            >
              <PronunciationPreviewProvider>
                {ids.map((id) => (
                  <SentenceResource
                    key={id}
                    id={id}
                    target={target}
                    medium={medium}
                    requests={requests}
                    actions={(source) => (
                      <Space>
                        <Button
                          disabled={
                            disabled ||
                            !validTarget ||
                            !canAdminResourceAction(
                              actor,
                              "sentences",
                              "edit",
                              source.owner_id
                            )
                          }
                          onClick={() => setEditing({ source })}
                        >
                          编辑例句
                        </Button>
                        <Button
                          danger
                          icon={<Trash2 />}
                          disabled={disabled}
                          onClick={() =>
                            onChange(ids.filter((value) => value !== id))
                          }
                        >
                          移除引用
                        </Button>
                      </Space>
                    )}
                  />
                ))}
              </PronunciationPreviewProvider>
            </EntryDialectContext.Provider>
            {!canRead && <Alert type="warning" title="没有例句查看权限" />}
            <Space>
              <Button
                icon={<Plus />}
                disabled={disabled || !validTarget || !canCreate || !canRead}
                onClick={() => setEditing({ source: null })}
              >
                添加例句
              </Button>
              <Button
                disabled={disabled || !validTarget || !canRead}
                onClick={() => setPicking(true)}
              >
                引用已有例句
              </Button>
            </Space>
          </Flex>
        </SenseSectionBody>
      )}
      {editing && validTarget && (
        <NextSentenceEditor
          source={editing.source}
          detailsAvailable={detailsAvailable}
          target={target}
          medium={medium}
          requests={requests}
          registerLeaveGuard={registerLeaveGuard}
          onClose={() => setEditing(undefined)}
          onSaved={(source) => {
            client.setQueryData(sentenceKey(actor?.id, source.id), source);
            void client.invalidateQueries({
              queryKey: ["admin-lexicon-next", "sentence-list"]
            });
            if (!ids.includes(source.id)) onChange([...ids, source.id]);
            setEditing(undefined);
          }}
        />
      )}
      {picking && (
        <SentencePicker
          target={target}
          medium={medium}
          ids={ids}
          requests={requests}
          onSelect={(id) => {
            onChange([...ids, id]);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}
