import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useBeforeUnload,
  useBlocker,
  useNavigate,
  useParams
} from "react-router-dom";
import {
  Alert,
  Button,
  Collapse,
  Space,
  Spin,
  Tag
} from "@tsz/ui/admin/display";
import { Form, Input } from "@tsz/ui/admin/forms";
import { App, Modal } from "@tsz/ui/admin/overlays";
import { AdminControls } from "@tsz/ui/admin/context";
import { ContentEditPermissions } from "@/features/dictionary/contentEditPermissions";
import { FormsStep, emptyFormEditor } from "@/features/lexicon-next/FormsStep";
import { VoiceSaveContext } from "@/features/dictionary/word-creation-v3/voiceSaveContext";
import { V3StepActions } from "@/features/dictionary/word-creation-v3/components/V3StepActions";
import { Save } from "lucide-react";
import { HttpError } from "@tsz/api-client";
import type {
  NextDraft,
  NextEntry,
  NextEntryView,
  NextWorkspaceEntry,
  NextLanguageCapability,
  V3DraftValidationIssue,
  WordCreationStep
} from "@tsz/types";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import { ContentRows } from "@/features/lexicon-next/ContentRows";
import { MeaningsStep } from "@/features/lexicon-next/MeaningsStep";
import { DraftSummary, Preview } from "@/features/lexicon-next/Preview";
import {
  draftProblem,
  localeLabels,
  previewDraft,
  replaceFormEditor
} from "@/features/lexicon-next/model";
import {
  LexiconLanguages,
  useLexiconLanguages
} from "@/features/lexicon-next/LanguageSelection";
import { EntryList } from "@/features/lexicon-next/EntryList";
import { EntryLayout } from "@/features/lexicon-next/EntryLayout";
import { EntryStart } from "@/features/lexicon-next/EntryStart";
import "./lexicon-next.css";

export type LexiconNextRequests = typeof api.lexiconNext;
function failure(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请重试。";
}

