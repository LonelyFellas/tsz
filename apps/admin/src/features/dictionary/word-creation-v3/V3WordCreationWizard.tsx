import { UNSAFE_DataRouterContext } from "react-router-dom";
import { WordNavigationGuard } from "@/features/recovery/WordNavigationGuard";
import { useDraftRecovery } from "@/features/recovery/useDraftRecovery";
import type {
  AdminWordV3,
  PartOfSpeechCatalogResponse,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  DraftValidationResponseV3,
  FormsImpactResponseV3,
  RetiredStableNodeV3,
  StepSaveIntent,
  SurfaceMatchPageV3,
  V3DraftValidationIssue,
  WordCreationStep
} from "@tsz/types";
import type { ReactNode } from "react";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { newWordNodeId } from "../word-model/primitives";
import {
  createStableVariantIdFactory,
  fillFormTypeTemplate,
  type V3StableVariantIdFactory
} from "./operations";
import type { V3WordRequests } from "./api";
import {
  navigateToV3Issue,
  navigateToV3Target,
  type V3IssueNavigationAdapter,
  type V3IssueNavigationTarget,
  scrollV3TargetIntoView
} from "./issueNavigation";
import {
  dropEmptySentenceTranslations,
  formGroupBindingPatches,
  syncFormGroupBindings,
  ensureV3MeaningsForForms,
  fillDefaultSenseGroups,
  prepareTextLinksForSave,
  stripBlankRelations,
  stripSenseComponentUsages,
  toWritableMeanings
} from "./meaningsModel";
import { classifyV3Problem, type V3Problem } from "./problem";
import {
  createV3SaveFlow,
  v3ContentFingerprint,
  type V3ConfirmationContext,
  type V3RequestCommand,
  type V3SaveFlow
} from "./saveFlow";
import { resolveV3StepAccess } from "./stepAccess";
import {
  V3WordCreationLayout,
  type V3ConflictComparison
} from "./V3WordCreationLayout";

type ExternalNavigationAdapter = Partial<
  Omit<V3IssueNavigationAdapter, "activateStep" | "activatePos">
>;

export interface V3WizardActions {
  saveForms(
    intent: StepSaveIntent,
    confirmationContext?: Omit<
      V3ConfirmationContext,
      "base_revision" | "impact_content"
    >
  ): Promise<void>;
  previewFormsImpact(): Promise<FormsImpactResponseV3 | undefined>;
  previewFormsSaveImpact(): Promise<FormsImpactResponseV3 | undefined>;
  saveMeanings(
    content: DraftMeaningsStepContentWritableV3,
    intent: StepSaveIntent
  ): Promise<void>;
  validate(): Promise<DraftValidationResponseV3 | undefined>;
  publish(confirmedSurfaceToken?: string): Promise<void>;
  confirmImpact(): boolean;
  confirmImpactSurface(page: SurfaceMatchPageV3): boolean;
  fetchSurfacePage(
    snapshotId: string,
    cursor: string,
    signal: AbortSignal
  ): Promise<SurfaceMatchPageV3>;
  retry(): Promise<void>;
  refreshConflict(): Promise<void>;
  navigateIssue(issue: V3DraftValidationIssue): Promise<void>;
  /** 引用跳转与深链定位：同 navigateIssue 的容器展开与聚焦，但目标不来自校验问题。 */
  navigateTarget(target: V3IssueNavigationTarget): Promise<void>;
}

export interface V3WizardSlotContext {
  requestSentenceLeave?: () => Promise<boolean>;
  registerSentenceLeaveGuard?: (guard?: () => Promise<boolean>) => void;
  word: AdminWordV3;
  partOfSpeechCatalog?: PartOfSpeechCatalogResponse;
  partOfSpeechCatalogError: boolean;
  partOfSpeechCatalogPending: boolean;
  readOnly: boolean;
  draftForms: DraftFormsStepContentV3;
  setDraftForms: (content: DraftFormsStepContentV3) => void;
  stableVariantIds: V3StableVariantIdFactory;
  draftMeanings: DraftMeaningsStepContentWritableV3;
  setDraftMeanings: (content: DraftMeaningsStepContentWritableV3) => void;
  dirtySteps: Readonly<{ forms: boolean; meanings: boolean }>;
  hasUnsavedChanges: boolean;
  activeStep: WordCreationStep;
  setActiveStep: (step: WordCreationStep) => void;
  activePosId?: string;
  setActivePosId: (posId: string) => void;
  issues: readonly V3DraftValidationIssue[];
  validation?: DraftValidationResponseV3;
  impact?: FormsImpactResponseV3;
  impactConfirmed: boolean;
  impactSurfacePage?: SurfaceMatchPageV3;
  publishSurfacePage?: SurfaceMatchPageV3;
  problem?: V3Problem;
  isPending: (command: V3RequestCommand | "refresh_conflict") => boolean;
  actions: V3WizardActions;
}

export interface V3WordCreationWizardProps {
  /** 刚从创建页进来：把新草稿的语义区间录入位摆够默认条数，只铺一次。 */
  prefillNewDraft?: boolean;
  partOfSpeechCatalog?: PartOfSpeechCatalogResponse;
  partOfSpeechCatalogError?: boolean;
  partOfSpeechCatalogPending?: boolean;
  initialWord: AdminWordV3;
  sharedSentenceCount?: number;
  requests: V3WordRequests;
  initialStep?: WordCreationStep;
  readOnly?: boolean;
  allowPublishedEditing?: boolean;
  renderStep: (context: V3WizardSlotContext) => ReactNode;
  navigationAdapter?: ExternalNavigationAdapter;
  idempotencyKeyFactory?: () => string;
  onWordChange?: (word: AdminWordV3) => void;
  retiredStableNodes?: readonly RetiredStableNodeV3[];
}

function defaultIdempotencyKey() {
  return newWordNodeId();
}

function initializedMeanings(
  word: AdminWordV3,
  forms: DraftFormsStepContentV3 = word.forms
) {
  const canonical = toWritableMeanings(word.meanings);
  const draft = ensureV3MeaningsForForms(
    word.id,
    forms,
    canonical,
    newWordNodeId
  );
  return { draft };
}

interface PublishAttempt {
  idempotencyKey: string;
  baseRevision: number;
  confirmedSurfaceToken?: string;
}

