import {
  CopyOutlined,
  QuestionCircleOutlined,
  UndoOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Flex,
  Modal,
  Select,
  Space,
  Tooltip,
  Typography
} from "antd";
import type { FormContentV3, SharedFormsStepContentV3 } from "@tsz/types";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type HTMLAttributes,
  type ReactNode
} from "react";
import { useFormTypeLabel } from "../../part-of-speech/FormTypeLabels";
import {
  applyFormCopy,
  planFormCopy,
  type FormCopyKind,
  type FormCopyMapping,
  type FormCopyPlan
} from "../formCopyModel";
import { resolveFormCopyProfiles } from "../formCopyProfiles";
import { pronunciationStyleLabel } from "../presentation";

const copyName = (kind: FormCopyKind) =>
  kind === "phonetics" ? "英美音标" : "英美音色参数";
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
  const copy = useV3FormCopy();
  if (!copy) return null;
  const selected = copy.source?.formId === formId && copy.source.kind === kind;
  return (
    <Tooltip
      title={`拖动复制${copyName(kind)}；也可点击后选择目标，或用方向键和 Enter 操作`}
    >
      <Button
        type="text"
        size="small"
        className="v3-form-copy-handle"
        icon={<CopyOutlined />}
        aria-label={`复制${copyName(kind)}`}
        aria-pressed={selected}
        disabled={copy.busy}
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
  const { message } = App.useApp();
  const formTypeLabel = useFormTypeLabel();
  const latest = useRef({ forms, onChange });
  latest.current = { forms, onChange };
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
  const [target, setTarget] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<FormCopyPlan>();
  const [mapping, setMapping] = useState<FormCopyMapping>({});
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [undo, setUndo] = useState<{
    formId: string;
    before: FormContentV3;
    after: FormContentV3;
  }>();
  useEffect(() => () => request.current?.abort(), []);
  const labelFor = (formId: string) => {
    const binding = forms.pos
      .flatMap((pos) => pos.forms)
      .find((form) => form.id === formId);
    const content = contentFor(forms, formId);
    const regions = content?.regional_variants;
    const spelling =
      regions?.mode === "common"
        ? regions.common.spelling
        : regions?.uk.spelling;
    return `${binding ? formTypeLabel(binding.form_type) : "词形"}${spelling ? ` · ${spelling}` : ""}`;
  };
  const cancel = () => {
    pointer.current = undefined;
    setSource(undefined);
    setTarget(undefined);
  };
  const begin = (formId: string, kind: FormCopyKind, clicked: boolean) => {
    if (busy || (clicked && suppressClick.current)) return;
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
      throw new Error("来源或目标已变化，请重新选择后复制");
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
        void message.info("两处配置相同，无需复制");
        return;
      }
      latest.current.onChange(next);
      setUndo({
        formId: plan.target.formId,
        before: structuredClone(plan.target.contentSnapshot),
        after: structuredClone(after)
      });
      setNotice(
        `已将${copyName(plan.kind)}复制到“${labelFor(plan.target.formId)}”，请保存草稿。${plan.warnings.join("；")}${plan.kind === "phonetics" ? " 复制后请按目标拼写和读法审听。" : ""}`
      );
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "复制失败，请重试");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const chooseTarget = (formId: string, kind: FormCopyKind) => {
    if (!source || busy || source.kind !== kind || source.formId === formId)
      return;
    cancel();
    try {
      const current = latest.current.forms;
      if (!same(contentFor(current, source.formId), source.snapshot))
        throw new Error("来源内容已变化，请重新选择后复制");
      const plan = planFormCopy(current, source.formId, formId, kind);
      if (plan.sameContent) {
        void message.info("两个词形已共用同一份内容，无需复制");
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
      setError(cause instanceof Error ? cause.message : "暂时无法复制");
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
      return {
        className: `v3-form-copy-cell${active ? " is-copy-available" : ""}${active && target === formId ? " is-copy-target" : ""}`,
        "data-form-copy-target": formId,
        "data-form-copy-kind": kind,
        onMouseEnter() {
          if (active && source?.clicked) setTarget(formId);
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
          if (!source || busy) return;
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
              title={`正在复制“${labelFor(source.formId)}”的${copyName(source.kind)}`}
              description={
                target
                  ? `复制到“${labelFor(target)}”；松开鼠标、点击目标或按 Enter 应用，Esc 取消。`
                  : "请选择另一个词形的同类区域。点击复制时，也可用上下方向键选择目标，Enter 应用。"
              }
              action={
                <Button size="small" onClick={cancel}>
                  取消
                </Button>
              }
            />
          )}
          {busy && <Alert type="info" showIcon title="正在读取完整音色配置…" />}
          {error && !pending && (
            <Alert
              type="error"
              showIcon
              title={error}
              closable
              onClose={() => setError(undefined)}
            />
          )}
          {notice && (
            <Alert
              type="success"
              showIcon
              title={notice}
              closable
              onClose={() => setNotice(undefined)}
              action={
                undo && (
                  <Button
                    size="small"
                    icon={<UndoOutlined />}
                    aria-label="撤销"
                    onClick={() => {
                      const current = latest.current.forms;
                      if (!same(contentFor(current, undo.formId), undo.after)) {
                        setError("目标在复制后又被修改，不能撤销覆盖这些修改");
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
                      setUndo(undefined);
                      setNotice("已撤销刚才的复制，请保存草稿。");
                    }}
                  >
                    撤销
                  </Button>
                )
              }
            />
          )}
        </Flex>
        {children}
        <Modal
          title={`复制${pending ? copyName(pending.kind) : "配置"}`}
          open={Boolean(pending)}
          confirmLoading={busy}
          okText="复制到草稿"
          cancelText="取消"
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
                  : "复制条件已变化，请重新选择"
              );
            }
          }}
        >
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <Typography.Text>
              从“{pending && labelFor(pending.source.formId)}”复制到“
              {pending && labelFor(pending.target.formId)}
              ”。目标的拼写和读法标签保持原样。
            </Typography.Text>
            {sharedLabels.length > 1 && (
              <Alert
                type="warning"
                showIcon
                title="这些标签共用目标内容，将一起更新"
                description={sharedLabels.join("、")}
              />
            )}
            {pending?.needsMapping && (
              <>
                <Typography.Paragraph>
                  两侧读法数量不同，请为每条目标读法选择来源，或选择跳过。英式与美式分别对应。
                </Typography.Paragraph>
                {pending.matches.map((match) => {
                  const regions =
                    pending.source.contentSnapshot.regional_variants;
                  const sourceVariant =
                    regions.mode === "common"
                      ? regions.common
                      : regions[match.side];
                  const targetRegions =
                    pending.target.contentSnapshot.regional_variants;
                  const targetVariant =
                    targetRegions.mode === "common"
                      ? targetRegions.common
                      : targetRegions[match.side];
                  const row = targetVariant.pronunciations.find(
                    (item) => item.id === match.target.pronunciationId
                  )!;
                  const label = `${match.side === "uk" ? "英式" : "美式"} · 目标读法 ${match.target.index + 1}${row.style ? ` · ${pronunciationStyleLabel(row.style)}` : ""}`;
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
                          { value: "", label: "跳过，保留目标内容" },
                          ...sourceVariant.pronunciations.map(
                            (item, index) => ({
                              value: item.id,
                              label: `来源读法 ${index + 1}${item.style ? ` · ${pronunciationStyleLabel(item.style)}` : ""}${item.actual_pron ? ` · ${item.actual_pron}` : ""}`
                            })
                          )
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
  return (
    <Tooltip title="音标和音色参数分开复制，均包含英美两侧。拖动复制图标到目标区域，或点击图标后选择目标。复制会覆盖对应配置；可撤销，保存草稿后生效。音频文件不复制，复制后请重新试听。">
      <QuestionCircleOutlined aria-label="词形复制说明" />
    </Tooltip>
  );
}
