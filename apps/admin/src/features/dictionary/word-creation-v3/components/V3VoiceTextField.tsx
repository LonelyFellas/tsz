import type {
  AudioAssetLocaleV3,
  AudioAssetV3,
  Dialect,
  RichTextV2,
  RichTextV3,
  VoiceProfileV3,
  TextLinkV3
} from "@tsz/types";
import type {
  VoiceAssociation,
  VoiceEditorProps
} from "@tsz/voice-editor/types";
import {
  editRichText,
  remapTextLinks,
  toRichTextV2
} from "@tsz/voice-editor/core";
import { LiaisonIcon } from "@tsz/voice-editor";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { AudioOutlined } from "@ant-design/icons";
import { Button, Input, Space, message } from "antd";
import {
  type ReactNode,
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  adminAudioUploadAdapter,
  adminVoicePreviewAdapter,
  voicePreviewIsMock
} from "@/features/dictionary/voice-editor/dataSource";
import { env } from "@/lib/env";
// 样式随组件一起引入：V3 这条路径此前从没挂过语音编辑器，不引的话两层各画各的、完全错位。
import "@tsz/voice-editor/styles.css";
import "./V3VoiceTextField.css";

const VoiceEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceEditor
  }))
) as typeof import("@tsz/voice-editor/editor").VoiceEditor;

/** 方言换成音色语种：通用栏没有归属，返回 undefined 表示不筛选。 */
function voiceLocale(dialect?: Dialect): AudioAssetLocaleV3 | undefined {
  if (dialect === "uk") return "en-GB";
  if (dialect === "us") return "en-US";
  return undefined;
}

/** 收起态也显示连读弧的字段：编辑器里怎么连，收起后就怎么显示。字典音标不带连读，不叠。 */
const LIAISON_OVERLAY_MODES: ReadonlySet<
  NonNullable<VoiceEditorProps["mode"]>
> = new Set(["actual-pron", "grammar", "association"]);

export interface V3VoiceTextFieldProps<
  TLink extends VoiceAssociation = TextLinkV3
> {
  onDone?: () => void;
  doneLoading?: boolean;
  doneDisabled?: boolean;
  showDone?: boolean;
  onEditingChange?: (editing: boolean) => void;
  onAssociationPendingChange?: (pending: boolean) => void;
  mode?: VoiceEditorProps<TLink>["mode"];
  /** 独立正文编辑直接展示可输入文字的编辑器；其他字段仍使用输入框入口。 */
  presentation?: "field" | "editor";
  /**
   * 这段正文挂在哪一侧。英美分栏的字段传 uk / us，音色和录音归属都只留那一侧；
   * 通用栏传 common 或不传，不做筛选。
   */
  dialect?: Dialect;
  textLinks?: VoiceEditorProps<TLink>["textLinks"];
  restoreTextLinksOnCorrection?: boolean;
  renderAssociationPicker?: VoiceEditorProps<TLink>["renderAssociationPicker"];
  value: RichTextV3;
  ariaLabel: string;
  nodeId: string;
  field: string;
  placeholder?: string;
  readOnly?: boolean;
  invalid?: boolean;
  leadingAction?: ReactNode;
  audioUploadEnabled?: boolean;
  /** 发音配置；与正文分开走，因为它在 wire 上是正文的兄弟字段。 */
  voiceProfile?: VoiceProfileV3 | null;
  onVoiceProfileChange?: (next: VoiceProfileV3) => void;
  /** 挂在这段文本上的真人录音；与 voice_profile 一样是正文的兄弟字段。 */
  audioAssets?: AudioAssetV3[] | null;
  onAudioAssetsChange?: (next: AudioAssetV3[]) => void;
  onChange: VoiceEditorProps<TLink>["onChange"];
}

