import {
  useLexiconEditorTranslation,
  defaultLexiconEditorTranslation,
  type LexiconEditorTranslation,
  useLexiconEditorMessageState,
  createLexiconEditorMessage
} from "../../i18n/editor";
import { regionalVariants, primaryRegionalVariant } from "@tsz/shared";
import { CopyIcon, CircleHelpIcon, Undo2Icon } from "lucide-react";
import { Alert, Button, Flex, Space, Typography } from "@tsz/ui/admin/display";
import { App, Modal, Tooltip } from "@tsz/ui/admin/overlays";
import { AdminControls, useAdminDisabled } from "@tsz/ui/admin/context";
import { Select } from "@tsz/ui/admin/forms";
import type { FormContentV3, SharedFormsStepContentV3 } from "@tsz/types";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
  type HTMLAttributes,
  type ReactNode
} from "react";
import { useFormTypeLabel } from "../../part-of-speech/FormTypeLabels";
import {
  FormCopyError,
  applyFormCopy,
  planFormCopy,
  type FormCopyKind,
  type FormCopyMapping,
  type FormCopyPlan
} from "../formCopyModel";
import { resolveFormCopyProfiles } from "../formCopyProfiles";
import { pronunciationStyleLabel } from "../presentation";

const copyName = (
  kind: FormCopyKind,
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
) =>
  kind === "phonetics"
    ? t("panel_british_and_american_transcriptions")
    : t("panel_british_and_american_voice_parameters");
type Selection = {
  formId: string;
  kind: FormCopyKind;
  snapshot: FormContentV3;
  clicked: boolean;
};
type CopyContextValue = {
  source?: Selection;
  busy: boolean;
  begin: (formId: string, kind: FormCopyKind, clicked: boolean) => void;
  pointerDown: (
    event: PointerEvent<HTMLElement>,
    formId: string,
    kind: FormCopyKind
  ) => void;
  pointerMove: (event: PointerEvent<HTMLElement>) => void;
  pointerUp: (event: PointerEvent<HTMLElement>) => void;
  pointerCancel: () => void;
  cell: (formId: string, kind: FormCopyKind) => HTMLAttributes<HTMLElement>;
};
const CopyContext = createContext<CopyContextValue | null>(null);
export const useV3FormCopy = () => useContext(CopyContext);

function contentFor(forms: SharedFormsStepContentV3, formId: string) {
  const binding = forms.pos
    .flatMap((pos) => pos.forms)
    .find((form) => form.id === formId);
  return forms.contents.find((content) => content.id === binding?.content_id);
}
function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function V3FormCopyHandle({
  formId,
  kind
}: {
  formId: string;
  kind: FormCopyKind;
}) {
  const { t } = useLexiconEditorTranslation();
  const copy = useV3FormCopy();
  if (!copy) return null;
  const selected = copy.source?.formId === formId && copy.source.kind === kind;
  return (
    <Tooltip
      title={t(
        "panel_drag_to_copy_or_click_to_select_a_target_or_use_arrow_keys_and_enter",
        { p0: copyName(kind, t) }
      )}
    >
      <Button
        type="text"
        size="small"
        className="v3-form-copy-handle"
        icon={<CopyIcon />}
        aria-label={t("panel_copy", { p0: copyName(kind, t) })}
        aria-pressed={selected}
        disabled={copy.busy || undefined}
        onClick={(event) => {
          event.stopPropagation();
          copy.begin(formId, kind, true);
        }}
        onPointerDown={(event) => copy.pointerDown(event, formId, kind)}
        onPointerMove={copy.pointerMove}
        onPointerUp={copy.pointerUp}
        onPointerCancel={copy.pointerCancel}
      />
    </Tooltip>
  );
}