export function LexiconNextPage({
  requests = api.lexiconNext
}: { requests?: LexiconNextRequests } = {}) {
  return (
    <App>
      <LexiconNextWorkspace requests={requests} />
    </App>
  );
}
function LexiconNextWorkspace({ requests }: { requests: LexiconNextRequests }) {
  const { entryId } = useParams();
  const capability = useQuery({
    queryKey: ["admin-lexicon-next", "capabilities"],
    queryFn: requests.capabilities,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false
  });
  const language = capability.data?.languages.find(
    (item) => item.target_language === "en"
  );
  const supported =
    capability.data?.manual_drafts &&
    capability.data.medium_ownership === true &&
    language &&
    ["en-GB", "en-US"].every((locale) =>
      language.target_locales.includes(locale)
    ) &&
    ["zh-Hans", "zh-Hant"].every((locale) =>
      language.medium_locales.includes(locale)
    );
  return (
    <div className="lexicon-next-workspace">
      {capability.isPending ? (
        <Spin aria-label="正在读取智能词库能力" />
      ) : !supported ? (
        <Alert
          type="warning"
          showIcon
          title="智能词库手工编辑暂不可用"
          description={
            capability.error
              ? failure(capability.error)
              : "当前服务尚未开放按媒介语言归属的英语草稿。"
          }
          action={
            <Button onClick={() => void capability.refetch()}>重新检查</Button>
          }
        />
      ) : (
        <LexiconLanguages language={language}>
          {entryId === "trash" ? (
            <EntryList
              key="trash"
              requests={requests}
              trashMode
              partOfSpeechCodes={language.part_of_speech_codes}
            />
          ) : entryId === "new" ? (
            <EntryStart requests={requests} />
          ) : entryId ? (
            <EntryLoader
              key={entryId}
              id={entryId}
              requests={requests}
              language={language}
              formEditorAvailable={capability.data?.form_editor === true}
              senseGroupsAvailable={capability.data?.sense_groups === true}
            />
          ) : (
            <EntryList
              key="library"
              requests={requests}
              partOfSpeechCodes={language.part_of_speech_codes}
            />
          )}
        </LexiconLanguages>
      )}
    </div>
  );
}
function EntryLoader({
  id,
  requests,
  language,
  formEditorAvailable,
  senseGroupsAvailable
}: {
  formEditorAvailable: boolean;
  senseGroupsAvailable: boolean;
  id: string;
  requests: LexiconNextRequests;
  language: NextLanguageCapability;
}) {
  const { medium, search: languageSearch } = useLexiconLanguages();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["admin-lexicon-next", "entry", id],
    queryFn: () => requests.get(id),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnReconnect: false
  });
  const metadata = useQuery({
    queryKey: ["admin-lexicon-next", "workspace-entry", id],
    queryFn: () => requests.workspaceEntry(id),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: 0
  });
  if (query.isPending || metadata.isPending)
    return <Spin aria-label="正在打开词条" />;
  if (metadata.isError)
    return (
      <Alert
        type="error"
        title="无法读取词条状态"
        description={failure(metadata.error)}
        action={<Button onClick={() => void metadata.refetch()}>重试</Button>}
      />
    );
  if (query.error)
    return (
      <Alert
        type="error"
        showIcon
        title="无法打开智能词库词条"
        description={failure(query.error)}
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      />
    );
  if (query.data.target_language !== "en")
    return <Alert type="warning" title="当前编辑器尚未开放此目标语言" />;
  if (query.data.medium_locale !== medium) {
    const selection = new URLSearchParams(languageSearch);
    if (query.data.medium_locale)
      selection.set("medium_locale", query.data.medium_locale);
    return (
      <Alert
        type="warning"
        title="该词条不属于当前媒介语言"
        action={
          query.data.medium_locale && (
            <Button
              onClick={() => navigate(`/lexicon-next/${id}?${selection}`)}
            >
              进入词条所属语言
            </Button>
          )
        }
      />
    );
  }
  return (
    <EntryEditor
      initial={query.data}
      requests={requests}
      language={language}
      archived={metadata.data.status === "archived"}
      formEditorAvailable={formEditorAvailable}
      senseGroupsAvailable={senseGroupsAvailable}
    />
  );
}
function EntryEditor({
  initial,
  requests,
  language,
  archived,
  formEditorAvailable,
  senseGroupsAvailable
}: {
  formEditorAvailable: boolean;
  senseGroupsAvailable: boolean;
  archived: boolean;
  initial: NextEntry;
  requests: LexiconNextRequests;
  language: NextLanguageCapability;
}) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WordCreationStep>("forms");
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<NextDraft>(initial.draft);
  const draftRef = useRef(draft);
  useLayoutEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const [formContentOpen, setFormContentOpen] = useState(false);
  const contentLeaveGuard = useRef<(() => Promise<boolean>) | undefined>(
    undefined
  );
  const audioTasks = useRef(new Map<string, () => Promise<boolean>>());
  const [emptyEditor] = useState(emptyFormEditor);
  const registerContentLeaveGuard = useCallback(
    (guard?: () => Promise<boolean>) => {
      contentLeaveGuard.current = guard;
      setFormContentOpen(!!guard);
    },
    []
  );
  const {
    target,
    medium,
    search: languageSearch,
    setLocked,
    cancelLanguageChange
  } = useLexiconLanguages();
  const [saving, setBusy] = useState(false);
  const busy = saving;
  const lock = useRef(false);
  const [error, setError] = useState<string>();
  const [formIssues, setFormIssues] = useState<V3DraftValidationIssue[]>([]);
  const [conflict, setConflict] = useState(false);
  const [remote, setRemote] = useState<NextEntry>();
  const [view, setView] = useState<NextEntryView>();
  const profile = useAuthStore((state) => state.profile);
  const canEdit = usePermission("words.edit");
  const editOthers = usePermission("words.edit_others");
  const writable =
    !archived && canEdit && (saved.owner_id === profile?.id || editOthers);
  const disabled = busy || !writable;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.draft);
  useEffect(() => {
    setLocked(busy || formContentOpen);
    return () => setLocked(false);
  }, [busy, formContentOpen, setLocked]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const requestedMedium = new URLSearchParams(nextLocation.search).get(
      "medium_locale"
    );
    const nextMedium = language.medium_locales.includes(requestedMedium ?? "")
      ? requestedMedium
      : undefined;
    return (
      busy ||
      formContentOpen ||
      (dirty &&
        (currentLocation.pathname !== nextLocation.pathname ||
          nextMedium !== medium))
    );
  });
  useBeforeUnload((event) => {
    if (dirty || busy || formContentOpen) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  async function run(operation: () => Promise<void>) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    setFormIssues([]);
    try {
      await operation();
      return true;
    } catch (error) {
      if (error instanceof HttpError) setFormIssues(error.field_issues);
      if (
        error instanceof HttpError &&
        error.status === 409 &&
        error.code === "entry_archived"
      ) {
        queryClient.setQueryData<NextWorkspaceEntry>(
          ["admin-lexicon-next", "workspace-entry", saved.id],
          (current) => (current ? { ...current, status: "archived" } : current)
        );
        setConflict(false);
        setError(
          "词条已被归档。本地草稿已保留；请先在垃圾桶恢复词条，再重新打开编辑。"
        );
        await Promise.all(
          ["list", "stats"].map((key) =>
            queryClient.invalidateQueries({
              queryKey: ["admin-lexicon-next", key],
              refetchType: "all"
            })
          )
        );
      } else if (error instanceof HttpError && error.status === 409) {
        setConflict(true);
        setError("服务器版本已更新。本地草稿已保留，请先比较版本。");
      } else if (error instanceof HttpError && error.status === 403) {
        setError("没有保存权限。本地草稿已保留，请联系管理员核实权限。");
      } else {
        setError(failure(error));
      }
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (!writable || conflict) return false;
    return run(async () => {
      for (const wait of [...audioTasks.current.values()]) {
        if (!(await wait())) throw new Error("发音处理尚未完成，请重试保存。");
      }
      const current = draftRef.current;
      const problem = draftProblem(current);
      if (problem) throw new Error(problem);
      const result = await requests.save(saved.id, {
        expected_revision: saved.revision,
        draft: current
      });
      setSaved(result);
      setDraft(result.draft);
      setConflict(false);
      setRemote(undefined);
      void Promise.all(
        ["list", "stats", "creators"].map((key) =>
          queryClient.invalidateQueries({
            queryKey: ["admin-lexicon-next", key]
          })
        )
      );
      void message.success("草稿已保存");
    });
  }
  // A successful save updates only this editor; background refetches never hydrate local edits.
  useEffect(() => {
    setView(undefined);
  }, [target, medium]);
  return (
    <EntryLayout
      draft={draft}
      languageSearch={languageSearch}
      step={step}
      onStepChange={
        busy
          ? undefined
          : (next) => {
              void (async () => {
                if (
                  contentLeaveGuard.current &&
                  !(await contentLeaveGuard.current())
                )
                  return;
                setStep(next);
              })();
            }
      }
    >
      <div
        className={`lexicon-next lexicon-next-editor${step !== "preview" ? " lexicon-next-forms" : ""}`}
      >
        <div className="lexicon-next-toolbar">
          <Space wrap>
            <Tag>{saved.kind === "word" ? "单词" : "短语"} · 英语</Tag>
            <span>版本 {saved.revision}</span>
            <span role="status">{dirty ? "有未保存修改" : "已保存"}</span>
          </Space>
          <Space wrap>
            <Button
              hidden={step === "forms"}
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  setView(
                    await requests.view(saved.id, {
                      target_locale: target,
                      medium_locale: medium
                    })
                  )
                )
              }
            >
              查看已保存预览
            </Button>
            <Button
              type="primary"
              icon={<Save aria-hidden="true" />}
              hidden={step !== "preview"}
              loading={busy}
              disabled={!writable || !dirty || conflict || formContentOpen}
              onClick={() => void save()}
            >
              保存完整草稿
            </Button>
          </Space>
        </div>
        {!writable && (
          <Alert
            type="info"
            title="此词条只读：需要编辑权限，编辑他人词条还需相应授权。"
          />
        )}
        {(error || conflict) && (
          <Alert
            type="error"
            showIcon
            title={error ?? "服务器版本已更新。本地草稿已保留，请先比较版本。"}
            action={
              conflict && (
                <Button
                  disabled={busy || formContentOpen}
                  onClick={() =>
                    void run(async () =>
                      setRemote(await requests.get(saved.id))
                    )
                  }
                >
                  比较服务器版本
                </Button>
              )
            }
          />
        )}
        <Form
          hidden={step !== "preview"}
          inert={step !== "preview"}
          layout="vertical"
          className="lexicon-next-basics"
        >
          <Form.Item label="词头">
            <Input
              aria-label="词头"
              className="tsz-words"
              value={draft.headword}
              disabled={disabled}
              onChange={(e) => setDraft({ ...draft, headword: e.target.value })}
            />
          </Form.Item>
        </Form>
        <div hidden={step !== "forms"} inert={step !== "forms"}>
          {formEditorAvailable ? (
            <>
              <VoiceSaveContext.Provider
                value={{ save, failure: error, audioTasks: audioTasks.current }}
              >
                <ContentEditPermissions.Provider
                  value={{ edit: writable, associate: false }}
                >
                  <AdminControls componentDisabled={disabled}>
                    <FormsStep
                      value={draft.form_editor ?? emptyEditor}
                      saved={saved.draft.form_editor}
                      kind={saved.kind}
                      locale={target === "en-US" ? "en-US" : "en-GB"}
                      issues={formIssues}
                      onChange={(form_editor) =>
                        setDraft((current) =>
                          replaceFormEditor(current, form_editor)
                        )
                      }
                      registerLeaveGuard={registerContentLeaveGuard}
                    />
                  </AdminControls>
                </ContentEditPermissions.Provider>
              </VoiceSaveContext.Provider>
              {step === "forms" && (
                <V3StepActions
                  status={
                    busy
                      ? "正在保存草稿"
                      : dirty
                        ? "有未保存修改"
                        : `草稿版本 ${saved.revision}`
                  }
                >
                  <Button
                    loading={busy}
                    disabled={
                      !writable || !dirty || conflict || formContentOpen
                    }
                    onClick={() => void save()}
                  >
                    保存草稿
                  </Button>
                  <Button
                    type="primary"
                    disabled={busy || formContentOpen}
                    onClick={() => setStep("meanings")}
                  >
                    下一步：词义与译词
                  </Button>
                </V3StepActions>
              )}
            </>
          ) : (
            <Alert
              type="warning"
              title="当前服务尚未支持词性与发音编辑，请更新服务后重试。"
            />
          )}
          {draft.forms.length > 0 && (
            <Collapse
              items={[
                {
                  key: "legacy-forms",
                  label: "已有词形",
                  children: (
                    <>
                      {["en", "en-GB", "en-US"].map((locale) => (
                        <ContentRows
                          key={locale}
                          rows={draft.forms}
                          textClassName="tsz-words"
                          locale={locale}
                          label={`${localeLabels[locale]}词形`}
                          disabled={disabled}
                          onChange={(forms) =>
                            setDraft((current) => ({ ...current, forms }))
                          }
                        />
                      ))}
                    </>
                  )
                }
              ]}
            />
          )}
        </div>
        <div hidden={step !== "meanings"} inert={step !== "meanings"}>
          <MeaningsStep
            value={draft}
            kind={saved.kind}
            formEditorAvailable={formEditorAvailable}
            target={target}
            medium={medium}
            partOfSpeechCodes={language.part_of_speech_codes}
            senseGroupsAvailable={senseGroupsAvailable}
            disabled={disabled}
            onChange={setDraft}
          />
          {step === "meanings" && (
            <V3StepActions
              status={
                busy
                  ? "正在保存草稿"
                  : dirty
                    ? "有未保存修改"
                    : `草稿版本 ${saved.revision}`
              }
            >
              <Button
                type="text"
                disabled={busy}
                onClick={() => setStep("forms")}
              >
                上一步
              </Button>
              <Button
                loading={busy}
                disabled={!writable || !dirty || conflict}
                onClick={() => void save()}
              >
                保存完整草稿
              </Button>
              <Button
                type="primary"
                disabled={busy}
                onClick={() => setStep("preview")}
              >
                下一步：预览
              </Button>
            </V3StepActions>
          )}
        </div>
        <div hidden={step !== "preview"} inert={step !== "preview"}>
          <h2>预览</h2>
          <Preview view={previewDraft(draft, target, medium)} />
        </div>
        {step !== "forms" && (
          <Collapse
            items={[
              {
                key: "preview",
                label: "当前草稿预览（含未保存修改）",
                children: <Preview view={previewDraft(draft, target, medium)} />
              }
            ]}
          />
        )}
        <Modal
          open={!!view}
          title={`已保存预览 · 版本 ${view?.revision ?? ""}`}
          footer={null}
          onCancel={() => setView(undefined)}
        >
          {view && <Preview view={view} />}
        </Modal>
        <Modal
          open={!!remote}
          title="比较草稿"
          width={960}
          onCancel={() => setRemote(undefined)}
          footer={
            <Space>
              <Button onClick={() => setRemote(undefined)}>保留本地草稿</Button>
              <Button
                danger
                disabled={busy || formContentOpen}
                onClick={() =>
                  modal.confirm({
                    title: "放弃本地修改并重载？",
                    content: "本地未保存内容将被服务器版本替换。",
                    okText: "放弃并重载",
                    cancelText: "取消",
                    onOk: () => {
                      if (remote && !contentLeaveGuard.current) {
                        setSaved(remote);
                        setDraft(remote.draft);
                        setRemote(undefined);
                        setConflict(false);
                        setError(undefined);
                      }
                    }
                  })
                }
              >
                放弃本地修改并重载
              </Button>
            </Space>
          }
        >
          {remote && (
            <div className="lexicon-next-columns">
              <section>
                <h3>本地草稿 · 基于版本 {saved.revision}</h3>
                <DraftSummary draft={draft} />
              </section>
              <section>
                <h3>服务器 · 版本 {remote.revision}</h3>
                <DraftSummary draft={remote.draft} />
              </section>
            </div>
          )}
        </Modal>
        <Modal
          open={blocker.state === "blocked"}
          title={busy ? "请求尚未完成" : "有未保存修改"}
          closable={false}
          footer={
            <Space>
              <Button
                onClick={() => {
                  if (blocker.state === "blocked") {
                    blocker.reset();
                    cancelLanguageChange();
                  }
                }}
              >
                继续编辑
              </Button>
              <Button
                danger
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    if (
                      contentLeaveGuard.current &&
                      !(await contentLeaveGuard.current())
                    )
                      return;
                    if (blocker.state === "blocked") blocker.proceed();
                  })();
                }}
              >
                放弃修改并离开
              </Button>
            </Space>
          }
        >
          离开此页会丢失未保存的草稿。
        </Modal>
      </div>
    </EntryLayout>
  );
}