/**
 * V3 里带语音标注的文本字段。
 *
 * 默认显示普通输入框，点击右侧入口才展开编辑器；完成后回到输入框。
 * 两种视图都实时回写同一份正文、标注和关联，不把富文本降成纯字符串。
 *
 * `data-v3-node-id` / `data-v3-field` 必须落在**真正可聚焦的输入框**上：向导的
 * 错误定位是 `querySelector` 之后 `focus()` 再校验 `activeElement`，挂在外层
 * 容器上会让「跳到出错字段」失效。
 */
export function V3VoiceTextField<TLink extends VoiceAssociation = TextLinkV3>({
  onDone,
  doneLoading,
  doneDisabled,
  showDone = true,
  onEditingChange,
  onAssociationPendingChange,
  mode,
  presentation = "field",
  dialect,
  textLinks,
  restoreTextLinksOnCorrection,
  renderAssociationPicker,
  value,
  ariaLabel,
  nodeId,
  field,
  placeholder,
  readOnly,
  invalid,
  leadingAction,
  audioUploadEnabled = mode !== "association",
  voiceProfile,
  onVoiceProfileChange,
  audioAssets,
  onAudioAssetsChange,
  onChange
}: V3VoiceTextFieldProps<TLink>) {
  const [editing, setEditing] = useState(false);
  const expanded = env.VOICE_EDITOR && (presentation === "editor" || editing);
  // 缓存住：每次渲染都新建对象会让弧线层跟着重量一遍。展开编辑时用不上，不算。
  const liaisons = useMemo(
    () =>
      !expanded && mode !== undefined && LIAISON_OVERLAY_MODES.has(mode)
        ? liaisonOnly(value)
        : undefined,
    [expanded, mode, value]
  );
  useEffect(() => {
    onEditingChange?.(expanded);
    if (!expanded) onAssociationPendingChange?.(false);
  }, [expanded, onEditingChange, onAssociationPendingChange]);
  const [feedback, feedbackHolder] = message.useMessage();
  type Snapshot = { value: RichTextV3; links: typeof textLinks };
  const history = useRef<{
    past: Snapshot[];
    future: Snapshot[];
    expected: string;
  }>({
    past: [],
    future: [],
    expected: JSON.stringify([nodeId, value, textLinks ?? []])
  });
  useEffect(() => {
    const key = JSON.stringify([nodeId, value, textLinks ?? []]);
    if (key !== history.current.expected) {
      history.current = { past: [], future: [], expected: key };
    }
  }, [nodeId, value, textLinks]);
  const publish = (next: RichTextV3, links: typeof textLinks) => {
    const nextLinks = mode === "association" ? (links ?? []) : links;
    history.current.expected = JSON.stringify([
      nodeId,
      toRichTextV2(next),
      nextLinks ?? []
    ]);
    onChange(toRichTextV2(next), nextLinks);
  };
  const change: VoiceEditorProps<TLink>["onChange"] = (next, links) => {
    if (readOnly) return;
    history.current.past = [
      ...history.current.past.slice(-99),
      { value, links: textLinks }
    ];
    history.current.future = [];
    publish(next, links);
  };
  const restore = (redo: boolean) => {
    if (readOnly) return;
    const source = redo ? history.current.future : history.current.past;
    const snapshot = source.pop();
    if (!snapshot) return;
    const destination = redo ? history.current.past : history.current.future;
    destination.push({ value, links: textLinks });
    publish(snapshot.value, snapshot.links);
  };
  const fallback = (
    <Input.TextArea
      aria-label={ariaLabel}
      aria-invalid={invalid}
      status={invalid ? "error" : undefined}
      autoSize={{ minRows: 1, maxRows: 6 }}
      className="word-pronunciation-phonetic-input"
      data-v3-field={field}
      data-v3-node-id={nodeId}
      onKeyDown={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")
        ) {
          event.preventDefault();
          restore(event.shiftKey || event.key.toLowerCase() === "y");
        }
      }}
      onChange={(event) => {
        const inputType = (event.nativeEvent as InputEvent).inputType;
        if (inputType === "historyUndo" || inputType === "historyRedo") {
          restore(inputType === "historyRedo");
          return;
        }
        const next = editRichText(value, event.target.value);
        const links =
          mode === "association"
            ? remapTextLinks(value.text, event.target.value, textLinks ?? [])
            : undefined;
        const removed =
          (textLinks?.length ?? 0) > (links?.length ?? 0) ||
          toRichTextV2(value).annotations.length > next.annotations.length;
        change(next, links);
        if (removed)
          void feedback.info("已移除受改字影响的关联或标注，可撤销恢复");
      }}
      placeholder={placeholder}
      readOnly={readOnly || (expanded && presentation !== "editor")}
      value={value.text}
    />
  );

  if (!env.VOICE_EDITOR)
    return (
      <>
        {feedbackHolder}
        {leadingAction ? (
          <Space.Compact block>
            {leadingAction}
            {fallback}
          </Space.Compact>
        ) : (
          fallback
        )}
      </>
    );

  if (!expanded) {
    return (
      <>
        {feedbackHolder}
        <Space.Compact block>
          {leadingAction}
          {/* 外层常驻：连读有无切换时只增删弧线层，输入框不重挂，打字的光标不丢。 */}
          <div className="v3-voice-text-field-input">
            {fallback}
            {liaisons && <LiaisonOverlay value={liaisons} />}
          </div>
          <Button
            aria-label={`打开${ariaLabel}编辑器`}
            // 正文还是空的时候没有东西可标注，编辑器打开也只是一块空画布，先置灰。
            disabled={readOnly || value.text.trim() === ""}
            // 实际发音只标连读，按钮就画那条弧；其余字段仍是语音编辑器的话筒。
            icon={mode === "actual-pron" ? <LiaisonIcon /> : <AudioOutlined />}
            onClick={() => setEditing(true)}
            style={{ height: "auto" }}
          />
        </Space.Compact>
      </>
    );
  }

  return (
    <div className="v3-voice-text-editor" style={{ minWidth: 0 }}>
      {feedbackHolder}
      <Suspense fallback={<div style={{ paddingBottom: 32 }}>{fallback}</div>}>
        <VoiceEditor<TLink>
          onAssociationPendingChange={onAssociationPendingChange}
          textReadOnly={presentation !== "editor"}
          mode={mode}
          locale={voiceLocale(dialect)}
          textLinks={textLinks}
          restoreTextLinksOnCorrection={restoreTextLinksOnCorrection}
          renderAssociationPicker={renderAssociationPicker}
          contextLabel={ariaLabel}
          inputDataAttributes={{
            "data-v3-node-id": nodeId,
            "data-v3-field": field
          }}
          language="en"
          placeholder={placeholder}
          onChange={(next: RichTextV2, nextLinks) => change(next, nextLinks)}
          previewAdapter={
            env.VOICE_PREVIEW ? adminVoicePreviewAdapter : undefined
          }
          previewIsMock={voicePreviewIsMock}
          onVoiceProfileChange={onVoiceProfileChange}
          // 开关关着 = 不注入适配器：面板置灰说明原因，已有的音频引用仍列出来。
          audioUploadAdapter={
            env.VOICE_AUDIO_UPLOAD && audioUploadEnabled
              ? adminAudioUploadAdapter
              : undefined
          }
          audioAssets={audioAssets ?? undefined}
          onAudioAssetsChange={onAudioAssetsChange}
          readOnly={readOnly}
          value={value}
          voiceProfile={voiceProfile}
        />
      </Suspense>
      {showDone && (
        <Space className="v3-voice-text-editor-done">
          <Button
            type="primary"
            size="small"
            aria-label={`完成${ariaLabel}编辑`}
            loading={doneLoading}
            disabled={doneDisabled}
            onClick={onDone ?? (() => setEditing(false))}
          >
            完成
          </Button>
        </Space>
      )}
    </div>
  );
}

