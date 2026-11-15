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
import { NextSentenceEditor, sentenceStyles } from "./NextSentenceEditor";
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
          {variant.translations
            .filter((v) => v.locale === medium && v.content.text.trim())
            .map((row) => (
              <Space key={row.id}>
                <Tag>{sentenceStyles[row.style]}</Tag>
                <RichTextReadOnly value={row.content} />
              </Space>
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
  ids,
  target,
  medium,
  requests
}: {
  ids?: string[];
  target: string;
  medium: string;
  requests: LexiconNextRequests;
}) {
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
  ids = [],
  target,
  medium,
  disabled,
  requests,
  onChange,
  registerLeaveGuard
}: {
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
  const [opening, setOpening] = useState<string>();
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
                            opening !== undefined ||
                            !validTarget ||
                            !canAdminResourceAction(
                              actor,
                              "sentences",
                              "edit",
                              source.owner_id
                            )
                          }
                          loading={opening === source.id}
                          onClick={async () => {
                            setOpening(source.id);
                            try {
                              const fresh = await client.fetchQuery({
                                queryKey: sentenceKey(actor?.id, source.id),
                                queryFn: () => requests.sentence(source.id),
                                staleTime: 0,
                                retry: false
                              });
                              setEditing({ source: fresh });
                            } catch {
                              // The active resource query displays the read error and retry action.
                            } finally {
                              setOpening(undefined);
                            }
                          }}
                        >
                          编辑例句
                        </Button>
                        <Button
                          danger
                          icon={<Trash2 />}
                          disabled={disabled || opening !== undefined}
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
                disabled={
                  disabled ||
                  opening !== undefined ||
                  !validTarget ||
                  !canCreate ||
                  !canRead
                }
                onClick={() => setEditing({ source: null })}
              >
                添加例句
              </Button>
              <Button
                disabled={
                  disabled || opening !== undefined || !validTarget || !canRead
                }
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