export function V3FormCopyProvider({
  forms,
  onChange,
  children
}: {
  forms: SharedFormsStepContentV3;
  onChange: (next: SharedFormsStepContentV3) => void;
  children: ReactNode;
}) {
  const { t } = useLexiconEditorTranslation();
  const { message, notification } = App.useApp();
  const noticeKey = useId();
  useEffect(
    () => () => {
      notification.destroy(noticeKey);
    },
    [notification, noticeKey]
  );
  const componentDisabled = useAdminDisabled();
  const formTypeLabel = useFormTypeLabel();
  const root = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | undefined>(undefined);
  const pointer = useRef<
    | {
        id: number;
        x: number;
        y: number;
        formId: string;
        kind: FormCopyKind;
        started: boolean;
      }
    | undefined
  >(undefined);
  const suppressClick = useRef(false);
  const [source, setSource] = useState<Selection>();
  const [hovered, setHovered] = useState<{
    formId: string;
    kind: FormCopyKind;
  }>();
  const [target, setTarget] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<FormCopyPlan>();
  const [mapping, setMapping] = useState<FormCopyMapping>({});
  const [error, setError] = useLexiconEditorMessageState();
  const [copyResult, setCopyResult] = useState<{
    kind: FormCopyKind;
    targetLabel: string;
    recordingsWarning: boolean;
    undo: { formId: string; before: FormContentV3; after: FormContentV3 };
  }>();
  const disabled = busy || Boolean(componentDisabled);
  const latest = useRef({ forms, onChange, disabled, copyResult });
  latest.current = { forms, onChange, disabled, copyResult };
  useEffect(() => {
    if (!copyResult) return;
    const timer = setTimeout(
      () =>
        setCopyResult((current) =>
          current === copyResult ? undefined : current
        ),
      10000
    );
    return () => clearTimeout(timer);
  }, [copyResult]);
  useEffect(() => {
    if (!copyResult) {
      notification.destroy(noticeKey);
      return;
    }
    const { undo } = copyResult;
    notification.success({
      key: noticeKey,
      title: t("panel_copied", { p0: copyName(copyResult.kind, t) }),
      description: t(
        "panel_target_save_the_draft_to_apply_then_audition_again",
        {
          p0: copyResult.targetLabel,
          p1: copyResult.recordingsWarning ? t("copy_recordings_retained") : ""
        }
      ),
      duration: 0,
      onClose: () =>
        setCopyResult((current) =>
          current === copyResult ? undefined : current
        ),
      actions: (
        <Button
          size="small"
          aria-label={t("panel_undo")}
          icon={<Undo2Icon />}
          disabled={disabled}
          onClick={() => {
            if (
              latest.current.disabled ||
              latest.current.copyResult !== copyResult
            )
              return;
            const current = latest.current.forms;
            if (!same(contentFor(current, undo.formId), undo.after)) {
              setError(
                createLexiconEditorMessage(
                  "panel_the_target_changed_after_copying_undo_cannot_overwrite_these_changes"
                )
              );
              setCopyResult(undefined);
              return;
            }
            latest.current.onChange({
              ...current,
              contents: current.contents.map((content) =>
                content.id === undo.before.id
                  ? structuredClone(undo.before)
                  : content
              )
            });
            setCopyResult(undefined);
            void message.success(
              t("panel_copy_undone_save_the_draft_to_keep_this_change")
            );
          }}
        >
          {t("panel_undo")}
        </Button>
      )
    });
  }, [copyResult, disabled, notification, noticeKey, message, t, setError]);
  useEffect(() => () => request.current?.abort(), []);
  const labelFor = (formId: string) => {
    const bindings = forms.pos.flatMap((pos) => pos.forms);
    const binding = bindings.find((form) => form.id === formId);
    const spellingFor = (id: string) => {
      const regions = contentFor(forms, id)?.regional_variants;
      return regions?.mode === "common"
        ? regions.common.spelling
        : regions
          ? primaryRegionalVariant(regions, "uk").spelling
          : undefined;
    };
    const spelling = spellingFor(formId);
    const matches = bindings.filter(
      (form) =>
        form.form_type === binding?.form_type &&
        spellingFor(form.id) === spelling
    );
    const suffix =
      matches.length > 1
        ? ` ${matches.findIndex((form) => form.id === formId) + 1}`
        : "";
    return t("panel_label_2", {
      p0: binding ? formTypeLabel(binding.form_type) : t("panel_form"),
      p1: suffix,
      p2: spelling ? ` · ${spelling}` : ""
    });
  };
  const cancel = () => {
    pointer.current = undefined;
    setSource(undefined);
    setTarget(undefined);
  };
  const begin = (formId: string, kind: FormCopyKind, clicked: boolean) => {
    if (latest.current.disabled || (clicked && suppressClick.current)) return;
    const content = contentFor(latest.current.forms, formId);
    if (!content) return;
    setSource({ formId, kind, clicked, snapshot: structuredClone(content) });
    setTarget(undefined);
    setError(undefined);
  };
  const assertCurrent = (plan: FormCopyPlan) => {
    const current = latest.current.forms;
    if (
      !same(
        contentFor(current, plan.source.formId),
        plan.source.contentSnapshot
      ) ||
      !same(
        contentFor(current, plan.target.formId),
        plan.target.contentSnapshot
      )
    )
      throw new FormCopyError(
        "panel_the_source_or_target_changed_select_them_again_to_copy"
      );
  };
  const apply = async (plan: FormCopyPlan) => {
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      assertCurrent(plan);
      const profiles = await resolveFormCopyProfiles(plan, controller.signal);
      if (controller.signal.aborted) return;
      assertCurrent(plan);
      const current = latest.current.forms;
      const next = applyFormCopy(current, plan, profiles);
      const after = contentFor(next, plan.target.formId)!;
      setPending(undefined);
      if (same(after, plan.target.contentSnapshot)) {
        void message.info(
          t("panel_both_configurations_are_identical_no_copy_is_needed")
        );
        return;
      }
      latest.current.onChange(next);
      const undo = {
        formId: plan.target.formId,
        before: structuredClone(plan.target.contentSnapshot),
        after: structuredClone(after)
      };
      setCopyResult({
        kind: plan.kind,
        targetLabel: labelFor(plan.target.formId),
        recordingsWarning: plan.warnings.length > 0,
        undo
      });
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof FormCopyError
            ? createLexiconEditorMessage(cause.messageKey)
            : cause instanceof Error
              ? cause.message
              : createLexiconEditorMessage("panel_copy_failed_try_again")
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const chooseTarget = (formId: string, kind: FormCopyKind) => {
    if (
      !source ||
      latest.current.disabled ||
      source.kind !== kind ||
      source.formId === formId
    )
      return;
    cancel();
    try {
      const current = latest.current.forms;
      if (!same(contentFor(current, source.formId), source.snapshot))
        throw new FormCopyError(
          "panel_the_source_changed_select_it_again_to_copy"
        );
      const plan = planFormCopy(current, source.formId, formId, kind);
      if (plan.sameContent) {
        void message.info(
          t("panel_both_forms_already_share_the_same_content_no_copy_is_needed")
        );
        return;
      }
      const sharedCount = current.pos
        .flatMap((pos) => pos.forms)
        .filter((form) => form.content_id === plan.target.contentId).length;
      if (plan.needsMapping || sharedCount > 1) {
        const initial: FormCopyMapping = {};
        for (const match of plan.matches) {
          (initial[match.side] ??= {})[match.target.pronunciationId] =
            match.source?.pronunciationId ?? null;
        }
        setMapping(initial);
        setPending(plan);
        setError(undefined);
      } else void apply(plan);
    } catch (cause) {
      setError(
        cause instanceof FormCopyError
          ? createLexiconEditorMessage(cause.messageKey)
          : cause instanceof Error
            ? cause.message
            : createLexiconEditorMessage("panel_copying_is_unavailable")
      );
    }
  };
  const sharedLabels = pending
    ? forms.pos
        .flatMap((pos) => pos.forms)
        .filter((form) => form.content_id === pending.target.contentId)
        .map((form) => labelFor(form.id))
    : [];
  const value: CopyContextValue = {
    source,
    busy,
    begin,
    pointerDown(event, formId, kind) {
      if (busy || event.button !== 0) return;
      event.stopPropagation();
      pointer.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        formId,
        kind,
        started: false
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    pointerMove(event) {
      const current = pointer.current;
      if (!current || current.id !== event.pointerId) return;
      if (
        !current.started &&
        Math.hypot(event.clientX - current.x, event.clientY - current.y) > 5
      ) {
        current.started = true;
        begin(current.formId, current.kind, false);
      }
      if (!current.started) return;
      event.preventDefault();
      const cell = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-form-copy-target]");
      setTarget(
        cell &&
          root.current?.contains(cell) &&
          cell.dataset.formCopyKind === current.kind &&
          cell.dataset.formCopyTarget !== current.formId
          ? cell.dataset.formCopyTarget
          : undefined
      );
      const edge = 56;
      if (event.clientY > window.innerHeight - edge) window.scrollBy(0, 24);
      else if (event.clientY < edge) window.scrollBy(0, -24);
    },
    pointerUp(event) {
      const current = pointer.current;
      if (!current || current.id !== event.pointerId) return;
      pointer.current = undefined;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      if (!current.started) return;
      event.preventDefault();
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      const cell = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-form-copy-target]");
      if (
        cell &&
        root.current?.contains(cell) &&
        cell.dataset.formCopyKind === current.kind &&
        cell.dataset.formCopyTarget !== current.formId
      )
        chooseTarget(cell.dataset.formCopyTarget!, current.kind);
      else cancel();
    },
    pointerCancel: cancel,
    cell(formId, kind) {
      const active = Boolean(
        source && source.kind === kind && source.formId !== formId
      );
      const highlighted =
        !busy &&
        !componentDisabled &&
        hovered?.formId === formId &&
        hovered.kind === kind;
      return {
        className: `v3-form-copy-cell${highlighted ? " is-copy-hovered" : ""}${active ? " is-copy-available" : ""}${active && target === formId ? " is-copy-target" : ""}`,
        "data-form-copy-target": formId,
        "data-form-copy-kind": kind,
        // 表格关闭整行 hover 时会移除 mouse 进入/离开事件，保留 pointer 事件。
        onPointerEnter() {
          if (!busy && !componentDisabled) setHovered({ formId, kind });
          if (active && source?.clicked) setTarget(formId);
        },
        onPointerLeave() {
          setHovered(undefined);
        },
        onClick(event) {
          if (
            !active ||
            !source?.clicked ||
            (event.target as HTMLElement).closest("button, a, input, select")
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          chooseTarget(formId, kind);
        }
      } as HTMLAttributes<HTMLElement>;
    }
  };
  return (
    <CopyContext.Provider value={value}>
      <div
        ref={root}
        className="v3-form-copy-scope"
        onKeyDown={(event) => {
          if (!source || disabled) return;
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
            return;
          }
          if (!source.clicked) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const cells = Array.from(
              root.current?.querySelectorAll<HTMLElement>(
                `[data-form-copy-kind="${source.kind}"]`
              ) ?? []
            );
            const ids = [
              ...new Set(cells.map((cell) => cell.dataset.formCopyTarget))
            ].filter((id): id is string => Boolean(id && id !== source.formId));
            if (!ids.length) return;
            const index = target ? ids.indexOf(target) : -1;
            const nextIndex =
              index < 0
                ? event.key === "ArrowDown"
                  ? 0
                  : ids.length - 1
                : (index + (event.key === "ArrowDown" ? 1 : -1) + ids.length) %
                  ids.length;
            const next = ids[nextIndex]!;
            setTarget(next);
            cells
              .find((cell) => cell.dataset.formCopyTarget === next)
              ?.scrollIntoView?.({ block: "nearest" });
          } else if (event.key === "Enter" && target) {
            event.preventDefault();
            event.stopPropagation();
            chooseTarget(target, source.kind);
          }
        }}
      >
        <Flex
          className={`v3-form-copy-feedback${source ? " is-selecting" : ""}`}
          vertical
          gap="small"
        >
          {source && (
            <Alert
              type="info"
              showIcon
              title={t("panel_copying_from", {
                p0: labelFor(source.formId),
                p1: copyName(source.kind, t)
              })}
              description={
                target
                  ? t(
                      "panel_copy_to_release_click_the_target_or_press_enter_to_apply_esc_to_cancel",
                      { p0: labelFor(target) }
                    )
                  : t(
                      "panel_select_the_same_area_in_another_form_after_clicking_copy_you_can_also_selec"
                    )
              }
              action={
                <Button size="small" onClick={cancel}>
                  {t("panel_cancel")}
                </Button>
              }
            />
          )}
          {busy && (
            <Alert
              type="info"
              showIcon
              title={t("panel_loading_complete_voice_configuration")}
            />
          )}
          {error && !pending && (
            <Alert
              type="error"
              showIcon
              title={error}
              closable
              onClose={() => setError(undefined)}
            />
          )}
        </Flex>
        <AdminControls componentDisabled={busy || Boolean(componentDisabled)}>
          <div inert={busy} aria-busy={busy}>
            {children}
          </div>
        </AdminControls>
        <Modal
          title={t("panel_copy_2", {
            p0: pending ? copyName(pending.kind, t) : t("panel_configuration")
          })}
          open={Boolean(pending)}
          confirmLoading={busy}
          okText={t("panel_copy_to_draft")}
          cancelText={t("panel_cancel")}
          mask={{ closable: !busy }}
          closable={!busy}
          cancelButtonProps={{ disabled: busy }}
          onCancel={() => {
            setPending(undefined);
            setError(undefined);
          }}
          onOk={() => {
            if (!pending || busy) return;
            try {
              assertCurrent(pending);
              void apply(
                planFormCopy(
                  latest.current.forms,
                  pending.source.formId,
                  pending.target.formId,
                  pending.kind,
                  mapping
                )
              );
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : createLexiconEditorMessage(
                      "panel_copy_conditions_changed_select_again"
                    )
              );
            }
          }}
        >
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <Typography.Text>
              {t("panel_copy_from")}
              {pending && labelFor(pending.source.formId)}
              {t("panel_to")}
              {pending && labelFor(pending.target.formId)}
              {t("panel_target_spellings_and_reading_labels_stay_unchanged")}
            </Typography.Text>
            {sharedLabels.length > 1 && (
              <Alert
                type="warning"
                showIcon
                title={t(
                  "panel_these_labels_share_the_target_content_and_will_update_together"
                )}
                description={sharedLabels.join("、")}
              />
            )}
            {pending?.needsMapping && (
              <>
                <Typography.Paragraph>
                  {t(
                    "panel_the_numbers_of_readings_differ_select_a_source_for_each_target_reading_or_s"
                  )}
                </Typography.Paragraph>
                {pending.matches.map((match) => {
                  const regions =
                    pending.source.contentSnapshot.regional_variants;
                  const sourcePronunciations = regionalVariants(
                    regions,
                    match.side
                  ).flatMap((variant) => variant.pronunciations);
                  const targetRegions =
                    pending.target.contentSnapshot.regional_variants;
                  const targetVariant = regionalVariants(
                    targetRegions,
                    match.side
                  ).find((variant) => variant.id === match.target.variantId)!;
                  const row = targetVariant.pronunciations.find(
                    (item) => item.id === match.target.pronunciationId
                  )!;
                  const label = t("panel_target_reading", {
                    p0:
                      match.side === "uk"
                        ? t("panel_british")
                        : t("panel_american"),
                    p1: match.target.index + 1,
                    p2: row.style
                      ? ` · ${pronunciationStyleLabel(row.style, t)}`
                      : ""
                  });
                  return (
                    <Flex
                      key={`${match.side}:${match.target.pronunciationId}`}
                      vertical
                      gap={4}
                    >
                      <Typography.Text>{label}</Typography.Text>
                      <Select
                        aria-label={label}
                        disabled={busy}
                        value={
                          mapping[match.side]?.[match.target.pronunciationId] ??
                          ""
                        }
                        options={[
                          {
                            value: "",
                            label: t("panel_skip_and_keep_target_content")
                          },
                          ...sourcePronunciations.map((item, index) => ({
                            value: item.id,
                            title: t("panel_source_reading", {
                              p0: index + 1,
                              p1: item.style
                                ? ` · ${pronunciationStyleLabel(item.style, t)}`
                                : "",
                              p2: item.actual_pron
                                ? ` · ${item.actual_pron}`
                                : ""
                            }),
                            label: (
                              <>
                                {t("panel_source_reading", {
                                  p0: index + 1,
                                  p1: item.style
                                    ? ` · ${pronunciationStyleLabel(item.style, t)}`
                                    : "",
                                  p2: ""
                                })}
                                {item.actual_pron && (
                                  <>
                                    {" · "}
                                    <span className="tsz-phonetics">
                                      {item.actual_pron}
                                    </span>
                                  </>
                                )}
                              </>
                            )
                          }))
                        ]}
                        onChange={(id) =>
                          setMapping((current) => ({
                            ...current,
                            [match.side]: {
                              ...current[match.side],
                              [match.target.pronunciationId]: id || null
                            }
                          }))
                        }
                      />
                    </Flex>
                  );
                })}
              </>
            )}
            {error && <Alert type="error" showIcon title={error} />}
          </Space>
        </Modal>
      </div>
    </CopyContext.Provider>
  );
}

export function V3FormCopyHelp() {
  const { t } = useLexiconEditorTranslation();
  return (
    <Tooltip
      title={t(
        "panel_transcriptions_and_voice_parameters_are_copied_separately_including_both_br"
      )}
    >
      <CircleHelpIcon aria-label={t("panel_form_copying_guidance")} />
    </Tooltip>
  );
}