/**
 * 输入框的排版逐项照抄到弧线层上，字母才落在同一个位置。边框宽度抄到外层，
 * 外层的内边距盒就是输入框的滚动视口；内边距抄到内层，它和文字一起滚。
 */
const MIRRORED_OUTER_STYLES = [
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "line-height",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "tab-size",
  "text-indent",
  "word-spacing"
] as const;
const MIRRORED_INNER_STYLES = [
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left"
] as const;

/**
 * 只留连读：弧线层只要两端锚点，语法结构加粗、停顿记号都会改字宽，和输入框错位。
 * 没有连读返回 undefined，收起态就不叠弧线层。
 */
function liaisonOnly(value: RichTextV3): RichTextV2 | undefined {
  const content = toRichTextV2(value);
  const annotations = content.annotations.filter(
    (annotation) => annotation.type === "liaison"
  );
  return annotations.length > 0 ? { ...content, annotations } : undefined;
}

/**
 * 收起态输入框上的连读弧：透明文字与输入框同排版，弧线按它量位置。
 *
 * 超过 maxRows 后输入框自己滚动：内层扣掉滚动条宽度（滚动条占宽的平台上不扣，折行位置
 * 就不同），并随 scrollTop 平移；外层按视口裁掉滚出去的弧线。
 * jsdom 不做布局，对齐与裁剪只能在真浏览器里量。
 */
