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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { newWordNodeId } from "../word-model/primitives";
import {
  createStableVariantIdFactory,
  type V3StableVariantIdFactory
} from "./operations";
import type { V3WordRequests } from "./api";
import {
  navigateToV3Issue,
  type V3IssueNavigationAdapter,
  type V3IssueNavigationTarget
} from "./issueNavigation";
import {
  ensureV3MeaningsForForms,
  stripSenseComponentUsages,
  toWritableMeanings
} from "./meaningsModel";
import { classifyV3Problem, type V3Problem } from "./problem";
import {
  createV3SaveFlow,
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
}

export interface V3WizardSlotContext {
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
  partOfSpeechCatalog?: PartOfSpeechCatalogResponse;
  partOfSpeechCatalogError?: boolean;
  partOfSpeechCatalogPending?: boolean;
  initialWord: AdminWordV3;
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
      for (const toggle of toggles) collapsedToggles.add(toggle);
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
        candidate.dataset.v3Field === target.field &&
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
      element.scrollIntoView?.({ block: "center" });
      element.focus();
      if (document.activeElement === element) return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function V3WordCreationSession({
  initialWord,
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
        JSON.stringify(nextMeanings) !== JSON.stringify(nextCleanMeanings)
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
        JSON.stringify(content) !== JSON.stringify(cleanMeaningsRef.current)
      );
      if (!publishReconciliationRequiredRef.current) setProblem(undefined);
      setConflict(undefined);
      clearPreviewState();
    },
    [clearPreviewState, supersede, updateDirty]
  );

  const setActiveStep = useCallback(
    (step: WordCreationStep) => {
      if (sessionReadOnly) return;
      const effective = resolveV3StepAccess(
        flowRef.current.canonical(),
        step,
        allowPublishedEditing
      ).effective;
      if (effective === activeStep) return;
      supersede();
      setActiveStepState(effective);
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

  const navigateProgress = useCallback(
    async (target: V3IssueNavigationTarget) => {
      setActiveStep(target.step);
      if (target.pos_id) setActivePosId(target.pos_id);
      await navigationAdapter?.expandGroup?.(target);
      await navigationAdapter?.revealForm?.(target);
      await navigationAdapter?.revealVariant?.(target);
      await navigationAdapter?.revealPronunciation?.(target);
      if (navigationAdapter?.focusField) {
        await navigationAdapter.focusField(target);
      } else if (target.step !== "basics") {
        setPendingFocusTarget(target);
      }
    },
    [navigationAdapter, setActivePosId, setActiveStep]
  );

  useEffect(() => {
    const canonical = flowRef.current.canonical();
    const hasNewerCanonicalVersion =
      initialWord.id === canonical.id &&
      (initialWord.revision > canonical.revision ||
        (initialWord.revision === canonical.revision &&
          initialWord.lifecycle_revision > canonical.lifecycle_revision));
    if (!hasNewerCanonicalVersion) return;

    supersede();
    flowRef.current.dispose();
    flowRef.current = createV3SaveFlow(initialWord);
    publishAttemptRef.current = undefined;
    publishReconciliationRequiredRef.current = false;
    publishReconciliationLockRef.current = false;
    archivedReconciliationRequiredRef.current = false;
    archivedReconciliationLockRef.current = false;
    retryRef.current = undefined;
    setWord(initialWord);
    if (!dirtyRef.current.forms) {
      setDraftFormsState(initialWord.forms);
      setActivePosIdState((current) =>
        current && initialWord.forms.pos.some((pos) => pos.pos_id === current)
          ? current
          : initialWord.forms.pos[0]?.pos_id
      );
    }
    if (!dirtyRef.current.meanings) {
      const nextMeanings = initializedMeanings(initialWord);
      cleanMeaningsRef.current = nextMeanings.draft;
      setDraftMeaningsState(nextMeanings.draft);
      updateDirty("meanings", false);
    }
    setPublicationIssues([]);
    setProblem(undefined);
    setConflict(undefined);
    clearPreviewState();
  }, [clearPreviewState, initialWord, supersede, updateDirty]);

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
      setProblem(undefined);
      setConflict(undefined);
      clearPreviewState();
      onWordChange?.(canonical);
    },
    [clearDirty, clearPreviewState, onWordChange]
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
      const baseRevision = flow.canonical().revision;
      const scope = scopeRef.current;
      const done = markPending("save_forms");
      const retry = async () => {
        await saveFormsContent(content, intent, confirmationContext);
      };
      try {
        const tokens = flow.confirmations({
          base_revision: baseRevision,
          impact_content: content,
          ...confirmationContext
        });
        const result = await flow.runCanonical("save_forms", () =>
          requests.saveForms(flow.canonical().id, {
            schema_version: 3,
            base_revision: baseRevision,
            intent,
            content,
            ...tokens
          })
        );
        if (result.accepted && scope === scopeRef.current) {
          if (intent === "complete") replaceStepIssues(["forms"], []);
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
      }
    },
    [
      applyCanonical,
      handleEntryArchived,
      handleError,
      markPending,
      replaceStepIssues,
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
            content
          })
        );
        if (!result.accepted || scope !== scopeRef.current) return undefined;
        flow.bindImpactConfirmation(result.value, content);
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
        const formsSaved = await saveFormsContent(draftForms, intent);
        if (!formsSaved) return;
      }
      const baseRevision = flow.canonical().revision;
      const scope = scopeRef.current;
      const done = markPending("save_meanings");
      const retry = async () => {
        await saveMeanings(content, intent);
      };
      try {
        const result = await flow.runCanonical("save_meanings", () =>
          requests.saveMeanings(flow.canonical().id, {
            schema_version: 3,
            base_revision: baseRevision,
            intent,
            // 释义级成分用词只在后端声明支持时发送（无 dev 放宽）：旧后端会 400。
            content:
              flow.canonical().capabilities.sense_component_usages === true
                ? content
                : stripSenseComponentUsages(content)
          })
        );
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
      }
    },
    [
      applyCanonical,
      allowPublishedEditing,
      draftForms,
      handleEntryArchived,
      handleError,
      markPending,
      replaceStepIssues,
      requests,
      saveFormsContent
    ]
  );

  const validate = useCallback(async () => {
    if (hasLiveDirtyDraft()) return undefined;
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
        impact_content: draftForms
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
    if (!impact || impact.surface_match_page) {
      setImpactConfirmed(false);
      return false;
    }
    const flow = flowRef.current;
    const tokens = flow.confirmations({
      base_revision: flow.canonical().revision,
      impact_content: draftForms
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
      flowRef.current.dispose();
      flowRef.current = createV3SaveFlow(latest.word);
      scopeRef.current += 1;
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
      setWord(latest.word);
      setDraftFormsState(localForms);
      cleanMeaningsRef.current = dirtyRef.current.meanings
        ? ensureV3MeaningsForForms(
            latest.word.id,
            localForms,
            cleanMeaningsRef.current,
            newWordNodeId,
            localMeanings
          )
        : localMeanings;
      setDraftMeaningsState(localMeanings);
      updateDirty(
        "meanings",
        JSON.stringify(localMeanings) !==
          JSON.stringify(cleanMeaningsRef.current)
      );
      setActivePosIdState((current) =>
        current && localForms.pos.some((pos) => pos.pos_id === current)
          ? current
          : localForms.pos[0]?.pos_id
      );
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
    requests,
    updateDirty,
    word.id
  ]);

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
      navigateIssue
    }),
    [
      draftForms,
      confirmImpact,
      confirmImpactSurface,
      fetchSurfacePage,
      navigateIssue,
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
      resolveV3StepAccess(word, activeStep, allowPublishedEditing).reachable,
    [activeStep, allowPublishedEditing, word]
  );
  const context: V3WizardSlotContext = {
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

  const renderedStep = renderStep(context);
  if (!sessionReadOnly && activeStep === "basics") {
    return renderedStep;
  }

  return (
    <V3WordCreationLayout
      word={word}
      partOfSpeechCatalog={partOfSpeechCatalog?.items}
      activeStep={activeStep}
      reachableSteps={reachableSteps}
      readOnly={sessionReadOnly}
      dirtySteps={dirtySteps}
      draftForms={draftForms}
      draftMeanings={draftMeanings}
      issues={publicationIssues}
      problem={problem}
      conflict={conflict}
      retrying={pending.size > 0}
      refreshingConflict={pending.has("refresh_conflict")}
      onStepChange={setActiveStep}
      onProgressNavigate={(target) => void navigateProgress(target)}
      onIssueNavigate={(issue) => void navigateIssue(issue)}
      onRetry={() => void retry()}
      onRefreshConflict={() => void refreshConflict()}
    >
      {renderedStep}
    </V3WordCreationLayout>
  );
}

export function V3WordCreationWizard(props: V3WordCreationWizardProps) {
  return <V3WordCreationSession key={props.initialWord.id} {...props} />;
}
