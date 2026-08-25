import type {
  AdminWordV3,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  DraftValidationResponseV3,
  FormsImpactResponseV3,
  StepSaveIntent,
  SurfaceMatchPageV3,
  V3DraftValidationIssue,
  WordCreationStep
} from "@tsz/types";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { V3WordRequests } from "./api";
import {
  navigateToV3Issue,
  type V3IssueNavigationAdapter,
  type V3IssueNavigationTarget
} from "./issueNavigation";
import { toWritableMeanings } from "./meaningsModel";
import { classifyV3Problem, type V3Problem } from "./problem";
import { buildV3Readiness } from "./readiness";
import {
  createV3SaveFlow,
  type V3ConfirmationContext,
  type V3RequestCommand,
  type V3SaveFlow
} from "./saveFlow";
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
  readOnly: boolean;
  draftForms: DraftFormsStepContentV3;
  setDraftForms: (content: DraftFormsStepContentV3) => void;
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
  initialWord: AdminWordV3;
  requests: V3WordRequests;
  initialStep?: WordCreationStep;
  readOnly?: boolean;
  allowPublishedEditing?: boolean;
  renderStep: (context: V3WizardSlotContext) => ReactNode;
  navigationAdapter?: ExternalNavigationAdapter;
  idempotencyKeyFactory?: () => string;
  onWordChange?: (word: AdminWordV3) => void;
}

function defaultIdempotencyKey() {
  return globalThis.crypto.randomUUID();
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
    const scope = target.membership_id
      ? nodes.find(
          (candidate) => candidate.dataset.v3NodeId === target.membership_id
        )
      : target.form_group_id
        ? nodes.find(
            (candidate) => candidate.dataset.v3NodeId === target.form_group_id
          )
        : undefined;
    const candidates = scope
      ? [scope, ...scope.querySelectorAll<HTMLElement>("[data-v3-node-id]")]
      : nodes;
    const element = [...candidates].find(
      (candidate) =>
        candidate.dataset.v3NodeId === target.node_id &&
        candidate.dataset.v3Field === target.field
    );
    if (element) {
      element.scrollIntoView?.({ block: "center" });
      element.focus();
      if (document.activeElement === element) return;
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
  }
}