async function focusRenderedTarget(target: V3IssueNavigationTarget) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const nodes = [
      ...document.querySelectorAll<HTMLElement>("[data-v3-node-id]")
    ];
    const groupCards = [
      ...document.querySelectorAll<HTMLElement>("[data-group-id]")
    ];
    const targetNodeIds = new Set([
      target.node_id,
      ...(target.ancestor_node_ids ?? []),
      target.form_group_id,
      target.form_id,
      target.membership_id
    ]);
    const collapsedToggles = new Set<HTMLElement>();
    for (const node of [...nodes, ...groupCards]) {
      if (!targetNodeIds.has(node.dataset.v3NodeId ?? node.dataset.groupId)) {
        continue;
      }
      const toggles = node.querySelectorAll<HTMLElement>(
        '[role="button"].ant-collapse-header[aria-expanded="false"], [role="button"].word-sense-section-title[aria-expanded="false"], button[aria-expanded="false"][aria-label^="展开"]'
      );
      for (const toggle of toggles) {
        // 手风琴下只能打开目标词义；展开同词性的兄弟卡片会反过来收起目标。
        const sense = toggle.matches(".ant-collapse-header")
          ? toggle.closest<HTMLElement>('[data-v3-field="sense"]')
          : undefined;
        if (sense && !targetNodeIds.has(sense.dataset.v3NodeId)) continue;
        collapsedToggles.add(toggle);
      }
    }
    for (const toggle of collapsedToggles) toggle.click();
    const membershipScope = target.membership_id
      ? nodes.find(
          (candidate) => candidate.dataset.v3NodeId === target.membership_id
        )
      : undefined;
    const groupScope = target.form_group_id
      ? (nodes.find(
          (candidate) => candidate.dataset.v3NodeId === target.form_group_id
        ) ??
        groupCards.find(
          (candidate) => candidate.dataset.groupId === target.form_group_id
        ))
      : undefined;
    const scope = membershipScope ?? groupScope;
    const candidates = scope
      ? [scope, ...scope.querySelectorAll<HTMLElement>("[data-v3-node-id]")]
      : nodes;
    const matchesVisibleTarget = (candidate: HTMLElement) => {
      const nodeMatches =
        candidate.dataset.v3NodeId === target.node_id ||
        candidate.dataset.v3NodeAliases
          ?.split(/\s+/u)
          .includes(target.node_id) === true;
      return (
        nodeMatches &&
        candidate.dataset.v3Field ===
          (target.field === "text_links" ? "value" : target.field) &&
        !candidate.closest(
          '.ant-tabs-tabpane-hidden, .ant-collapse-content-hidden, [aria-hidden="true"], [inert]'
        )
      );
    };
    const scopedElement = scope
      ? [...candidates].find(matchesVisibleTarget)
      : undefined;
    const globalMatches = nodes.filter(matchesVisibleTarget);
    const uniqueGlobalFallback =
      globalMatches.length === 1 && collapsedToggles.size === 0
        ? globalMatches[0]
        : undefined;
    const element = scopedElement ?? uniqueGlobalFallback;
    if (element) {
      scrollV3TargetIntoView(element);
      element.focus();
      if (document.activeElement === element) return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function V3WordCreationSession({
  initialWord,
  sharedSentenceCount,
  prefillNewDraft = false,
  partOfSpeechCatalog,
  partOfSpeechCatalogError = false,
  partOfSpeechCatalogPending = false,
  requests,
  initialStep = "forms",
  readOnly = false,
  allowPublishedEditing = false,
  renderStep,
  navigationAdapter,
  idempotencyKeyFactory = defaultIdempotencyKey,
  onWordChange,
  retiredStableNodes = []
}: V3WordCreationWizardProps) {
  const stableVariantIdsRef = useRef<V3StableVariantIdFactory | undefined>(
    undefined
  );
  if (!stableVariantIdsRef.current) {
    stableVariantIdsRef.current = createStableVariantIdFactory(
      initialWord.forms,
      retiredStableNodes
    );
  } else {
    stableVariantIdsRef.current.seed(initialWord.forms, retiredStableNodes);
  }
  const flowRef = useRef<V3SaveFlow>(createV3SaveFlow(initialWord));
  const flowRestoreRef = useRef<AdminWordV3 | undefined>(undefined);
  const mountedRef = useRef(true);
  const scopeRef = useRef(0);
  const pendingTokens = useRef(new Map<string, symbol>());
  const retryRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const publishAttemptRef = useRef<PublishAttempt | undefined>(undefined);
  const publishReconciliationRequiredRef = useRef(false);
  const publishReconciliationLockRef = useRef(false);
  const archivedReconciliationRequiredRef = useRef(false);
  const archivedReconciliationLockRef = useRef(false);
  const initialMeaningsRef = useRef<
    ReturnType<typeof initializedMeanings> | undefined
  >(undefined);
  if (!initialMeaningsRef.current) {
    initialMeaningsRef.current = initializedMeanings(initialWord);
  }
  const cleanMeaningsRef = useRef(initialMeaningsRef.current.draft);
  const dirtyRef = useRef({
    forms: false,
    meanings: false
  });
  const [word, setWord] = useState(initialWord);
  const [draftForms, setDraftFormsState] = useState(initialWord.forms);
  const [draftMeanings, setDraftMeaningsState] = useState(
    initialMeaningsRef.current.draft
  );
  const [dirtySteps, setDirtySteps] = useState({
    forms: false,
    meanings: false
  });
  const [activeStep, setActiveStepState] = useState(initialStep);
  const routerContext = useContext(UNSAFE_DataRouterContext);
  const [hasSentenceGuard, setHasSentenceGuard] = useState(false);
  const sentenceLeaveGuard = useRef<(() => Promise<boolean>) | undefined>(
    undefined
  );
  const registerSentenceLeaveGuard = useCallback(
    (guard?: () => Promise<boolean>) => {
      sentenceLeaveGuard.current = guard;
      setHasSentenceGuard(!!guard);
    },
    []
  );
  const sentenceLeaveRequest = useRef<Promise<boolean> | undefined>(undefined);
  const requestSentenceLeave = useCallback(() => {
    if (sentenceLeaveRequest.current) return sentenceLeaveRequest.current;
    const request = sentenceLeaveGuard.current?.() ?? Promise.resolve(true);
    sentenceLeaveRequest.current = request;
    void request.finally(() => {
      sentenceLeaveRequest.current = undefined;
    });
    return request;
  }, []);
  const [activePosId, setActivePosIdState] = useState(
    initialWord.forms.pos[0]?.pos_id
  );
  const [publicationIssues, setPublicationIssues] = useState<
    V3DraftValidationIssue[]
  >([]);
  const [validation, setValidation] = useState<DraftValidationResponseV3>();
  const [impact, setImpact] = useState<FormsImpactResponseV3>();
  const [impactConfirmed, setImpactConfirmed] = useState(false);
  const [problem, setProblem] = useState<V3Problem>();
  const [conflict, setConflict] = useState<V3ConflictComparison>();
  // 本地有未保存输入时收到的更新服务端版本。录入者决定保留还是放弃本地修改之前，保存
  // 基线停在旧版本、写请求一律不发，免得带着旧内容宣称基于新版本覆盖别处的改动。
  const [remoteUpdate, setRemoteUpdateState] = useState<AdminWordV3>();
  const remoteUpdateRef = useRef<AdminWordV3 | undefined>(undefined);
  const [remoteUpdateNotice, setRemoteUpdateNotice] = useState(0);
  // 本会话自己保存写出的最高 revision（响应被新输入取代也算）：刷新拉到的版本不超过它，
  // 就是自己的写入而不是别处的改动。
  const ownRevisionRef = useRef(0);
  // 在途的保存请求数，不随 supersede 清零；在途时拉到的新版本先暂存，保存结束后再判定，
  // 免得把自己即将写出的版本误报成冲突。
  const savesInFlightRef = useRef(0);
  const deferredNewerRef = useRef<AdminWordV3 | undefined>(undefined);
  // 异步回调里换基线要用当前草稿，不能用创建回调时闭包里的旧值。
  const draftFormsRef = useRef(draftForms);
  draftFormsRef.current = draftForms;
  const draftMeaningsRef = useRef(draftMeanings);
  draftMeaningsRef.current = draftMeanings;
  const [pending, setPending] = useState<Set<string>>(new Set());
  const sessionReadOnly =
    readOnly ||
    word.status === "archived" ||
    (word.status === "published" && !allowPublishedEditing);
  const [pendingFocusTarget, setPendingFocusTarget] =
    useState<V3IssueNavigationTarget>();

  useEffect(() => {
    mountedRef.current = true;
    const tokens = pendingTokens.current;
    const restore = flowRestoreRef.current;
    if (restore) {
      flowRef.current = createV3SaveFlow(restore);
      flowRestoreRef.current = undefined;
    }
    return () => {
      mountedRef.current = false;
      scopeRef.current += 1;
      tokens.clear();
      flowRestoreRef.current = flowRef.current.canonical();
      flowRef.current.dispose();
    };
  }, []);

  useEffect(() => {
    if (!pendingFocusTarget) return;
    void focusRenderedTarget(pendingFocusTarget);
  }, [pendingFocusTarget]);

  const markPending = useCallback((command: string) => {
    const token = Symbol(command);
    pendingTokens.current.set(command, token);
    setPending((current) => new Set(current).add(command));
    return () => {
      if (pendingTokens.current.get(command) !== token) return;
      pendingTokens.current.delete(command);
      if (!mountedRef.current) return;
      setPending((current) => {
        const next = new Set(current);
        next.delete(command);
        return next;
      });
    };
  }, []);

  const supersede = useCallback(() => {
    scopeRef.current += 1;
    flowRef.current.supersede();
    pendingTokens.current.clear();
    if (mountedRef.current) setPending(new Set());
  }, []);

  const clearPreviewState = useCallback(() => {
    setValidation(undefined);
    setImpact(undefined);
    setImpactConfirmed(false);
  }, []);

  const updateDirty = useCallback(
    (step: "forms" | "meanings", dirty: boolean) => {
      dirtyRef.current = { ...dirtyRef.current, [step]: dirty };
      setDirtySteps((current) =>
        current[step] === dirty ? current : { ...current, [step]: dirty }
      );
    },
    []
  );

  const clearDirty = useCallback(
    (replacement: "forms" | "meanings" | "all") => {
      const next = {
        forms:
          replacement === "forms" || replacement === "all"
            ? false
            : dirtyRef.current.forms,
        meanings:
          replacement === "meanings" || replacement === "all"
            ? false
            : dirtyRef.current.meanings
      };
      dirtyRef.current = next;
      setDirtySteps(next);
    },
    []
  );

  const hasLiveDirtyDraft = () =>
    dirtyRef.current.forms || dirtyRef.current.meanings;

  const setRemoteUpdate = useCallback((next?: AdminWordV3) => {
    remoteUpdateRef.current = next;
    setRemoteUpdateState(next);
  }, []);

  /** 服务端新版本待决时拦下写请求，并把录入者的注意力引回冲突提示。 */
  const blockedByRemoteUpdate = () => {
    if (!remoteUpdateRef.current) return false;
    setRemoteUpdateNotice((current) => current + 1);
    return true;
  };

  const resetReconciliationState = () => {
    publishAttemptRef.current = undefined;
    publishReconciliationRequiredRef.current = false;
    publishReconciliationLockRef.current = false;
    archivedReconciliationRequiredRef.current = false;
    archivedReconciliationLockRef.current = false;
    retryRef.current = undefined;
  };

  const noteOwnRevision = (saved: AdminWordV3) => {
    if (saved.id !== flowRef.current.canonical().id) return;
    ownRevisionRef.current = Math.max(ownRevisionRef.current, saved.revision);
  };

  const newDraftPrefilledRef = useRef(false);

  const setDraftForms = useCallback(
    (content: DraftFormsStepContentV3) => {
      supersede();
      setDraftFormsState(content);
      const nextMeanings = ensureV3MeaningsForForms(
        word.id,
        content,
        draftMeanings,
        newWordNodeId
      );
      const nextCleanMeanings = ensureV3MeaningsForForms(
        word.id,
        content,
        cleanMeaningsRef.current,
        newWordNodeId,
        nextMeanings
      );
      cleanMeaningsRef.current = nextCleanMeanings;
      if (nextMeanings !== draftMeanings) {
        setDraftMeaningsState(nextMeanings);
      }
      updateDirty(
        "meanings",
        v3ContentFingerprint(nextMeanings) !==
          v3ContentFingerprint(nextCleanMeanings)
      );
      updateDirty(
        "forms",
        JSON.stringify(content) !==
          JSON.stringify(flowRef.current.canonical().forms)
      );
      if (!publishReconciliationRequiredRef.current) setProblem(undefined);
      setConflict(undefined);
      clearPreviewState();
    },
    [clearPreviewState, draftMeanings, supersede, updateDirty, word.id]
  );

  const setDraftMeanings = useCallback(
    (content: DraftMeaningsStepContentWritableV3) => {
      supersede();
      setDraftMeaningsState(content);
      updateDirty(
        "meanings",
        v3ContentFingerprint(content) !==
          v3ContentFingerprint(cleanMeaningsRef.current)
      );
      if (!publishReconciliationRequiredRef.current) setProblem(undefined);
      setConflict(undefined);
      clearPreviewState();
    },
    [clearPreviewState, supersede, updateDirty]
  );

  // 刚从创建页进来的草稿：词典给几条词形就只有几条、语义区间也只有零星几个。这里
  // 一次把录入位铺齐——词形按该词性的配置铺出「新建模板」，语义区间摆够默认条数。铺完就是
  // 普通草稿数据：录入者删掉哪行就是哪行，再进草稿不会补回来。目录是异步到的，等它
  // 来了铺一次即可；走两个 setter 是为了让联动与脏标记跟着走，保存后才入库。
  // 语义区间基于「词形补齐后的 meanings」再补：setDraftForms 内部会用旧值重算一遍，
  // 这里用同样的输入算好再覆盖，免得把词性联动出来的词义冲掉。两次 ensure 拿到的新
  // 节点 ID 必须一致才不会留下假脏标记——眼下 fillFormTypeTemplate 既不增删词性也不
  // 改变化组的英美规则，ensure 必定原样返回入参，这条前提变了就得改成只算一次。
  //
  // 「刚创建」的判据跟着草稿本身走：revision 还是 1、两个步骤都没保存过。只看
  // location.state 不行——F5 后 history 会把它原样恢复，一刷新就把删掉的行铺回来。
  useEffect(() => {
    if (!prefillNewDraft || sessionReadOnly || newDraftPrefilledRef.current) {
      return;
    }
    if (
      word.revision > 1 ||
      word.completed_steps.includes("forms") ||
      word.completed_steps.includes("meanings")
    ) {
      return;
    }
    const items = partOfSpeechCatalog?.items;
    if (!items?.length) return;
    newDraftPrefilledRef.current = true;
    const filledForms = fillFormTypeTemplate(draftForms, items, newWordNodeId);
    const baseMeanings =
      filledForms === draftForms
        ? draftMeanings
        : ensureV3MeaningsForForms(
            word.id,
            filledForms,
            draftMeanings,
            newWordNodeId
          );
    const filledMeanings = fillDefaultSenseGroups(baseMeanings, newWordNodeId);
    if (filledForms !== draftForms) setDraftForms(filledForms);
    if (filledMeanings !== draftMeanings) setDraftMeanings(filledMeanings);
  }, [
    draftForms,
    draftMeanings,
    partOfSpeechCatalog,
    prefillNewDraft,
    sessionReadOnly,
    setDraftForms,
    setDraftMeanings,
    word
  ]);

  const setActiveStep = useCallback(
    (step: WordCreationStep) => {
      if (sessionReadOnly) return;
      const effective = resolveV3StepAccess(
        flowRef.current.canonical(),
        step,
        allowPublishedEditing
      ).effective;
      if (effective === activeStep) return;
      const leave = () => {
        supersede();
        setActiveStepState(effective);
      };
      if (sentenceLeaveGuard.current)
        void sentenceLeaveGuard.current().then((accepted) => {
          if (accepted) leave();
        });
      else leave();
    },
    [activeStep, allowPublishedEditing, sessionReadOnly, supersede]
  );

  const setActivePosId = useCallback(
    (posId: string) => {
      if (posId === activePosId) return;
      supersede();
      setActivePosIdState(posId);
    },
    [activePosId, supersede]
  );

  const navigateTarget = useCallback(
    async (target: V3IssueNavigationTarget) => {
      await navigateToV3Target(target, {
        activateStep: (next) => setActiveStep(next.step),
        activatePos: (next) => {
          if (next.pos_id) setActivePosId(next.pos_id);
        },
        expandGroup: navigationAdapter?.expandGroup,
        revealForm: navigationAdapter?.revealForm,
        revealVariant: navigationAdapter?.revealVariant,
        revealPronunciation: navigationAdapter?.revealPronunciation,
        focusField: (next) => {
          if (navigationAdapter?.focusField) {
            return navigationAdapter.focusField(next);
          }
          setPendingFocusTarget(next);
        }
      });
    },
    [navigationAdapter, setActivePosId, setActiveStep]
  );

  const navigateIssue = useCallback(
    async (issue: V3DraftValidationIssue) => {
      await navigateToV3Issue(issue, {
        activateStep: (target) => setActiveStep(target.step),
        activatePos: (target) => {
          if (target.pos_id) setActivePosId(target.pos_id);
        },
        expandGroup: navigationAdapter?.expandGroup,
        revealForm: navigationAdapter?.revealForm,
        revealVariant: navigationAdapter?.revealVariant,
        revealPronunciation: navigationAdapter?.revealPronunciation,
        focusField: (target) => {
          if (navigationAdapter?.focusField) {
            return navigationAdapter.focusField(target);
          }
          setPendingFocusTarget(target);
        }
      });
    },
    [navigationAdapter, setActivePosId, setActiveStep]
  );

  // 用一份更新的服务端版本整体替换会话。keepDirtyDrafts 时只同步没有未保存输入的步骤，
  // 否则连同本地输入一起丢弃。
  const replaceSession = useCallback(
    (latest: AdminWordV3, keepDirtyDrafts: boolean) => {
      supersede();
      flowRef.current.dispose();
      flowRef.current = createV3SaveFlow(latest);
      resetReconciliationState();
      setWord(latest);
      if (!keepDirtyDrafts || !dirtyRef.current.forms) {
        setDraftFormsState(latest.forms);
        setActivePosIdState((current) =>
          current && latest.forms.pos.some((pos) => pos.pos_id === current)
            ? current
            : latest.forms.pos[0]?.pos_id
        );
        updateDirty("forms", false);
      }
      if (!keepDirtyDrafts || !dirtyRef.current.meanings) {
        const nextMeanings = initializedMeanings(latest);
        cleanMeaningsRef.current = nextMeanings.draft;
        setDraftMeaningsState(nextMeanings.draft);
        updateDirty("meanings", false);
      }
      setRemoteUpdate(undefined);
      if ((deferredNewerRef.current?.revision ?? 0) <= latest.revision) {
        deferredNewerRef.current = undefined;
      }
      setPublicationIssues([]);
      setProblem(undefined);
      setConflict(undefined);
      clearPreviewState();
    },
    [clearPreviewState, setRemoteUpdate, supersede, updateDirty]
  );

  // 以服务端版本为保存基线，同时保留本地输入：「刷新并比较」「保留本地修改」与识别出的
  // 自己的写入共用。
  const rebaseKeepingLocalDrafts = useCallback(
    (
      latest: AdminWordV3,
      localForms: DraftFormsStepContentV3,
      localMeanings: DraftMeaningsStepContentWritableV3
    ) => {
      // 对方可能增删了词性：本地词义先按要保留的词形对齐。
      const alignedMeanings = ensureV3MeaningsForForms(
        latest.id,
        localForms,
        localMeanings,
        newWordNodeId
      );
      flowRef.current.dispose();
      flowRef.current = createV3SaveFlow(latest);
      scopeRef.current += 1;
      setWord(latest);
      setDraftFormsState(localForms);
      updateDirty(
        "forms",
        JSON.stringify(localForms) !== JSON.stringify(latest.forms)
      );
      cleanMeaningsRef.current = dirtyRef.current.meanings
        ? ensureV3MeaningsForForms(
            latest.id,
            localForms,
            cleanMeaningsRef.current,
            newWordNodeId,
            alignedMeanings
          )
        : alignedMeanings;
      setDraftMeaningsState(alignedMeanings);
      updateDirty(
        "meanings",
        v3ContentFingerprint(alignedMeanings) !==
          v3ContentFingerprint(cleanMeaningsRef.current)
      );
      setActivePosIdState((current) =>
        current && localForms.pos.some((pos) => pos.pos_id === current)
          ? current
          : localForms.pos[0]?.pos_id
      );
      if (
        remoteUpdateRef.current &&
        latest.revision >= remoteUpdateRef.current.revision
      ) {
        setRemoteUpdate(undefined);
      }
    },
    [setRemoteUpdate, updateDirty]
  );

  // 录入者知情后（或新版本就是自己写出的）继续用本地输入：基线换成该版本，之后的保存是有意覆盖。
  const adoptKeepingLocalDrafts = useCallback(
    (latest: AdminWordV3) => {
      supersede();
      resetReconciliationState();
      const localForms = dirtyRef.current.forms
        ? draftFormsRef.current
        : latest.forms;
      const localMeanings = dirtyRef.current.meanings
        ? draftMeaningsRef.current
        : initializedMeanings(latest, localForms).draft;
      rebaseKeepingLocalDrafts(latest, localForms, localMeanings);
      setProblem(undefined);
      setConflict(undefined);
      clearPreviewState();
    },
    [clearPreviewState, rebaseKeepingLocalDrafts, supersede]
  );

  // 服务端送来比当前基线更新的内容版本（刷新或对账）。保存在途就等保存结束再判定；本地没有
  // 未保存输入直接采用；新版本就是自己写出的就保留本地输入换基线；否则挂起，交给录入者决定。
  // 静默换基线会让下次保存带着旧内容宣称基于新版本，绕过乐观锁覆盖别处的改动。
  const receiveNewerRevision = useCallback(
    (latest: AdminWordV3) => {
      const canonical = flowRef.current.canonical();
      if (latest.id !== canonical.id || latest.revision <= canonical.revision) {
        return;
      }
      if (savesInFlightRef.current > 0) {
        if ((deferredNewerRef.current?.revision ?? 0) < latest.revision) {
          deferredNewerRef.current = latest;
        }
        return;
      }
      if (!dirtyRef.current.forms && !dirtyRef.current.meanings) {
        replaceSession(latest, true);
        return;
      }
      if (latest.revision <= ownRevisionRef.current) {
        adoptKeepingLocalDrafts(latest);
        return;
      }
      if ((remoteUpdateRef.current?.revision ?? 0) < latest.revision) {
        setRemoteUpdate(latest);
      }
    },
    [adoptKeepingLocalDrafts, replaceSession, setRemoteUpdate]
  );

  const finishSaveInFlight = useCallback(() => {
    savesInFlightRef.current = Math.max(0, savesInFlightRef.current - 1);
    if (savesInFlightRef.current > 0 || !mountedRef.current) return;
    const deferred = deferredNewerRef.current;
    deferredNewerRef.current = undefined;
    if (deferred) receiveNewerRevision(deferred);
  }, [receiveNewerRevision]);

  // 待决期间本地已经没有未保存输入（撤回了修改）：没有要保护的内容，直接采用新版本。
  useEffect(() => {
    const pending = remoteUpdateRef.current;
    if (!pending || dirtySteps.forms || dirtySteps.meanings) return;
    if (pending.revision > flowRef.current.canonical().revision) {
      replaceSession(pending, true);
    } else {
      setRemoteUpdate(undefined);
    }
  }, [dirtySteps, remoteUpdate, replaceSession, setRemoteUpdate]);

  useEffect(() => {
    const canonical = flowRef.current.canonical();
    if (initialWord.id !== canonical.id) return;
    if (initialWord.revision > canonical.revision) {
      receiveNewerRevision(initialWord);
    } else if (
      initialWord.revision === canonical.revision &&
      initialWord.lifecycle_revision > canonical.lifecycle_revision
    ) {
      replaceSession(initialWord, true);
    }
  }, [initialWord, receiveNewerRevision, replaceSession]);

  const applyCanonical = useCallback(
    (canonical: AdminWordV3, replacement: "forms" | "meanings" | "all") => {
      if (!mountedRef.current) return;
      const syncForms =
        replacement === "all" ||
        replacement === "forms" ||
        !dirtyRef.current.forms;
      const syncMeanings =
        replacement === "all" ||
        replacement === "meanings" ||
        !dirtyRef.current.meanings;
      const nextMeanings = syncMeanings
        ? initializedMeanings(canonical)
        : undefined;
      setWord(canonical);
      if (syncForms) {
        setDraftFormsState(canonical.forms);
        setActivePosIdState((current) =>
          current && canonical.forms.pos.some((pos) => pos.pos_id === current)
            ? current
            : canonical.forms.pos[0]?.pos_id
        );
      }
      if (nextMeanings) {
        cleanMeaningsRef.current = nextMeanings.draft;
        setDraftMeaningsState(nextMeanings.draft);
      }
      clearDirty(syncForms && syncMeanings ? "all" : replacement);
      // 挂起的「服务端新版本」其实是这次保存自己写出的版本（刷新先于保存响应到达），
      // 基线已经追平，冲突不成立。
      if (
        remoteUpdateRef.current &&
        canonical.revision >= remoteUpdateRef.current.revision
      ) {
        setRemoteUpdate(undefined);
      }
      setProblem(undefined);
      setConflict(undefined);
      clearPreviewState();
      onWordChange?.(canonical);
    },
    [clearDirty, clearPreviewState, onWordChange, setRemoteUpdate]
  );

  const replaceStepIssues = useCallback(
    (
      steps: readonly ("forms" | "meanings")[],
      issues: readonly V3DraftValidationIssue[]
    ) => {
      setPublicationIssues((current) => {
        const replaced = new Set<string>(steps);
        for (const issue of issues) replaced.add(issue.step);
        const next = [
          ...current.filter((issue) => !replaced.has(issue.step)),
          ...issues
        ];
        return next.length === current.length &&
          next.every((issue, index) => issue === current[index])
          ? current
          : next;
      });
    },
    []
  );

  const handleError = useCallback(
    async (
      error: unknown,
      operation: Parameters<typeof classifyV3Problem>[1],
      retry: () => Promise<void>,
      localConflict?: V3ConflictComparison,
      completionSave?: boolean
    ) => {
      if (!mountedRef.current) return;
      const nextProblem = classifyV3Problem(error, operation);
      setProblem(nextProblem);
      retryRef.current = nextProblem.retryable ? retry : undefined;
      if (nextProblem.kind === "revision_conflict" && localConflict) {
        setConflict(localConflict);
      }
      if (
        nextProblem.kind === "validation" &&
        (operation === "validate" || operation === "publish")
      ) {
        setPublicationIssues(nextProblem.issues);
        if (operation === "publish") clearPreviewState();
      } else if (
        nextProblem.kind === "validation" &&
        completionSave &&
        (operation === "save_forms" || operation === "save_meanings")
      ) {
        replaceStepIssues(
          [operation === "save_forms" ? "forms" : "meanings"],
          nextProblem.issues
        );
      }
    },
    [clearPreviewState, replaceStepIssues]
  );

  const reconcileArchivedCanonical = useCallback(async () => {
    if (
      !archivedReconciliationRequiredRef.current ||
      archivedReconciliationLockRef.current
    ) {
      return;
    }
    archivedReconciliationLockRef.current = true;
    const scope = scopeRef.current;
    const wordId = flowRef.current.canonical().id;
    const done = markPending("refresh_archived");
    let retryCurrentScope = false;
    try {
      const latest = await requests.get(wordId);
      if (!mountedRef.current) return;
      if (scope !== scopeRef.current) {
        retryCurrentScope = true;
        return;
      }
      flowRef.current.dispose();
      flowRef.current = createV3SaveFlow(latest.word);
      scopeRef.current += 1;
      publishAttemptRef.current = undefined;
      publishReconciliationRequiredRef.current = false;
      publishReconciliationLockRef.current = false;
      archivedReconciliationRequiredRef.current = false;
      retryRef.current = undefined;
      // 词条已进垃圾桶、会话只读：挂起的新版本不再有保留或放弃的意义。
      setRemoteUpdate(undefined);
      deferredNewerRef.current = undefined;
      setWord(latest.word);
      if (!dirtyRef.current.forms) {
        setDraftFormsState(latest.word.forms);
        setActivePosIdState((current) =>
          current && latest.word.forms.pos.some((pos) => pos.pos_id === current)
            ? current
            : latest.word.forms.pos[0]?.pos_id
        );
      }
      if (!dirtyRef.current.meanings) {
        const nextMeanings = initializedMeanings(latest.word);
        cleanMeaningsRef.current = nextMeanings.draft;
        setDraftMeaningsState(nextMeanings.draft);
        updateDirty("meanings", false);
      }
      setPublicationIssues([]);
      setProblem(undefined);
      setConflict(undefined);
      clearPreviewState();
      onWordChange?.(latest.word);
    } catch (error) {
      if (scope === scopeRef.current) {
        await handleError(error, "get", reconcileArchivedCanonical);
      } else {
        retryCurrentScope = true;
      }
    } finally {
      archivedReconciliationLockRef.current = false;
      done();
      if (
        retryCurrentScope &&
        mountedRef.current &&
        archivedReconciliationRequiredRef.current
      ) {
        void reconcileArchivedCanonical();
      }
    }
  }, [
    clearPreviewState,
    handleError,
    markPending,
    onWordChange,
    requests,
    setRemoteUpdate,
    updateDirty
  ]);

  const handleEntryArchived = useCallback(
    async (error: unknown) => {
      if (!mountedRef.current) return;
      archivedReconciliationRequiredRef.current = true;
      publishAttemptRef.current = undefined;
      publishReconciliationRequiredRef.current = false;
      publishReconciliationLockRef.current = false;
      supersede();
      clearPreviewState();
      setConflict(undefined);
      setProblem(classifyV3Problem(error, "get"));
      retryRef.current = reconcileArchivedCanonical;
      await reconcileArchivedCanonical();
    },
    [clearPreviewState, reconcileArchivedCanonical, supersede]
  );

  const saveFormsContent = useCallback(
    async (
      content: DraftFormsStepContentV3,
      intent: StepSaveIntent,
      confirmationContext?: Omit<
        V3ConfirmationContext,
        "base_revision" | "impact_content"
      >
    ) => {
      const flow = flowRef.current;
      if (
        archivedReconciliationRequiredRef.current ||
        flow.canonical().status === "archived"
      ) {
        return false;
      }
      if (blockedByRemoteUpdate()) return false;
      const senseBindings =
        flow.canonical().capabilities.atomic_form_sense_bindings === true
          ? formGroupBindingPatches(
              draftMeaningsRef.current,
              flow.canonical().meanings
            )
          : [];
      const baseRevision = flow.canonical().revision;
      const scope = scopeRef.current;
      const done = markPending("save_forms");
      const retry = async () => {
        await saveFormsContent(content, intent, confirmationContext);
      };
      savesInFlightRef.current += 1;
      try {
        const tokens = flow.confirmations({
          base_revision: baseRevision,
          impact_content: content,
          sense_bindings: senseBindings,
          ...confirmationContext
        });
        const result = await flow.runCanonical("save_forms", () =>
          requests.saveForms(flow.canonical().id, {
            schema_version: 3,
            base_revision: baseRevision,
            intent,
            content,
            ...(senseBindings.length ? { sense_bindings: senseBindings } : {}),
            ...tokens
          })
        );
        noteOwnRevision(result.value.word);
        if (result.accepted && scope === scopeRef.current) {
          if (intent === "complete") replaceStepIssues(["forms"], []);
          if (senseBindings.length) {
            cleanMeaningsRef.current = syncFormGroupBindings(
              cleanMeaningsRef.current,
              result.value.word.meanings
            );
            updateDirty(
              "meanings",
              v3ContentFingerprint(draftMeaningsRef.current) !==
                v3ContentFingerprint(cleanMeaningsRef.current)
            );
          }
          applyCanonical(result.value.word, "forms");
          return true;
        }
        return false;
      } catch (error) {
        if (classifyV3Problem(error, "save_forms").kind === "entry_archived") {
          await handleEntryArchived(error);
        } else if (scope === scopeRef.current) {
          await handleError(
            error,
            "save_forms",
            retry,
            {
              step: "forms",
              baseRevision,
              localForms: content
            },
            intent === "complete"
          );
        }
        return false;
      } finally {
        done();
        finishSaveInFlight();
      }
    },
    [
      applyCanonical,
      finishSaveInFlight,
      handleEntryArchived,
      handleError,
      markPending,
      replaceStepIssues,
      updateDirty,
      requests
    ]
  );

  const previewFormsImpact = useCallback(
    async (purpose: "publish" | "save" = "publish") => {
      if (purpose === "publish" && hasLiveDirtyDraft()) return undefined;
      const flow = flowRef.current;
      if (
        archivedReconciliationRequiredRef.current ||
        flow.canonical().status === "archived"
      ) {
        return undefined;
      }
      if (blockedByRemoteUpdate()) return undefined;
      const senseBindings =
        flow.canonical().capabilities.atomic_form_sense_bindings === true
          ? formGroupBindingPatches(
              draftMeaningsRef.current,
              flow.canonical().meanings
            )
          : [];
      const content = draftForms;
      const baseRevision = flow.canonical().revision;
      const scope = scopeRef.current;
      const done = markPending("impact");
      setImpact(undefined);
      setImpactConfirmed(false);
      const retry = async () => {
        await previewFormsImpact(purpose);
      };
      try {
        const result = await flow.runRequest("impact", () =>
          requests.impact(flow.canonical().id, {
            schema_version: 3,
            base_revision: baseRevision,
            ...(senseBindings.length ? { sense_bindings: senseBindings } : {}),
            content
          })
        );
        if (!result.accepted || scope !== scopeRef.current) return undefined;
        flow.bindImpactConfirmation(result.value, content, senseBindings);
        setImpact(result.value);
        setImpactConfirmed(
          !result.value.requires_confirmation &&
            !result.value.surface_match_page
        );
        setProblem(undefined);
        return result.value;
      } catch (error) {
        if (classifyV3Problem(error, "impact").kind === "entry_archived") {
          await handleEntryArchived(error);
        } else if (scope === scopeRef.current) {
          await handleError(error, "impact", retry);
        }
        return undefined;
      } finally {
        done();
      }
    },
    [draftForms, handleEntryArchived, handleError, markPending, requests]
  );

  const saveMeanings = useCallback(
    async (
      content: DraftMeaningsStepContentWritableV3,
      intent: StepSaveIntent
    ) => {
      if (blockedByRemoteUpdate()) return;
      if (
        intent === "complete" &&
        sentenceLeaveGuard.current &&
        !(await sentenceLeaveGuard.current())
      )
        return;
      // 未完成例句的确认可能停留很久，期间可能已经收到服务端新版本。
      if (blockedByRemoteUpdate()) return;
      const flow = flowRef.current;
      if (
        archivedReconciliationRequiredRef.current ||
        flow.canonical().status === "archived"
      ) {
        return;
      }
      if (
        dirtyRef.current.forms ||
        (intent === "complete" &&
          !flow.canonical().completed_steps.includes("forms"))
      ) {
        // 用当前草稿：未完成例句的确认弹窗期间词形也可能被改过。
        const formsSaved = await saveFormsContent(
          draftFormsRef.current,
          intent
        );
        if (!formsSaved) return;
        // 词形保存结束时可能处理了暂存的新版本（挂起提示或整体替换会话），不再按旧基线续发词义。
        if (blockedByRemoteUpdate() || flowRef.current !== flow) return;
      }
      const baseRevision = flow.canonical().revision;
      // 四个译文框只是录入位，收尾提交时丢掉一个字都没填的行。放在这条所有保存
      // 都会经过的管线上，「确认影响并完成」那种旁路才不会漏掉清洗；保存失败或
      // 撞版本冲突时，回填用的本地编辑态也仍是未清洗的，录入位不会凭空少几行。
      const meaningsPayload =
        intent === "complete"
          ? dropEmptySentenceTranslations(content)
          : content;
      const scope = scopeRef.current;
      const done = markPending("save_meanings");
      const retry = async () => {
        await saveMeanings(content, intent);
      };
      savesInFlightRef.current += 1;
      try {
        const result = await flow.runCanonical("save_meanings", () =>
          requests.saveMeanings(flow.canonical().id, {
            schema_version: 3,
            base_revision: baseRevision,
            intent,
            // 释义级成分用词只在后端声明支持时发送（无 dev 放宽）：旧后端会 400。
            content: prepareTextLinksForSave(
              stripBlankRelations(
                flow.canonical().capabilities.sense_component_usages === true
                  ? meaningsPayload
                  : stripSenseComponentUsages(meaningsPayload)
              ),
              flow.canonical().capabilities.text_links === true
            )
          })
        );
        noteOwnRevision(result.value.word);
        if (result.accepted && scope === scopeRef.current) {
          if (intent === "complete") {
            // meanings 完成成功隐含服务端已认可 forms 完成态（后端仅在内容
            // 通过完成校验时保留 completed_steps），两步的滞留 issues 一并失效
            replaceStepIssues(["forms", "meanings"], []);
          }
          applyCanonical(result.value.word, "meanings");
          if (intent === "complete") {
            setActiveStepState(
              resolveV3StepAccess(
                result.value.word,
                "preview",
                allowPublishedEditing
              ).effective
            );
          }
          return result.value.word;
        }
      } catch (error) {
        if (
          classifyV3Problem(error, "save_meanings").kind === "entry_archived"
        ) {
          await handleEntryArchived(error);
        } else if (scope === scopeRef.current) {
          await handleError(
            error,
            "save_meanings",
            retry,
            {
              step: "meanings",
              baseRevision,
              localMeanings: content
            },
            intent === "complete"
          );
        }
      } finally {
        done();
        finishSaveInFlight();
      }
    },
    [
      applyCanonical,
      allowPublishedEditing,
      finishSaveInFlight,
      handleEntryArchived,
      handleError,
      markPending,
      replaceStepIssues,
      requests,
      saveFormsContent
    ]
  );

  const validate = useCallback(async () => {
    if (hasLiveDirtyDraft() || blockedByRemoteUpdate()) return undefined;
    const flow = flowRef.current;
    if (
      archivedReconciliationRequiredRef.current ||
      flow.canonical().status === "archived"
    ) {
      return undefined;
    }
    const baseRevision = flow.canonical().revision;
    const scope = scopeRef.current;
    const done = markPending("validate");
    setValidation(undefined);
    const retry = async () => {
      await validate();
    };
    try {
      const result = await flow.runRequest("validate", () =>
        requests.validate(flow.canonical().id, {
          schema_version: 3,
          base_revision: baseRevision
        })
      );
      if (!result.accepted || scope !== scopeRef.current) return undefined;
      setProblem(undefined);
      setValidation(result.value);
      setPublicationIssues(result.value.issues);
      if (!result.value.valid) {
        setImpact(undefined);
        setImpactConfirmed(false);
      }
      return result.value;
    } catch (error) {
      if (classifyV3Problem(error, "validate").kind === "entry_archived") {
        await handleEntryArchived(error);
      } else if (scope === scopeRef.current) {
        await handleError(error, "validate", retry);
      }
      return undefined;
    } finally {
      done();
    }
  }, [handleEntryArchived, handleError, markPending, requests]);

  const confirmImpactSurface = useCallback(
    (page: SurfaceMatchPageV3) => {
      if (!impact || !impact.surface_match_page) return false;
      const flow = flowRef.current;
      if (!flow.bindImpactSurfaceConfirmation(page)) {
        setImpactConfirmed(false);
        return false;
      }
      const tokens = flow.confirmations({
        base_revision: flow.canonical().revision,
        snapshot_id: impact.surface_match_page.snapshot_id,
        policy_name: impact.surface_match_page.policy_name,
        policy_epoch: impact.surface_match_page.policy_epoch,
        impact_content: draftForms,
        sense_bindings:
          flow.canonical().capabilities.atomic_form_sense_bindings === true
            ? formGroupBindingPatches(
                draftMeaningsRef.current,
                flow.canonical().meanings
              )
            : []
      });
      const confirmed = Boolean(
        tokens.confirmed_surface_match_token &&
        (!impact.requires_confirmation || tokens.confirmed_impact_token)
      );
      setImpactConfirmed(confirmed);
      return confirmed;
    },
    [draftForms, impact]
  );

  const confirmImpact = useCallback(() => {
    // blocked_references 不在这里拦：词形步、词义步在预检拿到它时就不进确认。发布也走这份
    // 影响确认，而发布只查例句与已发布引用，在这里拦会让「确认影响并允许发布」点了没反应；
    // 真被拒时由发布的 409 列出引用。
    if (!impact || impact.surface_match_page) {
      setImpactConfirmed(false);
      return false;
    }
    const flow = flowRef.current;
    const tokens = flow.confirmations({
      base_revision: flow.canonical().revision,
      impact_content: draftForms,
      sense_bindings:
        flow.canonical().capabilities.atomic_form_sense_bindings === true
          ? formGroupBindingPatches(
              draftMeaningsRef.current,
              flow.canonical().meanings
            )
          : []
    });
    const confirmed =
      !impact.requires_confirmation || Boolean(tokens.confirmed_impact_token);
    setImpactConfirmed(confirmed);
    return confirmed;
  }, [draftForms, impact]);

  const fetchSurfacePage = useCallback(
    (snapshotId: string, cursor: string, signal: AbortSignal) =>
      requests.surfacePage(snapshotId, cursor, signal),
    [requests]
  );

  const reconcilePublishConflict = useCallback(async () => {
    if (
      !publishReconciliationRequiredRef.current ||
      publishReconciliationLockRef.current
    ) {
      return;
    }
    publishReconciliationLockRef.current = true;
    const scope = scopeRef.current;
    const canonical = flowRef.current.canonical();
    const done = markPending("publish");
    try {
      const latest = await requests.get(canonical.id);
      if (!mountedRef.current) return;
      if (scope !== scopeRef.current) {
        if (publishReconciliationRequiredRef.current) {
          retryRef.current = reconcilePublishConflict;
          setProblem((current) =>
            current?.kind === "revision_conflict" ||
            current?.kind === "idempotency_conflict"
              ? { ...current, retryable: true }
              : current
          );
        }
        return;
      }
      if (
        latest.word.revision > flowRef.current.canonical().revision &&
        (dirtyRef.current.forms || dirtyRef.current.meanings)
      ) {
        // 本地有未保存输入：对账拿到的新版本同样不能静默换基线，交给统一的新版本判定。
        // 对账锁仍交给下面的 finally 释放，所以这里不复用 resetReconciliationState。
        publishAttemptRef.current = undefined;
        publishReconciliationRequiredRef.current = false;
        retryRef.current = undefined;
        setPublicationIssues([]);
        setProblem(undefined);
        setConflict(undefined);
        clearPreviewState();
        receiveNewerRevision(latest.word);
        onWordChange?.(latest.word);
        return;
      }
      flowRef.current.dispose();
      flowRef.current = createV3SaveFlow(latest.word);
      scopeRef.current += 1;
      publishAttemptRef.current = undefined;
      publishReconciliationRequiredRef.current = false;
      retryRef.current = undefined;
      setWord(latest.word);
      if (!dirtyRef.current.forms) {
        setDraftFormsState(latest.word.forms);
        setActivePosIdState((current) =>
          current && latest.word.forms.pos.some((pos) => pos.pos_id === current)
            ? current
            : latest.word.forms.pos[0]?.pos_id
        );
      }
      if (!dirtyRef.current.meanings) {
        const nextMeanings = initializedMeanings(latest.word);
        cleanMeaningsRef.current = nextMeanings.draft;
        setDraftMeaningsState(nextMeanings.draft);
        updateDirty("meanings", false);
      }
      setPublicationIssues([]);
      setProblem(undefined);
      setConflict(undefined);
      clearPreviewState();
      onWordChange?.(latest.word);
    } catch (error) {
      if (scope === scopeRef.current) {
        await handleError(error, "get", reconcilePublishConflict);
      }
    } finally {
      publishReconciliationLockRef.current = false;
      done();
    }
  }, [
    clearPreviewState,
    handleError,
    markPending,
    onWordChange,
    receiveNewerRevision,
    requests,
    updateDirty
  ]);

  const publishWithAttempt = useCallback(
    async (attempt: PublishAttempt): Promise<void> => {
      if (hasLiveDirtyDraft()) return;
      const flow = flowRef.current;
      const scope = scopeRef.current;
      const done = markPending("publish");
      const retry = () => publishWithAttempt(attempt);
      const finishAttempt = () => {
        if (publishAttemptRef.current !== attempt) return;
        publishAttemptRef.current = undefined;
        retryRef.current = undefined;
      };
      try {
        const result = await flow.runCanonical("publish", () =>
          requests.publish(flow.canonical().id, attempt.idempotencyKey, {
            schema_version: 3,
            base_revision: attempt.baseRevision,
            ...(attempt.confirmedSurfaceToken
              ? {
                  confirmed_surface_match_token: attempt.confirmedSurfaceToken
                }
              : {})
          })
        );
        finishAttempt();
        if (result.accepted && scope === scopeRef.current) {
          setPublicationIssues([]);
          applyCanonical(result.value.word, "all");
        }
      } catch (error) {
        const nextProblem = classifyV3Problem(error, "publish");
        if (nextProblem.kind === "entry_archived") {
          finishAttempt();
          await handleEntryArchived(error);
        } else if (scope === scopeRef.current) {
          if (
            nextProblem.kind === "idempotency_conflict" ||
            nextProblem.kind === "revision_conflict"
          ) {
            publishReconciliationRequiredRef.current = true;
            clearPreviewState();
            await handleError(error, "publish", reconcilePublishConflict);
            await reconcilePublishConflict();
          } else {
            if (
              (nextProblem.kind === "surface_confirmation" &&
                nextProblem.requires_new_idempotency_key) ||
              nextProblem.kind === "validation"
            ) {
              finishAttempt();
            }
            await handleError(error, "publish", retry);
          }
        }
      } finally {
        done();
      }
    },
    [
      applyCanonical,
      clearPreviewState,
      handleError,
      handleEntryArchived,
      markPending,
      reconcilePublishConflict,
      requests
    ]
  );

  const publish = useCallback(
    (confirmedSurfaceToken?: string) => {
      if (
        hasLiveDirtyDraft() ||
        blockedByRemoteUpdate() ||
        archivedReconciliationRequiredRef.current ||
        flowRef.current.canonical().status === "archived" ||
        publishReconciliationRequiredRef.current ||
        publishReconciliationLockRef.current
      ) {
        return Promise.resolve();
      }
      const attempt =
        publishAttemptRef.current ??
        ({
          idempotencyKey: idempotencyKeyFactory(),
          baseRevision: flowRef.current.canonical().revision,
          ...(confirmedSurfaceToken ? { confirmedSurfaceToken } : {})
        } satisfies PublishAttempt);
      publishAttemptRef.current = attempt;
      return publishWithAttempt(attempt);
    },
    [idempotencyKeyFactory, publishWithAttempt]
  );

  const refreshConflict = useCallback(async () => {
    if (!conflict) return;
    const localConflict = conflict;
    const scope = scopeRef.current;
    const done = markPending("refresh_conflict");
    try {
      const latest = await requests.get(word.id);
      if (!mountedRef.current || scope !== scopeRef.current) return;
      const localForms =
        localConflict.step === "forms"
          ? localConflict.localForms
          : dirtyRef.current.forms
            ? draftForms
            : latest.word.forms;
      const localMeanings =
        localConflict.step === "meanings"
          ? localConflict.localMeanings
          : dirtyRef.current.meanings
            ? draftMeanings
            : (() => {
                const next = initializedMeanings(latest.word, localForms);
                return next.draft;
              })();
      rebaseKeepingLocalDrafts(latest.word, localForms, localMeanings);
      setConflict({ ...localConflict, serverWord: latest.word });
      clearPreviewState();
      onWordChange?.(latest.word);
    } catch (error) {
      if (scope === scopeRef.current) {
        await handleError(error, "get", refreshConflict);
      }
    } finally {
      done();
    }
  }, [
    clearPreviewState,
    conflict,
    draftForms,
    draftMeanings,
    handleError,
    markPending,
    onWordChange,
    rebaseKeepingLocalDrafts,
    requests,
    word.id
  ]);

  // 录入者知情后继续用本地输入：基线换成挂起的新版本，之后的保存是有意覆盖。
  const keepLocalChanges = useCallback(() => {
    const latest = remoteUpdateRef.current;
    if (latest) adoptKeepingLocalDrafts(latest);
  }, [adoptKeepingLocalDrafts]);

  // 放弃本地输入，整体改用服务端最新版本（挂起的新版本，或「刷新并比较」取回的版本）。
  const discardLocalChanges = useCallback(() => {
    const latest = remoteUpdateRef.current ?? conflict?.serverWord;
    if (!latest) return;
    replaceSession(latest, false);
  }, [conflict, replaceSession]);

  const retry = useCallback(async () => {
    await retryRef.current?.();
  }, []);

  const actions = useMemo<V3WizardActions>(
    () => ({
      saveForms: async (intent, confirmationContext) => {
        await saveFormsContent(draftForms, intent, confirmationContext);
      },
      previewFormsImpact: () => previewFormsImpact("publish"),
      previewFormsSaveImpact: () => previewFormsImpact("save"),
      saveMeanings: async (content, intent) => {
        await saveMeanings(content, intent);
      },
      validate,
      publish,
      confirmImpact,
      confirmImpactSurface,
      fetchSurfacePage,
      retry,
      refreshConflict,
      navigateIssue,
      navigateTarget
    }),
    [
      draftForms,
      confirmImpact,
      confirmImpactSurface,
      fetchSurfacePage,
      navigateIssue,
      navigateTarget,
      previewFormsImpact,
      publish,
      refreshConflict,
      retry,
      saveFormsContent,
      saveMeanings,
      validate
    ]
  );

  const reachableSteps = useMemo(
    () =>
      resolveV3StepAccess(
        word,
        activeStep,
        allowPublishedEditing,
        !sessionReadOnly
      ).reachable,
    [activeStep, allowPublishedEditing, sessionReadOnly, word]
  );
  const context: V3WizardSlotContext = {
    registerSentenceLeaveGuard,
    requestSentenceLeave,
    word,
    partOfSpeechCatalog,
    partOfSpeechCatalogError,
    partOfSpeechCatalogPending,
    readOnly: sessionReadOnly,
    draftForms,
    setDraftForms,
    stableVariantIds: stableVariantIdsRef.current,
    draftMeanings,
    setDraftMeanings,
    dirtySteps,
    hasUnsavedChanges: dirtySteps.forms || dirtySteps.meanings,
    activeStep,
    setActiveStep,
    ...(activePosId ? { activePosId } : {}),
    setActivePosId,
    issues: publicationIssues,
    ...(validation ? { validation } : {}),
    ...(impact ? { impact } : {}),
    impactConfirmed,
    ...(impact?.surface_match_page
      ? { impactSurfacePage: impact.surface_match_page }
      : {}),
    ...(problem?.kind === "surface_confirmation" &&
    problem.meta?.surface_match_page?.schema_version === 3
      ? { publishSurfacePage: problem.meta.surface_match_page }
      : {}),
    ...(problem ? { problem } : {}),
    isPending: (command) => pending.has(command),
    actions
  };

  const recovery = useDraftRecovery({
    entity: `word-v3:${word.id}`,
    revision: word.revision,
    value: { forms: draftForms, meanings: draftMeanings },
    dirty: dirtySteps.forms || dirtySteps.meanings,
    busy: pending.size > 0,
    restoreAllowed: !sessionReadOnly,
    restore: (value) => {
      setDraftForms(value.forms);
      setDraftMeanings(value.meanings);
    }
  });
  const renderedStep = (
    <>
      {routerContext && (
        <WordNavigationGuard
          wordId={word.id}
          dirty={context.hasUnsavedChanges || hasSentenceGuard}
          busy={pending.size > 0}
          requestSentenceLeave={requestSentenceLeave}
        />
      )}
      {recovery.notice}
      {renderStep(context)}
    </>
  );
  if (!sessionReadOnly && activeStep === "basics") {
    return renderedStep;
  }

  return (
    <V3WordCreationLayout
      sharedSentenceCount={sharedSentenceCount}
      word={word}
      partOfSpeechCatalog={partOfSpeechCatalog?.items}
      activeStep={activeStep}
      reachableSteps={reachableSteps}
      readOnly={sessionReadOnly}
      dirtySteps={dirtySteps}
      draftForms={draftForms}
      draftMeanings={draftMeanings}
      problem={problem}
      conflict={conflict}
      remoteUpdate={remoteUpdate}
      remoteUpdateNotice={remoteUpdateNotice}
      retrying={pending.size > 0}
      refreshingConflict={pending.has("refresh_conflict")}
      onStepChange={setActiveStep}
      onIssueNavigate={(issue) => void navigateIssue(issue)}
      onRetry={() => void retry()}
      onRefreshConflict={() => void refreshConflict()}
      onKeepLocalChanges={keepLocalChanges}
      onDiscardLocalChanges={discardLocalChanges}
    >
      {renderedStep}
    </V3WordCreationLayout>
  );
}

export function V3WordCreationWizard(props: V3WordCreationWizardProps) {
  return <V3WordCreationSession key={props.initialWord.id} {...props} />;
}