function LiaisonOverlay({ value }: { value: RichTextV2 }) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [mirrored, setMirrored] = useState(false);
  // 先抄样式再挂只读视图：子组件的布局副作用先于父组件执行，样式没到位就量会量偏。
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const content = contentRef.current;
    const input = overlay?.parentElement?.querySelector("textarea");
    if (!overlay || !content || !input) return;
    const style = getComputedStyle(input);
    for (const property of MIRRORED_OUTER_STYLES) {
      overlay.style.setProperty(property, style.getPropertyValue(property));
    }
    for (const property of MIRRORED_INNER_STYLES) {
      content.style.setProperty(property, style.getPropertyValue(property));
    }
    // 视口底部那条内边距里只会露出下一行字上方的弧线（字还在视口外），裁剪线提到内容盒底边。
    overlay.style.borderBottomWidth = `${
      (Number.parseFloat(style.borderBottomWidth) || 0) +
      (Number.parseFloat(style.paddingBottom) || 0)
    }px`;
    const horizontalBorders =
      (Number.parseFloat(style.borderLeftWidth) || 0) +
      (Number.parseFloat(style.borderRightWidth) || 0);
    const follow = () => {
      // 内层自动撑满外层内容盒（即输入框内边距盒的精确宽度），只扣滚动条。不能拿 clientWidth
      // 当宽度：它是取整值，外框宽度带小数（英美双栏平分、系统缩放）时折行会对不上；
      // offsetWidth 与 clientWidth 取整方式一致，相减后误差抵消。
      const scrollbar = Math.max(
        0,
        Math.round(input.offsetWidth - input.clientWidth - horizontalBorders)
      );
      content.style.marginRight = `${scrollbar}px`;
      content.style.transform = `translateY(${-input.scrollTop}px)`;
    };
    follow();
    input.addEventListener("scroll", follow);
    // 输入框随内容增高、滚动条出现或消失，内容盒尺寸都会变。
    const observer = new ResizeObserver(follow);
    observer.observe(input);
    setMirrored(true);
    return () => {
      input.removeEventListener("scroll", follow);
      observer.disconnect();
    };
  }, []);
  return (
    <div ref={overlayRef} className="v3-voice-text-liaison-overlay" aria-hidden>
      <div ref={contentRef} className="v3-voice-text-liaison-content">
        {mirrored && <RichTextReadOnly value={value} />}
      </div>
    </div>
  );
}
