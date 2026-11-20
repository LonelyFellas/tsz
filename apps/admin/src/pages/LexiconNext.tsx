import {
  SentenceDraftContext,
  SentenceDraftAudioTasks,
  useSentenceDrafts
} from "@/features/lexicon-next/sentenceDrafts";
import { partOfSpeechDataSource } from "@/features/dictionary/dataSource";
import { partOfSpeechKeys } from "@/features/dictionary/part-of-speech/api";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useBeforeUnload,
  useBlocker,
  useLocation,
  useNavigate,
  useSearchParams,
  useParams
} from "react-router-dom";
import { Alert, Button, Collapse, Space, Spin } from "@tsz/ui/admin/display";
import { Form, Input } from "@tsz/ui/admin/forms";
import { App, Modal } from "@tsz/ui/admin/overlays";
import { AdminControls } from "@tsz/ui/admin/context";
import { ContentEditPermissions } from "@/features/dictionary/contentEditPermissions";
import { FormsStep, emptyFormEditor } from "@/features/lexicon-next/FormsStep";
import {
  VoiceSaveContext,
  type VoiceSaveOptions
} from "@/features/dictionary/word-creation-v3/voiceSaveContext";
import { V3StepActions } from "@/features/dictionary/word-creation-v3/components/V3StepActions";
import { Save } from "lucide-react";
import { HttpError } from "@tsz/api-client";
import type {
  NextDraft,
  NextPublicationIssue,
  NextEntry,
  NextWorkspaceEntry,
  NextLanguageCapability,
  V3DraftValidationIssue,
  WordCreationStep
} from "@tsz/types";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import { ContentRows } from "@/features/lexicon-next/ContentRows";
import { DialectEditor } from "@/features/lexicon-next/DialectPairs";
import type { NextDialectSense } from "@tsz/types";
import { MeaningsStep } from "@/features/lexicon-next/MeaningsStep";
import { DraftSummary, Preview } from "@/features/lexicon-next/Preview";
import {
  draftProblem,
  generalSense,
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
import {
  publicationIssueLocation,
  focusPublicationIssue
} from "@/features/lexicon-next/publicationIssueFocus";
import { PublicationPanel } from "@/features/lexicon-next/PublicationPanel";
import {
  EntryStart,
  type LexiconNextCreationNavigationState
} from "@/features/lexicon-next/EntryStart";
import { seedRecommendedPartOfSpeech } from "@/features/lexicon-next/recommendedPosPrefill";
import { sanitizeFormsRichText } from "@/features/dictionary/word-creation-v3/operations";
import { v3IssueMessage } from "@/features/dictionary/word-creation-v3/presentationErrors";
import {
  clearNextLocalDraft,
  NEXT_LOCAL_DRAFT_SCHEMA_VERSION,
  readNextLocalDraft,
  type NextLocalDraftKey,
  type NextLocalDraftSnapshot,
  writeNextLocalDraft
} from "@/features/lexicon-next/localDraftStore";
import "./lexicon-next.css";

export type LexiconNextRequests = typeof api.lexiconNext;
const NEXT_DRAFT_SCHEMA_VERSION = NEXT_LOCAL_DRAFT_SCHEMA_VERSION;
function failure(error: unknown, preserveDraft = false) {
  if (preserveDraft && error instanceof HttpError && error.status === 422) {
    const issue = error.field_issues[0];
    return `草稿未保存，修改已保留。${
      issue ? v3IssueMessage(issue) : "请处理待填写项后重试。"
    }`;
  }
  return error instanceof Error ? error.message : "请求失败，请重试。";
}

function sanitizeNextDraft(draft: NextDraft) {
  if (!draft.form_editor) return { draft, repaired: false };
  const form_editor = sanitizeFormsRichText(draft.form_editor) as NonNullable<
    NextDraft["form_editor"]
  >;
  const repaired =
    JSON.stringify(form_editor) !== JSON.stringify(draft.form_editor);
  return {
    draft: repaired ? { ...draft, form_editor } : draft,
    repaired
  };
}
function editorStepFromSearch(
  search: string
): Exclude<WordCreationStep, "basics"> {
  const value = new URLSearchParams(search).get("step");
  return value === "meanings" || value === "preview" ? value : "forms";
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
              publishingAvailable={capability.data?.publishing === true}
              relationsAvailable={capability.data?.relations === true}
              formEditorAvailable={capability.data?.form_editor === true}
              senseGroupsAvailable={capability.data?.sense_groups === true}
              senseMetadataAvailable={capability.data?.sense_metadata === true}
              equivalentMetadataAvailable={
                capability.data?.equivalent_metadata === true
              }
              grammarAvailable={capability.data?.grammar_structures === true}
              grammarAudioAvailable={capability.data?.grammar_audio === true}
              grammarFormLinksAvailable={
                capability.data?.grammar_form_links === true
              }
              sentencesAvailable={capability.data?.sentences === true}
              sentenceAssociationsAvailable={
                capability.data?.sentence_associations === true
              }
              sentenceDraftsAvailable={
                capability.data?.sentence_drafts === true
              }
              sentenceDetailsAvailable={
                capability.data?.sentence_details === true
              }
              definitionDetailsAvailable={
                capability.data?.definition_details === true
              }
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
  senseGroupsAvailable,
  senseMetadataAvailable,
  equivalentMetadataAvailable,
  grammarAvailable,
  grammarAudioAvailable,
  grammarFormLinksAvailable,
  definitionDetailsAvailable,
  sentencesAvailable,
  sentenceAssociationsAvailable,
  sentenceDetailsAvailable,
  sentenceDraftsAvailable,
  relationsAvailable,
  publishingAvailable
}: {
  formEditorAvailable: boolean;
  senseGroupsAvailable: boolean;
  senseMetadataAvailable: boolean;
  equivalentMetadataAvailable: boolean;
  grammarAvailable: boolean;
  grammarAudioAvailable: boolean;
  grammarFormLinksAvailable: boolean;
  definitionDetailsAvailable: boolean;
  sentencesAvailable: boolean;
  sentenceAssociationsAvailable: boolean;
  sentenceDetailsAvailable: boolean;
  sentenceDraftsAvailable: boolean;
  relationsAvailable: boolean;
  publishingAvailable: boolean;
  id: string;
  requests: LexiconNextRequests;
  language: NextLanguageCapability;
}) {
  const { medium, search: languageSearch } = useLexiconLanguages();
  const location = useLocation();
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
  const draftSchema = useQuery({
    queryKey: ["admin-lexicon-next", "draft-schema"],
    queryFn: requests.draftSchema,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: 0
  });
  if (query.isPending || metadata.isPending || draftSchema.isPending)
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
  if (draftSchema.isError)
    return (
      <Alert
        type="error"
        showIcon
        title="无法确认草稿版本兼容性"
        description="为避免本地新增字段被服务器丢弃，当前服务暂不能安全编辑。请升级服务后重试。"
        action={
          <Button onClick={() => void draftSchema.refetch()}>重试</Button>
        }
      />
    );
  if (
    !draftSchema.data.supported_draft_schema_versions.includes(
      NEXT_DRAFT_SCHEMA_VERSION
    )
  )
    return (
      <Alert
        type="warning"
        showIcon
        title="当前服务不支持此草稿版本"
        description="为避免新增字段被服务器丢弃，当前词条暂不能编辑。请升级服务后再试。"
      />
    );
  if (query.data.target_language !== "en")
    return <Alert type="warning" title="当前编辑器尚未开放此目标语言" />;
  const preserveEditor = location.state?.lexiconMediumSwitch === true;
  const creationState =
    location.state as LexiconNextCreationNavigationState | null;
  if (query.data.medium_locale !== medium && !preserveEditor) {
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
      key={`${id}:${medium}`}
      initial={query.data}
      suggestedPartOfSpeech={creationState?.lexiconNextSuggestedPartOfSpeech}
      entryMedium={query.data.medium_locale ?? medium}
      requests={requests}
      language={language}
      archived={metadata.data.status === "archived"}
      publishingAvailable={publishingAvailable}
      relationsAvailable={relationsAvailable}
      formEditorAvailable={formEditorAvailable}
      senseGroupsAvailable={senseGroupsAvailable}
      senseMetadataAvailable={senseMetadataAvailable}
      equivalentMetadataAvailable={equivalentMetadataAvailable}
      grammarAvailable={grammarAvailable}
      grammarAudioAvailable={grammarAudioAvailable}
      grammarFormLinksAvailable={grammarFormLinksAvailable}
      definitionDetailsAvailable={definitionDetailsAvailable}
      sentenceDraftsAvailable={sentenceDraftsAvailable}
      sentenceDetailsAvailable={sentenceDetailsAvailable}
      sentencesAvailable={sentencesAvailable}
      sentenceAssociationsAvailable={sentenceAssociationsAvailable}
    />
  );
}
function EntryEditor({
  initial,
  suggestedPartOfSpeech,
  entryMedium,
  requests,
  language,
  archived,
  formEditorAvailable,
  senseGroupsAvailable,
  senseMetadataAvailable,
  equivalentMetadataAvailable,
  grammarAvailable,
  grammarAudioAvailable,
  grammarFormLinksAvailable,
  definitionDetailsAvailable,
  sentencesAvailable,
  sentenceAssociationsAvailable,
  sentenceDetailsAvailable,
  sentenceDraftsAvailable,
  relationsAvailable,
  publishingAvailable
}: {
  formEditorAvailable: boolean;
  senseGroupsAvailable: boolean;
  senseMetadataAvailable: boolean;
  equivalentMetadataAvailable: boolean;
  grammarAvailable: boolean;
  grammarAudioAvailable: boolean;
  grammarFormLinksAvailable: boolean;
  definitionDetailsAvailable: boolean;
  sentencesAvailable: boolean;
  sentenceAssociationsAvailable: boolean;
  sentenceDetailsAvailable: boolean;
  sentenceDraftsAvailable: boolean;
  relationsAvailable: boolean;
  publishingAvailable: boolean;
  archived: boolean;
  initial: NextEntry;
  suggestedPartOfSpeech?: readonly string[];
  entryMedium: string;
  requests: LexiconNextRequests;
  language: NextLanguageCapability;
}) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const grammarCatalog = useQuery({
    queryKey: partOfSpeechKeys.catalog(),
    queryFn: () => partOfSpeechDataSource.catalog(),
    enabled: grammarAvailable,
    staleTime: 5 * 60 * 1000
  });
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [params] = useSearchParams();
  const linked = params.get("sense");
  const linkedIssue = initial.draft.senses.some((s) => s.id === linked)
    ? publicationIssueLocation(
        initial.draft,
        { node_id: linked!, field: "dialect_pairs", message: "" },
        params.get("target_locale") ?? "en-GB"
      )
    : undefined;
  const publishedSense = params.get("published_sense");
  const requestedStep = editorStepFromSearch(routeLocation.search);
  const [issueFocus, setIssueFocus] = useState<
    ReturnType<typeof publicationIssueLocation> | undefined
  >(linkedIssue);
  const [step, setStep] = useState<WordCreationStep>(
    publishedSense ? "preview" : linkedIssue ? "meanings" : requestedStep
  );
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<NextDraft>(initial.draft);
  const [editedPairs, setEditedPairs] = useState<
    Record<string, NextDialectSense>
  >({});
  const dialectSenses = draft.senses.flatMap((s) => {
    const row =
      editedPairs[s.id] ??
      saved.dialect_senses?.find((v) => v.sense_id === s.id);
    return row ? [row] : [];
  });
  const pairChanges = dialectSenses
    .filter((row) => editedPairs[row.sense_id])
    .map((row) => {
      const peer = row.target;
      return {
        sense_id: row.sense_id,
        usage: row.usage,
        no_equivalent: row.no_equivalent,
        note: row.note,
        target: peer
          ? {
              entry_id: peer.entry_id,
              sense_id: peer.sense_id,
              revision: peer.revision
            }
          : null,
        previous_target_revision:
          saved.dialect_senses?.find((s) => s.sense_id === row.sense_id)?.target
            ?.revision ?? null
      };
    });
  const [selectedPos, setSelectedPos] = useState<string | undefined>(
    linkedIssue?.pos
  );
  const activePos = selectedPos ?? draft.form_editor?.pos[0]?.pos;
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
    medium: selectedMedium,
    search: languageSearch,
    setLocked,
    cancelLanguageChange
  } = useLexiconLanguages();
  const medium = entryMedium;
  const sentenceWorkspace = useSentenceDrafts(
    saved.sentence_resources ?? [],
    draft,
    medium
  );
  const [saving, setBusy] = useState(false);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const busy = saving || publicationBusy;
  const publication = useQuery({
    queryKey: ["admin-lexicon-next", "publication", saved.id],
    queryFn: () => requests.publication(saved.id),
    enabled: publishingAvailable,
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: false
  });
  const lock = useRef(false);
  const [error, setError] = useState<string>();
  const [richTextRepairNotice, setRichTextRepairNotice] = useState(false);
  const [formIssues, setFormIssues] = useState<V3DraftValidationIssue[]>([]);
  const [conflict, setConflict] = useState(false);
  const [peerConflict, setPeerConflict] = useState(false);
  const [remote, setRemote] = useState<NextEntry>();
  const profile = useAuthStore((state) => state.profile);
  const localDraftKey = useMemo<NextLocalDraftKey | undefined>(
    () =>
      profile?.id
        ? {
            account_id: profile.id,
            entry_id: initial.id,
            target_locale: target,
            medium_locale: medium
          }
        : undefined,
    [initial.id, medium, profile?.id, target]
  );
  const [localSnapshot, setLocalSnapshot] = useState<NextLocalDraftSnapshot>();
  const [localSnapshotKey, setLocalSnapshotKey] = useState<string>();
  const [localSnapshotLoadedKey, setLocalSnapshotLoadedKey] =
    useState<string>();
  const [localSnapshotChecked, setLocalSnapshotChecked] = useState(false);
  const localKeyIdentity = localDraftKey
    ? JSON.stringify(localDraftKey)
    : undefined;
  const currentLocalSnapshot =
    localSnapshot && localSnapshotKey === localKeyIdentity
      ? localSnapshot
      : undefined;
  const recommendedPosPrefilledRef = useRef(false);
  useEffect(() => {
    if (
      recommendedPosPrefilledRef.current ||
      !suggestedPartOfSpeech?.length ||
      !formEditorAvailable ||
      !grammarCatalog.data ||
      !localSnapshotChecked ||
      currentLocalSnapshot
    )
      return;
    const emptyNewDraft =
      initial.revision === 1 &&
      !initial.draft.form_editor?.pos.length &&
      initial.draft.forms.length === 0 &&
      initial.draft.senses.length === 0;
    recommendedPosPrefilledRef.current = true;
    if (!emptyNewDraft) return;
    const seeded = seedRecommendedPartOfSpeech(
      draft,
      initial.kind,
      suggestedPartOfSpeech,
      grammarCatalog.data
    );
    if (seeded === draft) return;
    setDraft(seeded);
    setSelectedPos(seeded.form_editor?.pos[0]?.pos);
    const state = (routeLocation.state ?? {}) as Record<string, unknown>;
    const restState = { ...state };
    delete restState.lexiconNextSuggestedPartOfSpeech;
    navigate(`${routeLocation.pathname}${routeLocation.search}`, {
      replace: true,
      state: Object.keys(restState).length > 0 ? restState : null
    });
  }, [
    currentLocalSnapshot,
    draft,
    formEditorAvailable,
    grammarCatalog.data,
    initial.draft.form_editor?.pos.length,
    initial.draft.forms.length,
    initial.draft.senses.length,
    initial.kind,
    initial.revision,
    localSnapshotChecked,
    navigate,
    routeLocation.pathname,
    routeLocation.search,
    routeLocation.state,
    suggestedPartOfSpeech
  ]);
  const canPublish = usePermission("words.publish");
  const canEdit = usePermission("words.edit");
  const editOthers = usePermission("words.edit_others");
  const writable =
    !archived && canEdit && (saved.owner_id === profile?.id || editOthers);
  const disabled = busy || !writable || !!currentLocalSnapshot;
  const dirty =
    pairChanges.length > 0 ||
    JSON.stringify(draft) !== JSON.stringify(saved.draft) ||
    (sentenceDraftsAvailable && sentenceWorkspace.dirty);
  useEffect(() => {
    let active = true;
    setLocalSnapshot(undefined);
    setLocalSnapshotKey(undefined);
    setLocalSnapshotLoadedKey(undefined);
    setLocalSnapshotChecked(false);
    if (!localDraftKey) return;
    void readNextLocalDraft(localDraftKey)
      .then((snapshot) => {
        if (
          active &&
          snapshot?.draft_schema_version === NEXT_DRAFT_SCHEMA_VERSION
        ) {
          setLocalSnapshot(snapshot);
          setLocalSnapshotKey(localKeyIdentity);
        }
        if (active) {
          setLocalSnapshotLoadedKey(localKeyIdentity);
          setLocalSnapshotChecked(true);
        }
      })
      .catch(() => {
        if (active) setLocalSnapshotChecked(true);
      });
    return () => {
      active = false;
    };
  }, [localDraftKey, localKeyIdentity]);
  useEffect(() => {
    if (
      !localDraftKey ||
      !localSnapshotChecked ||
      localSnapshotLoadedKey !== localKeyIdentity ||
      !dirty ||
      conflict ||
      currentLocalSnapshot
    )
      return;
    const timer = window.setTimeout(() => {
      const snapshot: NextLocalDraftSnapshot = {
        snapshot_version: 1,
        account_id: localDraftKey.account_id,
        entry_id: localDraftKey.entry_id,
        target_locale: localDraftKey.target_locale,
        medium_locale: localDraftKey.medium_locale,
        base_revision: saved.revision,
        draft_schema_version: NEXT_DRAFT_SCHEMA_VERSION,
        draft: draftRef.current,
        edited_pairs: editedPairs,
        sentence_resources: Object.values(sentenceWorkspace.resources),
        updated_at: new Date().toISOString()
      };
      void writeNextLocalDraft(localDraftKey, snapshot).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    dirty,
    conflict,
    editedPairs,
    localDraftKey,
    localSnapshotChecked,
    localSnapshotLoadedKey,
    localKeyIdentity,
    currentLocalSnapshot,
    saved.revision,
    sentenceWorkspace.resources
  ]);
  function restoreLocalSnapshot(snapshot: NextLocalDraftSnapshot) {
    setDraft(snapshot.draft);
    setEditedPairs(snapshot.edited_pairs);
    for (const resource of snapshot.sentence_resources) {
      const base = sentenceWorkspace.base.find(
        (item) => item.id === resource.id
      );
      if (base) {
        for (const variant of resource.draft.variants)
          sentenceWorkspace.update(base, variant);
      } else {
        sentenceWorkspace.importResource(resource);
      }
    }
    setLocalSnapshot(undefined);
    setLocalSnapshotKey(undefined);
    if (snapshot.base_revision !== saved.revision) {
      setConflict(true);
      setError(
        `本地草稿基于版本 ${snapshot.base_revision}，服务器当前为版本 ${saved.revision}，请先比较版本。`
      );
    } else {
      setError(undefined);
    }
  }
  function discardLocalSnapshot() {
    setLocalSnapshot(undefined);
    setLocalSnapshotKey(undefined);
    if (localDraftKey)
      void clearNextLocalDraft(localDraftKey).catch(() => undefined);
  }
  useEffect(() => {
    if (!dirty && !conflict) setError(undefined);
  }, [dirty, conflict]);
  useEffect(() => {
    if (
      !localDraftKey ||
      !localSnapshotChecked ||
      localSnapshotLoadedKey !== localKeyIdentity ||
      dirty ||
      conflict ||
      currentLocalSnapshot
    )
      return;
    void clearNextLocalDraft(localDraftKey).catch(() => undefined);
  }, [
    conflict,
    currentLocalSnapshot,
    dirty,
    localDraftKey,
    localSnapshotChecked,
    localSnapshotLoadedKey,
    localKeyIdentity
  ]);
  useEffect(() => {
    setLocked(busy || formContentOpen);
    return () => setLocked(false);
  }, [busy, formContentOpen, setLocked]);
  const leaveState = useRef({
    busy,
    formContentOpen,
    dirty,
    medium: selectedMedium
  });
  useLayoutEffect(() => {
    leaveState.current = {
      busy,
      formContentOpen,
      dirty,
      medium: selectedMedium
    };
  }, [busy, formContentOpen, dirty, selectedMedium]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const current = leaveState.current;
    const requestedMedium = new URLSearchParams(nextLocation.search).get(
      "medium_locale"
    );
    const nextMedium = language.medium_locales.includes(requestedMedium ?? "")
      ? requestedMedium
      : undefined;
    return (
      current.busy ||
      current.formContentOpen ||
      (current.dirty &&
        (currentLocation.pathname !== nextLocation.pathname ||
          nextMedium !== current.medium))
    );
  });
  useBeforeUnload((event) => {
    if (dirty || busy || formContentOpen) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  async function run(
    operation: () => Promise<void>,
    options: { preserveDraft?: boolean } = {}
  ) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    setFormIssues([]);
    try {
      await operation();
      setPeerConflict(false);
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
      } else if (
        error instanceof HttpError &&
        error.status === 409 &&
        error.problem?.field === "dialect_changes"
      ) {
        setPeerConflict(true);
        setError(
          "对方词义已变化。可重新选择，或只重载方言配对；其他草稿编辑会保留。"
        );
      } else if (error instanceof HttpError && error.status === 409) {
        setConflict(true);
        setError("服务器版本已更新。本地草稿已保留，请先比较版本。");
      } else if (error instanceof HttpError && error.status === 403) {
        setError("没有保存权限。本地草稿已保留，请联系管理员核实权限。");
      } else {
        setError(failure(error, options.preserveDraft));
      }
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save(options?: VoiceSaveOptions) {
    if (
      !writable ||
      conflict ||
      currentLocalSnapshot ||
      (contentLeaveGuard.current &&
        !options?.allowContentSave &&
        !options?.skipAudioTasks)
    )
      return false;
    return run(
      async () => {
        const validation =
          draftProblem(draftRef.current, equivalentMetadataAvailable) ||
          (sentenceDraftsAvailable && sentenceWorkspace.validate());
        if (validation) {
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLElement>(
                '.next-sentence-inline-card [aria-invalid="true"]'
              )
              ?.focus()
          );
          throw new Error(validation);
        }
        if (!options?.skipAudioTasks) {
          for (const wait of [...audioTasks.current.values()]) {
            if (!(await wait()))
              throw new Error("发音处理尚未完成，请重试保存。");
          }
        }
        const current = draftRef.current;
        const sanitized = sanitizeNextDraft(current);
        if (sanitized.repaired) {
          draftRef.current = sanitized.draft;
          setDraft(sanitized.draft);
          setRichTextRepairNotice(true);
        }
        const problem = draftProblem(
          sanitized.draft,
          equivalentMetadataAvailable
        );
        if (problem) throw new Error(problem);
        const changes = sentenceDraftsAvailable
          ? await sentenceWorkspace.prepare()
          : [];
        const result = await requests.save(saved.id, {
          expected_revision: saved.revision,
          ...(pairChanges.length ? { dialect_changes: pairChanges } : {}),
          draft: sanitized.draft,
          ...(changes.length ? { sentence_changes: changes } : {})
        });
        setEditedPairs({});
        setSaved(result);
        setDraft(result.draft);
        sentenceWorkspace.reset();
        setConflict(false);
        setRemote(undefined);
        if (localDraftKey)
          void clearNextLocalDraft(localDraftKey).catch(() => undefined);
        void Promise.all(
          ["list", "stats", "creators"].map((key) =>
            queryClient.invalidateQueries({
              queryKey: ["admin-lexicon-next", key]
            })
          )
        );
        void queryClient.invalidateQueries({
          queryKey: ["admin-lexicon-next", "publication", saved.id]
        });
        void message.success("草稿已保存");
      },
      { preserveDraft: true }
    );
  }
  function changeStep(next: WordCreationStep) {
    const nextStep = next === "basics" ? "forms" : next;
    if (
      nextStep === "forms" &&
      !draft.form_editor?.pos.some((pos) => pos.pos === selectedPos)
    ) {
      setSelectedPos(draft.form_editor?.pos[0]?.pos);
    }
    setStep(nextStep);
    const query = new URLSearchParams(routeLocation.search);
    query.set("step", nextStep);
    navigate(`${routeLocation.pathname}?${query}`, {
      replace: true,
      state: routeLocation.state
    });
  }
  function locateIssue(issue: NextPublicationIssue) {
    const issueLocation = publicationIssueLocation(draft, issue, target);
    const nextStep =
      issueLocation.step === "basics" ? "forms" : issueLocation.step;
    setStep(nextStep);
    setSelectedPos(issueLocation.pos);
    setIssueFocus(issueLocation);
    const query = new URLSearchParams(routeLocation.search);
    query.set("step", nextStep);
    if (issueLocation.locale !== target)
      query.set("target_locale", issueLocation.locale);
    navigate(`?${query}`, {
      replace: true,
      state: routeLocation.state
    });
  }
  useEffect(() => {
    if (!issueFocus || step !== issueFocus.step || target !== issueFocus.locale)
      return;
    const controller = new AbortController();
    focusPublicationIssue(issueFocus, controller.signal, () =>
      setIssueFocus(undefined)
    );
    return () => controller.abort();
  }, [issueFocus, step, target]);
  const editor = (
    <EntryLayout
      relationsAvailable={relationsAvailable}
      publicationStatus={publication.data?.status}
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
                changeStep(next);
              })();
            }
      }
    >
      <div
        data-testid="lexicon-next-editor"
        className={`lexicon-next lexicon-next-editor${step !== "preview" ? " lexicon-next-forms" : ""}`}
      >
        <div className="lexicon-next-toolbar">
          {dirty && (
            <Space wrap>
              <span role="status">有未保存修改</span>
            </Space>
          )}
          <Space wrap>
            <Button
              type={publishingAvailable ? "default" : "primary"}
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
        {entryMedium !== selectedMedium && (
          <Alert
            type="info"
            title={`当前词条归属${localeLabels[entryMedium] ?? entryMedium}，仍按该媒介语编辑和保存。`}
          />
        )}
        {(error || conflict) && (
          <Alert
            type="error"
            showIcon
            title={error ?? "服务器版本已更新。本地草稿已保留，请先比较版本。"}
            action={
              peerConflict && !conflict ? (
                <Button
                  disabled={busy || formContentOpen}
                  onClick={() =>
                    void run(async () => {
                      const current = await requests.get(saved.id);
                      if (current.revision !== saved.revision) {
                        setConflict(true);
                        return;
                      }
                      setSaved(current);
                      setEditedPairs({});
                      await queryClient.invalidateQueries({
                        queryKey: ["admin-lexicon-next", "pair-candidate"]
                      });
                    })
                  }
                >
                  只重载方言配对
                </Button>
              ) : (
                conflict && (
                  <Button
                    disabled={busy || formContentOpen}
                    onClick={() =>
                      void run(async () => {
                        const [remote, state, metadata] = await Promise.all([
                          requests.get(saved.id),
                          publishingAvailable
                            ? publication.refetch()
                            : undefined,
                          publishingAvailable
                            ? requests.workspaceEntry(saved.id)
                            : undefined
                        ]);
                        if (state?.error) throw state.error;
                        if (metadata) {
                          queryClient.setQueryData(
                            ["admin-lexicon-next", "workspace-entry", saved.id],
                            metadata
                          );
                        }
                        setRemote(remote);
                      })
                    }
                  >
                    比较服务器版本
                  </Button>
                )
              )
            }
          />
        )}
        {richTextRepairNotice && (
          <Alert
            type="warning"
            showIcon
            closable
            onClose={() => setRichTextRepairNotice(false)}
            title="已清理历史失配标注，正文和录音已保留。"
          />
        )}
        {currentLocalSnapshot && (
          <Alert
            type="warning"
            showIcon
            title={
              currentLocalSnapshot.base_revision === saved.revision
                ? "发现未提交的本地草稿"
                : `发现基于版本 ${currentLocalSnapshot.base_revision} 的本地草稿`
            }
            description="本地草稿保存在当前浏览器中，请选择是否恢复。"
            action={
              <Space>
                <Button
                  onClick={() => restoreLocalSnapshot(currentLocalSnapshot)}
                  disabled={busy || formContentOpen}
                >
                  恢复本地草稿
                </Button>
                <Button
                  danger
                  onClick={discardLocalSnapshot}
                  disabled={busy || formContentOpen}
                >
                  放弃本地草稿
                </Button>
              </Space>
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
                value={{
                  save: (_area, options) => save(options),
                  failure: error,
                  audioTasks: audioTasks.current
                }}
              >
                <ContentEditPermissions.Provider
                  value={{ edit: writable, associate: false }}
                >
                  <AdminControls componentDisabled={disabled}>
                    <FormsStep
                      selectedPos={activePos}
                      onSelectedPosChange={setSelectedPos}
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
                    busy ? "正在保存草稿" : dirty ? "有未保存修改" : undefined
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
                    onClick={() => changeStep("meanings")}
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
                          disabled={disabled || !draft.form_editor?.pos.length}
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
            renderDialect={
              saved.dialect_senses === undefined
                ? undefined
                : (id) => {
                    const baseline =
                      saved.dialect_senses?.find((s) => s.sense_id === id) ??
                      generalSense(id);
                    return (
                      <DialectEditor
                        row={editedPairs[id] ?? baseline}
                        draft={draft}
                        localTargets={dialectSenses
                          .filter((s) => s.sense_id !== id && s.target)
                          .map((s) => s.target!.sense_id)}
                        entryId={saved.id}
                        requests={requests}
                        medium={medium}
                        disabled={disabled}
                        onChange={(row) =>
                          setEditedPairs((current) => {
                            const next = { ...current };
                            if (
                              JSON.stringify(row) === JSON.stringify(baseline)
                            )
                              delete next[id];
                            else next[id] = row;
                            return next;
                          })
                        }
                      />
                    );
                  }
            }
            focusIssue={issueFocus}
            entryId={saved.id}
            relationsAvailable={relationsAvailable}
            selectedPos={activePos}
            onSelectedPosChange={setSelectedPos}
            value={draft}
            requests={requests}
            registerLeaveGuard={registerContentLeaveGuard}
            kind={saved.kind}
            formEditorAvailable={formEditorAvailable}
            target={target}
            medium={medium}
            partOfSpeechCodes={language.part_of_speech_codes}
            senseGroupsAvailable={senseGroupsAvailable}
            senseMetadataAvailable={senseMetadataAvailable}
            meaningLabels
            equivalentMetadataAvailable={equivalentMetadataAvailable}
            grammarAvailable={grammarAvailable}
            grammarAudioAvailable={grammarAudioAvailable}
            grammarFormLinksAvailable={grammarFormLinksAvailable}
            definitionDetailsAvailable={definitionDetailsAvailable}
            sentenceDetailsAvailable={sentenceDetailsAvailable}
            sentencesAvailable={sentencesAvailable}
            sentenceAssociationsAvailable={sentenceAssociationsAvailable}
            disabled={disabled}
            onChange={setDraft}
          />
          {step === "meanings" && (
            <V3StepActions
              status={
                busy ? "正在保存草稿" : dirty ? "有未保存修改" : undefined
              }
            >
              <Button
                type="text"
                disabled={busy}
                onClick={() => changeStep("forms")}
              >
                上一步
              </Button>
              <Button
                loading={busy}
                disabled={!writable || !dirty || conflict || formContentOpen}
                onClick={() => void save()}
              >
                保存完整草稿
              </Button>
              <Button
                type="primary"
                disabled={busy}
                onClick={() => changeStep("preview")}
              >
                下一步：预览
              </Button>
            </V3StepActions>
          )}
        </div>
        <div hidden={step !== "preview"} inert={step !== "preview"}>
          {publishingAvailable ? (
            <PublicationPanel
              entryId={saved.id}
              revision={saved.revision}
              state={publication.data}
              loading={publication.isPending}
              stateError={publication.error}
              dirty={dirty}
              disabled={busy || conflict || archived || formContentOpen}
              canPublish={
                canPublish &&
                (profile?.role === "super_admin" ||
                  saved.owner_id === profile?.id)
              }
              requests={requests}
              onBusyChange={setPublicationBusy}
              onRefresh={publication.refetch}
              onLocateIssue={locateIssue}
              onConflict={() => setConflict(true)}
              onPublished={async (result) => {
                const refreshed = await publication.refetch();
                if (refreshed.error) throw refreshed.error;
                if (!refreshed.data)
                  throw new Error("无法读取发布状态，请重试。");
                queryClient.setQueryData<NextWorkspaceEntry>(
                  ["admin-lexicon-next", "workspace-entry", saved.id],
                  (current) =>
                    current
                      ? {
                          ...current,
                          status: refreshed.data!.status,
                          lifecycle_revision: refreshed.data!.lifecycle_revision
                        }
                      : current
                );
                await Promise.all(
                  ["list", "stats"].map((key) =>
                    queryClient.invalidateQueries({
                      queryKey: ["admin-lexicon-next", key]
                    })
                  )
                );
                if (
                  refreshed.data.current?.id === result.id &&
                  refreshed.data.status === "published"
                ) {
                  void message.success("词条已发布");
                } else {
                  void message.info("发布请求已完成，词条当前状态已变化。");
                }
              }}
            />
          ) : (
            <Alert
              type="info"
              title="当前服务尚未开放新版发布，请更新服务后重试。"
            />
          )}
          {publication.data?.current && (
            <Collapse
              defaultActiveKey={publishedSense ? ["published"] : undefined}
              items={[
                {
                  key: "published",
                  label: "已发布版本",
                  children: (
                    <Preview
                      requests={requests}
                      sentenceDetailsAvailable={sentenceDetailsAvailable}
                      dialectSenses={publication.data.dialect_senses}
                      dialectDraft={publication.data.current.snapshot.draft}
                      published
                      focusSense={publishedSense}
                      relationTargets={
                        publication.data.current.snapshot.relation_targets
                      }
                      sentenceResources={Object.fromEntries(
                        publication.data.current.snapshot.sentence_resources.map(
                          (sentence) => [sentence.id, sentence]
                        )
                      )}
                      view={previewDraft(
                        publication.data.current.snapshot.draft,
                        target,
                        medium,
                        grammarCatalog.data
                      )}
                    />
                  )
                }
              ]}
            />
          )}
          <h2>草稿预览</h2>
          <Preview
            requests={requests}
            sentenceDetailsAvailable={sentenceDetailsAvailable}
            sentenceResources={
              sentenceDraftsAvailable
                ? sentenceWorkspace.previewResources
                : undefined
            }
            dialectSenses={dialectSenses}
            dialectDraft={draft}
            view={previewDraft(draft, target, medium, grammarCatalog.data)}
          />
        </div>
        {step !== "forms" && (
          <Collapse
            className="lexicon-next-draft-preview"
            items={[
              {
                key: "preview",
                label: "当前草稿预览（含未保存修改）",
                children: (
                  <Preview
                    requests={requests}
                    sentenceDetailsAvailable={sentenceDetailsAvailable}
                    sentenceResources={
                      sentenceDraftsAvailable
                        ? sentenceWorkspace.previewResources
                        : undefined
                    }
                    dialectSenses={dialectSenses}
                    dialectDraft={draft}
                    view={previewDraft(
                      draft,
                      target,
                      medium,
                      grammarCatalog.data
                    )}
                  />
                )
              }
            ]}
          />
        )}
        <Modal
          open={!!remote}
          title="比较草稿"
          width={960}
          onCancel={() => setRemote(undefined)}
          footer={
            <Space>
              <Button
                type="primary"
                disabled={busy || formContentOpen}
                onClick={() => {
                  if (!remote || contentLeaveGuard.current) return;
                  modal.confirm({
                    title: "保留本地草稿并覆盖服务器版本？",
                    content: `确认后，本地草稿会以服务器版本 ${remote.revision} 为保存基线，下一次保存将覆盖服务器草稿。`,
                    okText: "保留本地并继续",
                    cancelText: "取消",
                    onOk: () => {
                      if (!remote || contentLeaveGuard.current) return;
                      setSaved(remote);
                      setRemote(undefined);
                      setConflict(false);
                      setError(undefined);
                    }
                  });
                }}
              >
                保留本地草稿并继续保存
              </Button>
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
                        setEditedPairs({});
                        setSaved(remote);
                        setDraft(remote.draft);
                        sentenceWorkspace.reset();
                        setRemote(undefined);
                        setConflict(false);
                        setError(undefined);
                        if (localDraftKey)
                          void clearNextLocalDraft(localDraftKey).catch(
                            () => undefined
                          );
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
                <DraftSummary
                  dialectSenses={dialectSenses}
                  draft={draft}
                  sentenceResources={
                    sentenceDraftsAvailable
                      ? sentenceWorkspace.resources
                      : undefined
                  }
                  requests={requests}
                  target={target}
                  medium={medium}
                />
              </section>
              <section>
                <h3>服务器 · 版本 {remote.revision}</h3>
                <DraftSummary
                  dialectSenses={remote.dialect_senses}
                  draft={remote.draft}
                  sentenceResources={
                    remote.sentence_resources
                      ? Object.fromEntries(
                          remote.sentence_resources.map((v) => [v.id, v])
                        )
                      : undefined
                  }
                  requests={requests}
                  target={target}
                  medium={medium}
                />
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
  return (
    <SentenceDraftContext.Provider
      value={sentenceDraftsAvailable ? sentenceWorkspace : null}
    >
      {sentenceDraftsAvailable && (
        <SentenceDraftAudioTasks workspace={sentenceWorkspace} />
      )}
      {editor}
    </SentenceDraftContext.Provider>
  );
}