function V3WordCreationSession({
  initialWord,
  requests,
  initialStep = "forms",
  readOnly = false,
  allowPublishedEditing = false,
  renderStep,
  navigationAdapter,
  idempotencyKeyFactory = defaultIdempotencyKey,
  onWordChange
}: V3WordCreationWizardProps) {
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
  const dirtyRef = useRef({ forms: false, meanings: false });
  const [word, setWord] = useState(initialWord);
  const [draftForms, setDraftFormsState] = useState(initialWord.forms);
  const [draftMeanings, setDraftMeaningsState] = useState(() =>
    toWritableMeanings(initialWord.meanings)
  );
  const [dirtySteps, setDirtySteps] = useState({
    forms: false,
    meanings: false
  });
  const [activeStep, setActiveStepState] = useState(initialStep);
  const [activePosId, setActivePosIdState] = useState(
    initialWord.forms.pos[0]?.pos_id
  );
  const [issues, setIssues] = useState<V3DraftValidationIssue[]>([]);
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
    let cancelled = false;
    void focusRenderedTarget(pendingFocusTarget).then(() => {
      if (!cancelled && mountedRef.current) setPendingFocusTarget(undefined);
    });
    return () => {
      cancelled = true;
    };
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
      updateDirty(
        "forms",
        JSON.stringify(content) !==
          JSON.stringify(flowRef.current.canonical().forms)
      );
      if (!publishReconciliationRequiredRef.current) setProblem(undefined);
      setConflict(undefined);
      clearPreviewState();
    },
    [clearPreviewState, supersede, updateDirty]
  );

  const setDraftMeanings = useCallback(
    (content: DraftMeaningsStepContentWritableV3) => {
      supersede();
      setDraftMeaningsState(content);
      updateDirty(
        "meanings",
        JSON.stringify(content) !==
          JSON.stringify(
            toWritableMeanings(flowRef.current.canonical().meanings)
          )
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
      if (step === activeStep) return;
      supersede();
      setActiveStepState(step);
    },
    [activeStep, sessionReadOnly, supersede]
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
      setDraftMeaningsState(toWritableMeanings(initialWord.meanings));
    }
    setProblem(undefined);
    setConflict(undefined);
    setIssues([]);
    clearPreviewState();
  }, [clearPreviewState, initialWord, supersede]);

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
      setWord(canonical);
      if (syncForms) {
        setDraftFormsState(canonical.forms);
        setActivePosIdState((current) =>
          current && canonical.forms.pos.some((pos) => pos.pos_id === current)
            ? current
            : canonical.forms.pos[0]?.pos_id
        );
      }
      if (syncMeanings) {
        setDraftMeaningsState(toWritableMeanings(canonical.meanings));
      }
      clearDirty(syncForms && syncMeanings ? "all" : replacement);
      setProblem(undefined);
      setConflict(undefined);
      setIssues([]);
      clearPreviewState();
      onWordChange?.(canonical);
    },
    [clearDirty, clearPreviewState, onWordChange]
  );

  const handleError = useCallback(
    async (
      error: unknown,
      operation: Parameters<typeof classifyV3Problem>[1],
      retry: () => Promise<void>,
      localConflict?: V3ConflictComparison
    ) => {
      if (!mountedRef.current) return;
      const nextProblem = classifyV3Problem(error, operation);
      setProblem(nextProblem);
      retryRef.current = nextProblem.retryable ? retry : undefined;
      if (nextProblem.kind === "revision_conflict" && localConflict) {
        setConflict(localConflict);
      }
      if (nextProblem.kind === "validation") {
        setIssues(nextProblem.issues);
        const first = nextProblem.issues[0];
        if (first) await navigateIssue(first);
      }
    },
    [navigateIssue]
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
        setDraftMeaningsState(toWritableMeanings(latest.word.meanings));
      }
      setProblem(undefined);
      setConflict(undefined);
      setIssues([]);
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
  }, [clearPreviewState, handleError, markPending, onWordChange, requests]);

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
      setIssues([]);
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
        return;
      }
      const baseRevision = flow.canonical().revision;
      const scope = scopeRef.current;
      const done = markPending("save_forms");
      const retry = () =>
        saveFormsContent(content, intent, confirmationContext);
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
          applyCanonical(result.value.word, "forms");
        }
      } catch (error) {
        if (classifyV3Problem(error, "save_forms").kind === "entry_archived") {
          await handleEntryArchived(error);
        } else if (scope === scopeRef.current) {
          await handleError(error, "save_forms", retry, {
            step: "forms",
            baseRevision,
            localForms: content
          });
        }
      } finally {
        done();
      }
    },
    [applyCanonical, handleEntryArchived, handleError, markPending, requests]
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
      const baseRevision = flow.canonical().revision;
      const scope = scopeRef.current;
      const done = markPending("save_meanings");
      const retry = () => saveMeanings(content, intent);
      try {
        const result = await flow.runCanonical("save_meanings", () =>
          requests.saveMeanings(flow.canonical().id, {
            schema_version: 3,
            base_revision: baseRevision,
            intent,
            content
          })
        );
        if (result.accepted && scope === scopeRef.current) {
          applyCanonical(result.value.word, "meanings");
        }
      } catch (error) {
        if (
          classifyV3Problem(error, "save_meanings").kind === "entry_archived"
        ) {
          await handleEntryArchived(error);
        } else if (scope === scopeRef.current) {
          await handleError(error, "save_meanings", retry, {
            step: "meanings",
            baseRevision,
            localMeanings: content
          });
        }
      } finally {
        done();
      }
    },
    [applyCanonical, handleEntryArchived, handleError, markPending, requests]
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
      setIssues(result.value.issues);
      if (!result.value.valid) {
        setImpact(undefined);
        setImpactConfirmed(false);
      }
      const first = result.value.issues[0];
      if (first) await navigateIssue(first);
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
  }, [handleEntryArchived, handleError, markPending, navigateIssue, requests]);

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
        setDraftMeaningsState(toWritableMeanings(latest.word.meanings));
      }
      setProblem(undefined);
      setConflict(undefined);
      setIssues([]);
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
  }, [clearPreviewState, handleError, markPending, onWordChange, requests]);

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
              nextProblem.kind === "surface_confirmation" &&
              nextProblem.requires_new_idempotency_key
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
            : toWritableMeanings(latest.word.meanings);
      setWord(latest.word);
      setDraftFormsState(localForms);
      setDraftMeaningsState(localMeanings);
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
    word.id
  ]);

  const retry = useCallback(async () => {
    await retryRef.current?.();
  }, []);

  const actions = useMemo<V3WizardActions>(
    () => ({
      saveForms: (intent, confirmationContext) =>
        saveFormsContent(draftForms, intent, confirmationContext),
      previewFormsImpact: () => previewFormsImpact("publish"),
      previewFormsSaveImpact: () => previewFormsImpact("save"),
      saveMeanings,
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

  const readiness = useMemo(
    () => buildV3Readiness(issues, draftForms),
    [draftForms, issues]
  );
  const context: V3WizardSlotContext = {
    word,
    readOnly: sessionReadOnly,
    draftForms,
    setDraftForms,
    draftMeanings,
    setDraftMeanings,
    dirtySteps,
    hasUnsavedChanges: dirtySteps.forms || dirtySteps.meanings,
    activeStep,
    setActiveStep,
    ...(activePosId ? { activePosId } : {}),
    setActivePosId,
    issues,
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

  return (
    <V3WordCreationLayout
      word={word}
      activeStep={activeStep}
      readOnly={sessionReadOnly}
      dirtySteps={dirtySteps}
      readiness={readiness}
      issues={issues}
      problem={problem}
      conflict={conflict}
      retrying={pending.size > 0}
      refreshingConflict={pending.has("refresh_conflict")}
      onStepChange={setActiveStep}
      onIssueNavigate={(issue) => void navigateIssue(issue)}
      onRetry={() => void retry()}
      onRefreshConflict={() => void refreshConflict()}
    >
      {renderStep(context)}
    </V3WordCreationLayout>
  );
}

export function V3WordCreationWizard(props: V3WordCreationWizardProps) {
  return <V3WordCreationSession key={props.initialWord.id} {...props} />;
}
