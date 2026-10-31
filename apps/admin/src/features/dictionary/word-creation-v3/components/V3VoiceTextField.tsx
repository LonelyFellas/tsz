import { useVoiceSave } from "../voiceSaveContext";
import { usePermission } from "@/lib/auth";
import { ConfigProvider } from "antd";
import { useContentEditPermissions } from "../../contentEditPermissions";
import type {
  AudioAssetLocaleV3,
  AudioAssetV3,
  Dialect,
  RichTextV2,
  RichTextV3,
  VoiceProfileV3,
  TextLinkV3,
  GrammarFormLinkV3
} from "@tsz/types";
import type {
  VoiceAssociation,
  VoiceEditorProps,
  VoiceEditResult
} from "@tsz/voice-editor/types";
import {
  editRichText,
  isVoiceRecommendationAvailable,
  normalizeSpellingRich,
  remapTextLinks,
  toRichTextV2,
  recommendationVoiceSetting
} from "@tsz/voice-editor/core";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { EditOutlined } from "@ant-design/icons";
import { flushSync } from "react-dom";
import { Alert, Button, Input, Space, message } from "antd";
import {
  type ReactNode,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  adminAudioUploadAdapter,
  adminVoicePreviewAdapter,
  loadAdminVoiceRecommendations,
  voicePreviewIsMock
} from "@/features/dictionary/voice-editor/dataSource";
import { env } from "@/lib/env";
// 样式随组件一起引入：V3 这条路径此前从没挂过语音编辑器，不引的话两层各画各的、完全错位。
import "@tsz/voice-editor/styles.css";
import "./V3VoiceTextField.css";
import { VoiceEditorModal } from "./VoiceEditorModal";

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

export interface V3VoiceTextFieldProps<
  TLink extends VoiceAssociation = TextLinkV3
> {
  onDone?: () => void;
  onCommit?: (result: VoiceEditResult<TLink>) => void;
  onSave?: () => Promise<boolean>;
  onCancel?: () => void;
  doneLoading?: boolean;
  doneDisabled?: boolean;
  /** 隐藏内部操作时，改动直接交给宿主草稿，由宿主统一保存或取消。 */
  showDone?: boolean;
  onEditingChange?: (editing: boolean) => void;
  onDraftPendingChange?: (pending: boolean) => void;
  onAssociationPendingChange?: (pending: boolean) => void;
  mode?: VoiceEditorProps<TLink>["mode"];
  recommendationArea?: VoiceEditorProps<TLink>["recommendationArea"];
  editingEnabled?: boolean;
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
  readingLinks?: GrammarFormLinkV3[];
  renderReadingPicker?: VoiceEditorProps<TLink>["renderReadingPicker"];
  createReadingPreviewAdapter?: (
    links: GrammarFormLinkV3[]
  ) => NonNullable<VoiceEditorProps<TLink>["previewAdapter"]>;
  previewAdapter?: VoiceEditorProps<TLink>["previewAdapter"];
  createPreviewAdapter?: (
    links: TLink[]
  ) => NonNullable<VoiceEditorProps<TLink>["previewAdapter"]>;
  value: RichTextV3;
  id?: string;
  ariaLabel: string;
  editorTitle?: ReactNode;
  nodeId: string;
  nodeAliases?: string;
  field: string;
  placeholder?: string;
  readOnly?: boolean;
  contentReadOnly?: boolean;
  associationsReadOnly?: boolean;
  invalid?: boolean;
  leadingAction?: ReactNode;
  trailingAction?: ReactNode;
  audioUploadEnabled?: boolean;
  /** 发音配置；与正文分开走，因为它在 wire 上是正文的兄弟字段。 */
  voiceProfile?: VoiceProfileV3 | null;
  onVoiceProfileChange?: (next: VoiceProfileV3) => void;
  /** 挂在这段文本上的真人录音；与 voice_profile 一样是正文的兄弟字段。 */
  audioAssets?: AudioAssetV3[] | null;
  onAudioAssetsChange?: (next: AudioAssetV3[]) => void;
  onChange: VoiceEditorProps<TLink>["onChange"];
  onAssociationsChange?: (textLinks: TLink[]) => void;
}

// 错误定位属性仅挂在当前编辑入口，避免弹窗与页面出现重复锚点。
export function V3VoiceTextField<TLink extends VoiceAssociation = TextLinkV3>({
  onDone,
  onCommit,
  onSave,
  onCancel,
  doneLoading,
  doneDisabled,
  showDone = true,
  onEditingChange,
  onDraftPendingChange,
  onAssociationPendingChange,
  mode,
  recommendationArea,
  editingEnabled = true,
  presentation = "field",
  dialect,
  textLinks,
  restoreTextLinksOnCorrection,
  renderAssociationPicker,
  readingLinks,
  renderReadingPicker,
  createReadingPreviewAdapter,
  previewAdapter,
  createPreviewAdapter,
  value,
  id,
  ariaLabel,
  editorTitle,
  nodeId,
  nodeAliases,
  field,
  placeholder,
  readOnly: requestedReadOnly,
  contentReadOnly: requestedContentReadOnly,
  associationsReadOnly: requestedAssociationsReadOnly,
  invalid,
  leadingAction,
  trailingAction,
  audioUploadEnabled = mode !== "association",
  voiceProfile,
  onVoiceProfileChange,
  audioAssets,
  onAudioAssetsChange,
  onChange,
  onAssociationsChange
}: V3VoiceTextFieldProps<TLink>) {
  const businessSave = useVoiceSave();
  const saveRef = useRef({ onSave, businessSave });
  useLayoutEffect(() => {
    saveRef.current = { onSave, businessSave };
  });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [failure, setFailure] = useState<{ target: string; message: string }>();
  const saveError = failure?.target === nodeId ? failure.message : "";
  const setSaveError = (message: string) =>
    setFailure({ target: nodeId, message });
  const [savedTarget, setSavedTarget] = useState<string | null>(null);
  const saved = savedTarget === nodeId;
  const activeTarget = useRef<string | null>(nodeId);
  useLayoutEffect(() => {
    activeTarget.current = nodeId;
    return () => {
      activeTarget.current = null;
    };
  }, [nodeId]);
  const canUploadAudio = usePermission("speech.upload_audio");
  const permissions = useContentEditPermissions();
  const contentReadOnly = requestedContentReadOnly ?? !permissions.edit;
  const associationsReadOnly =
    requestedAssociationsReadOnly ?? !permissions.associate;
  const readOnly =
    requestedReadOnly ||
    (contentReadOnly && (!renderAssociationPicker || associationsReadOnly));
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState(false);
  const [recorded, setRecorded] = useState(value.text.length > 0);
  const initialVoiceState = useRef({
    nodeId,
    unconfigured: !value.text.trim() && voiceProfile == null
  });
  if (initialVoiceState.current.nodeId !== nodeId)
    initialVoiceState.current = {
      nodeId,
      unconfigured: !value.text.trim() && voiceProfile == null
    };
  const area =
    recommendationArea ??
    (mode === "spelling"
      ? "word"
      : mode === "grammar"
        ? "grammar"
        : mode === "association"
          ? "example"
          : mode === "synthesis"
            ? "azure"
            : mode === "actual-pron" || mode === "dict-phonetic"
              ? undefined
              : "meaning");
  const textRole =
    area === "meaning" ? "definition" : area === "example" ? "example" : "body";
  const locale = voiceLocale(dialect);
  const prepareDefault =
    env.VOICE_EDITOR &&
    editingEnabled &&
    presentation === "field" &&
    !editing &&
    !readOnly &&
    !contentReadOnly &&
    initialVoiceState.current.unconfigured &&
    voiceProfile == null &&
    !!onVoiceProfileChange &&
    !!area;
  const defaultKey = JSON.stringify([nodeId, area, locale]);
  const [defaultVoice, setDefaultVoice] = useState<{
    key: string;
    profile?: VoiceProfileV3;
    error?: string;
  }>();
  const defaultLoading = prepareDefault && defaultVoice?.key !== defaultKey;
  useEffect(() => {
    if (!prepareDefault || !area) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const items = await loadAdminVoiceRecommendations({
          area,
          locale,
          signal: controller.signal
        });
        const accents = (["en-GB", "en-US"] as const).filter(
          (accent) =>
            (!locale || accent === locale) &&
            items.some((item) => item.locale === accent)
        );
        const voices = accents.length
          ? await (previewAdapter ?? adminVoicePreviewAdapter).listVoices({
              language: "en",
              signal: controller.signal
            })
          : [];
        if (controller.signal.aborted) return;
        const usable = accents
          .map((accent) =>
            items.find(
              (item) =>
                item.selected !== false &&
                item.locale === accent &&
                isVoiceRecommendationAvailable(item, voices, accent)
            )
          )
          .filter((item) => item !== undefined);
        setDefaultVoice({
          key: defaultKey,
          profile: {
            dubbing: {
              mode: "inherit",
              pool_version: "provider_id_v1",
              area,
              recommendation_order: usable.map((item) => item.id)
            },
            voices: usable.map((item) =>
              recommendationVoiceSetting(item, voices)
            )
          },
          error:
            usable.length < accents.length
              ? "部分首位推荐已失效，请打开编辑器选择其他音色。"
              : undefined
        });
      } catch {
        if (!controller.signal.aborted)
          setDefaultVoice({
            key: defaultKey,
            error: "默认配音加载失败，可继续输入并打开编辑器选择音色。"
          });
      }
    })();
    return () => controller.abort();
  }, [prepareDefault, area, locale, defaultKey, previewAdapter]);
  useEffect(() => {
    if (!editing && !focused && !value.text) setRecorded(false);
  }, [editing, focused, value.text]);
  const [editorSession, setEditorSession] = useState(0);
  const captureSession = useCallback(
    () =>
      structuredClone({
        nodeId,
        value,
        textLinks,
        readingLinks,
        voiceProfile,
        audioAssets
      }),
    [nodeId, value, textLinks, readingLinks, voiceProfile, audioAssets]
  );
  const [draftState, setDraftState] = useState(captureSession);
  const incomingKey = JSON.stringify({
    nodeId,
    value,
    textLinks,
    readingLinks,
    voiceProfile,
    audioAssets
  });
  const incomingRef = useRef(incomingKey);
  useEffect(() => {
    if (incomingRef.current === incomingKey) return;
    incomingRef.current = incomingKey;
    const next = captureSession();
    setDraftState(next);
  }, [incomingKey, captureSession]);
  const editorState = showDone
    ? draftState
    : { nodeId, value, textLinks, readingLinks, voiceProfile, audioAssets };
  const sessionPreviewAdapter = useMemo(
    () =>
      createReadingPreviewAdapter?.(editorState.readingLinks ?? []) ??
      createPreviewAdapter?.(editorState.textLinks ?? []) ??
      previewAdapter,
    [
      createReadingPreviewAdapter,
      editorState.readingLinks,
      createPreviewAdapter,
      editorState.textLinks,
      previewAdapter
    ]
  );
  const draftPending = JSON.stringify(draftState) !== incomingKey;
  useEffect(() => {
    if (!showDone) return;
    onDraftPendingChange?.(draftPending);
    return () => onDraftPendingChange?.(false);
  }, [draftPending, onDraftPendingChange, showDone]);
  const callbacks = useRef({
    onCommit,
    onChange,
    onAssociationsChange,
    onVoiceProfileChange,
    onAudioAssetsChange
  });
  useLayoutEffect(() => {
    callbacks.current = {
      onCommit,
      onChange,
      onAssociationsChange,
      onVoiceProfileChange,
      onAudioAssetsChange
    };
  });
  const cancelEditing = () => {
    if (doneLoading || savingRef.current) return;
    setDraftState(captureSession());
    history.current.past = [];
    history.current.future = [];
    setEditing(false);
    setEditorSession((current) => current + 1);
    onAssociationPendingChange?.(false);
    onCancel?.();
  };
  const completeEditing = async (
    capture?: (forSave?: boolean) => VoiceEditResult<TLink>
  ) => {
    if (
      savingRef.current ||
      doneLoading ||
      doneDisabled ||
      readOnly ||
      draftState.nodeId !== nodeId
    )
      return;
    const target = nodeId;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    setSavedTarget(null);
    try {
      const captured = (onCommit || onSave || businessSave
        ? capture?.(!!(onSave || businessSave))
        : undefined) ?? {
        ...draftState,
        value:
          draftState.value.version === 2
            ? draftState.value
            : toRichTextV2(draftState.value),
        audioAssets: draftState.audioAssets ?? undefined
      };
      const result = contentReadOnly
        ? {
            ...captured,
            value,
            readingLinks,
            voiceProfile,
            audioAssets: audioAssets ?? undefined
          }
        : captured;
      const next = { ...draftState, ...result, nodeId: target };
      if (callbacks.current.onCommit) {
        flushSync(() => callbacks.current.onCommit!(result));
      } else {
        // 宿主回调可能捕获旧表单，逐项刷新闭包，避免正文、音色和录音互相覆盖。
        if (
          JSON.stringify([value, textLinks, readingLinks]) !==
          JSON.stringify([next.value, next.textLinks, next.readingLinks])
        ) {
          flushSync(() =>
            contentReadOnly
              ? callbacks.current.onAssociationsChange?.(next.textLinks ?? [])
              : readingLinks !== undefined || renderReadingPicker
                ? callbacks.current.onChange(
                    toRichTextV2(next.value),
                    next.textLinks,
                    next.readingLinks
                  )
                : callbacks.current.onChange(
                    toRichTextV2(next.value),
                    next.textLinks
                  )
          );
        }
        if (
          JSON.stringify(voiceProfile) !== JSON.stringify(next.voiceProfile)
        ) {
          flushSync(() =>
            callbacks.current.onVoiceProfileChange?.(
              next.voiceProfile ?? { voices: [] }
            )
          );
        }
        if (JSON.stringify(audioAssets) !== JSON.stringify(next.audioAssets)) {
          flushSync(() =>
            callbacks.current.onAudioAssetsChange?.(next.audioAssets ?? [])
          );
        }
      }
      const persist =
        saveRef.current.onSave ??
        (saveRef.current.businessSave
          ? () => saveRef.current.businessSave!.save(area)
          : undefined);
      if (persist && !(await persist())) {
        if (activeTarget.current !== target) return;
        setSaveError(
          "保存未完成，全部修改已保留；请处理业务校验或版本冲突后重试。"
        );
        return;
      }
      if (activeTarget.current !== target) return;
      setDraftState(next);
      setSavedTarget(persist ? target : null);
      if (onDone) onDone();
      else if (showDone) setEditing(false);
    } catch (error) {
      if (activeTarget.current !== target) return;
      setSaveError(
        error instanceof Error
          ? error.message
          : "保存失败，全部修改已保留，请重试"
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const expanded = env.VOICE_EDITOR && (presentation === "editor" || editing);
  // 缓存住：每次渲染都新建对象会让弧线层跟着重量一遍。
  const liaisons = useMemo(
    () => (mode !== "dict-phonetic" ? liaisonOnly(value) : undefined),
    [mode, value]
  );
  useEffect(() => {
    onEditingChange?.(expanded);
    if (!expanded) onAssociationPendingChange?.(false);
  }, [expanded, onEditingChange, onAssociationPendingChange]);
  const [feedback, feedbackHolder] = message.useMessage();
  type Snapshot = {
    value: RichTextV3;
    links: typeof textLinks;
    readingLinks?: GrammarFormLinkV3[];
  };
  const history = useRef<{
    past: Snapshot[];
    future: Snapshot[];
    expected: string;
  }>({
    past: [],
    future: [],
    expected: JSON.stringify([
      nodeId,
      value,
      textLinks ?? [],
      readingLinks ?? []
    ])
  });
  useEffect(() => {
    const key = JSON.stringify([
      nodeId,
      value,
      textLinks ?? [],
      readingLinks ?? []
    ]);
    if (key !== history.current.expected) {
      history.current = { past: [], future: [], expected: key };
    }
  }, [nodeId, value, textLinks, readingLinks]);
  const publish = (
    next: RichTextV3,
    links: typeof textLinks,
    nextReadingLinks = readingLinks
  ) => {
    const nextLinks = mode === "association" ? (links ?? []) : links;
    history.current.expected = JSON.stringify([
      nodeId,
      toRichTextV2(next),
      nextLinks ?? [],
      nextReadingLinks ?? []
    ]);
    if (readingLinks !== undefined || renderReadingPicker)
      onChange(toRichTextV2(next), nextLinks, nextReadingLinks);
    else onChange(toRichTextV2(next), nextLinks);
  };
  const change: VoiceEditorProps<TLink>["onChange"] = (
    next,
    links,
    nextReadingLinks = readingLinks
  ) => {
    if (readOnly) return;
    history.current.past = [
      ...history.current.past.slice(-99),
      { value, links: textLinks, readingLinks }
    ];
    history.current.future = [];
    const profile =
      prepareDefault && defaultVoice?.key === defaultKey && next.text.trim()
        ? defaultVoice.profile
        : undefined;
    if (profile) {
      initialVoiceState.current.unconfigured = false;
      // 正文先回灌父草稿，再用刷新后的回调写音色，避免两次更新互相覆盖。
      flushSync(() => publish(next, links, nextReadingLinks));
      callbacks.current.onVoiceProfileChange?.(structuredClone(profile));
    } else publish(next, links, nextReadingLinks);
  };
  const restore = (redo: boolean) => {
    if (readOnly) return;
    const source = redo ? history.current.future : history.current.past;
    const snapshot = source.pop();
    if (!snapshot) return;
    const destination = redo ? history.current.past : history.current.future;
    destination.push({ value, links: textLinks, readingLinks });
    publish(snapshot.value, snapshot.links, snapshot.readingLinks);
  };
  const fontClass =
    mode === "grammar" || mode === "spelling"
      ? "tsz-words"
      : mode === "dict-phonetic" || mode === "actual-pron"
        ? "tsz-phonetics"
        : "tsz-entry-en";
  const largePreview =
    mode === "grammar" || mode === "association" || mode === "actual-pron";
  const associationPreview =
    mode === "association" &&
    toRichTextV2(value).annotations.some(
      (annotation) =>
        annotation.type === "bold" ||
        annotation.type === "italic" ||
        annotation.type === "underline"
    );
  const grammarPreview =
    (mode === "grammar" || mode === "spelling" || associationPreview) &&
    (!focused ||
      readOnly ||
      (env.VOICE_EDITOR && editingEnabled && recorded)) &&
    value.text !== "";
  const fallback = (
    <Input.TextArea
      id={expanded ? undefined : id}
      key={largePreview ? "large" : "standard"}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        if (mode === "spelling" && !expanded && !readOnly) {
          const normalized = normalizeSpellingRich(toRichTextV2(value));
          if (normalized.text !== value.text) {
            change(normalized, textLinks);
            if (
              normalized.annotations.length <
              toRichTextV2(value).annotations.length
            )
              void feedback.info("已规范化拼写并移除受影响的标注，可撤销恢复");
          }
        }
        setFocused(false);
        if (value.text.trim()) setRecorded(true);
      }}
      aria-label={expanded ? `${ariaLabel}预览` : ariaLabel}
      aria-invalid={invalid}
      status={invalid ? "error" : undefined}
      // 无连读时用自然高度；有连读时显式设置最小行数。
      // 单改 padding 不会触发 antd autoSize，须切换 minRows，确保只增删标记也重测且不重挂输入框。
      autoSize={{
        minRows: liaisons ? (largePreview ? 1 : 2) : undefined,
        maxRows: 6
      }}
      style={
        liaisons
          ? { paddingTop: mode === "grammar" ? "calc(4px + 0.5em)" : "1em" }
          : undefined
      }
      className={`word-pronunciation-phonetic-input ${fontClass}${mode === "actual-pron" ? " tsz-actual-pronunciation" : ""}${largePreview ? " v3-voice-text-large-preview" : ""}${mode === "grammar" ? " v3-grammar-input" : ""}`}
      data-v3-field={expanded ? undefined : field}
      data-v3-node-id={expanded ? undefined : nodeId}
      data-v3-node-aliases={expanded ? undefined : nodeAliases}
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
        if (
          readOnly ||
          contentReadOnly ||
          defaultLoading ||
          (env.VOICE_EDITOR && editingEnabled && (recorded || expanded))
        )
          return;
        const inputType = (event.nativeEvent as InputEvent).inputType;
        if (inputType === "historyUndo" || inputType === "historyRedo") {
          restore(inputType === "historyRedo");
          return;
        }
        const next = editRichText(value, event.target.value);
        const links =
          mode === "association" || textLinks !== undefined
            ? remapTextLinks(value.text, event.target.value, textLinks ?? [])
            : undefined;
        const removed =
          (textLinks?.length ?? 0) > (links?.length ?? 0) ||
          toRichTextV2(value).annotations.length > next.annotations.length;
        change(
          next,
          links,
          readingLinks
            ? remapTextLinks(value.text, event.target.value, readingLinks)
            : undefined
        );
        if (removed)
          void feedback.info("已移除受改字影响的关联或标注，可撤销恢复");
      }}
      placeholder={placeholder}
      aria-busy={defaultLoading || undefined}
      readOnly={
        readOnly ||
        contentReadOnly ||
        defaultLoading ||
        (env.VOICE_EDITOR && editingEnabled && (recorded || expanded))
      }
      value={value.text}
    />
  );

  // textarea 始终保留：Tab、错误定位 focus()、撤销和改字重映射仍走原来的输入路径。
  const collapsedField = (
    <div
      className={`v3-voice-text-field-input${grammarPreview ? " v3-grammar-preview" : ""}`}
    >
      {fallback}
      {grammarPreview ? (
        <div
          className={`v3-grammar-preview-content ${fontClass}${mode === "association" ? " v3-association-preview-content" : ""}`}
          aria-hidden
        >
          <RichTextReadOnly
            textRole={textRole}
            value={
              value.version === 2
                ? {
                    ...value,
                    annotations: value.annotations.filter(
                      (annotation) => annotation.type !== "pause"
                    )
                  }
                : value
            }
          />
        </div>
      ) : mode !== "grammar" && liaisons ? (
        <LiaisonOverlay value={liaisons} />
      ) : null}
    </div>
  );

  if (!env.VOICE_EDITOR || !editingEnabled)
    return (
      <>
        {feedbackHolder}
        {leadingAction || trailingAction ? (
          <Space.Compact block className="v3-voice-text-field-compact">
            {leadingAction}
            {mode === "grammar" || mode === "spelling" || associationPreview
              ? collapsedField
              : fallback}
            {trailingAction}
          </Space.Compact>
        ) : mode === "grammar" || mode === "spelling" || associationPreview ? (
          collapsedField
        ) : (
          fallback
        )}
      </>
    );

  const fieldView = (
    <ConfigProvider
      componentDisabled={
        contentReadOnly && !associationsReadOnly ? false : undefined
      }
    >
      <Space.Compact block className="v3-voice-text-field-compact">
        {leadingAction}
        {collapsedField}
        {trailingAction}
        <Button
          aria-label={`打开${ariaLabel}编辑器`}
          disabled={readOnly}
          icon={<EditOutlined />}
          onClick={() => {
            setDraftState(captureSession());
            setSaveError("");
            setRecorded(true);
            setEditing(true);
          }}
          style={{ height: "auto" }}
        />
      </Space.Compact>
    </ConfigProvider>
  );

  const renderActions = (
    canComplete: boolean,
    prepareComplete: () => boolean = () => true,
    captureResult?: (forSave?: boolean) => VoiceEditResult<TLink>
  ) =>
    showDone || onSave ? (
      <>
        {!showDone && (
          <EditorPendingState
            pending={!canComplete}
            onChange={onDraftPendingChange}
          />
        )}
        <Space className="v3-voice-text-editor-done" size={6}>
          {showDone && (
            <Button
              size="small"
              aria-label={`取消${ariaLabel}编辑`}
              disabled={doneLoading || saving}
              onClick={cancelEditing}
            >
              取消
            </Button>
          )}
          <Button
            type="primary"
            size="small"
            aria-label={
              businessSave || onSave
                ? `保存${ariaLabel}修改`
                : `完成${ariaLabel}编辑`
            }
            loading={doneLoading || saving}
            disabled={doneDisabled || readOnly || !canComplete}
            onClick={() => {
              if (prepareComplete()) void completeEditing(captureResult);
            }}
          >
            {businessSave || onSave ? "保存修改" : "完成"}
          </Button>
        </Space>
      </>
    ) : (
      <EditorPendingState
        pending={!canComplete}
        onChange={onDraftPendingChange}
      />
    );
  const editor = (
    <ConfigProvider
      componentDisabled={
        contentReadOnly && !associationsReadOnly ? false : undefined
      }
    >
      <div className="v3-voice-text-editor" style={{ minWidth: 0 }}>
        {feedbackHolder}
        {saveError && <Alert type="error" showIcon title={saveError} />}
        {saving && <span role="status">正在保存修改…</span>}
        {saved && <span role="status">修改已保存为草稿</span>}
        <Suspense
          fallback={<div style={{ paddingBottom: 32 }}>{fallback}</div>}
        >
          <VoiceEditor<TLink>
            key={`${nodeId}:${editorSession}`}
            renderActions={renderActions}
            onAssociationPendingChange={onAssociationPendingChange}
            textReadOnly={contentReadOnly}
            contentReadOnly={contentReadOnly}
            associationsReadOnly={associationsReadOnly}
            mode={mode}
            textRole={textRole}
            autoRecommend={initialVoiceState.current.unconfigured}
            loadRecommendations={loadAdminVoiceRecommendations}
            recommendationArea={area}
            textFormattingEnabled={env.SENTENCE_FORMATTING}
            locale={voiceLocale(dialect)}
            textLinks={editorState.textLinks}
            restoreTextLinksOnCorrection={restoreTextLinksOnCorrection}
            renderAssociationPicker={renderAssociationPicker}
            readingLinks={editorState.readingLinks}
            renderReadingPicker={renderReadingPicker}
            contextLabel={ariaLabel}
            inputDataAttributes={{
              "data-v3-node-id": nodeId,
              "data-v3-field": field,
              ...(nodeAliases ? { "data-v3-node-aliases": nodeAliases } : {})
            }}
            language="en"
            placeholder={placeholder}
            onChange={(next: RichTextV2, nextLinks, nextReadingLinks) => {
              if (readOnly) return;
              if (!showDone) {
                if (contentReadOnly) onAssociationsChange?.(nextLinks ?? []);
                else if (readingLinks !== undefined || renderReadingPicker)
                  onChange(next, nextLinks, nextReadingLinks);
                else onChange(next, nextLinks);
              } else
                setDraftState((current) => ({
                  ...current,
                  value: contentReadOnly ? current.value : next,
                  textLinks: nextLinks,
                  readingLinks: contentReadOnly
                    ? current.readingLinks
                    : nextReadingLinks
                }));
            }}
            previewAdapter={sessionPreviewAdapter ?? adminVoicePreviewAdapter}
            previewEnabled={env.VOICE_PREVIEW}
            previewIsMock={voicePreviewIsMock}
            onVoiceProfileChange={(next) => {
              if (readOnly || contentReadOnly) return;
              if (!showDone) onVoiceProfileChange?.(next);
              else
                setDraftState((current) => ({
                  ...current,
                  voiceProfile: next
                }));
            }}
            // 开关关着 = 不注入适配器：面板置灰说明原因，已有的音频引用仍列出来。
            audioUploadAllowed={canUploadAudio}
            audioUploadAdapter={
              env.VOICE_AUDIO_UPLOAD && audioUploadEnabled
                ? adminAudioUploadAdapter
                : undefined
            }
            audioAssets={editorState.audioAssets ?? undefined}
            onAudioAssetsChange={(next) => {
              if (readOnly || contentReadOnly) return;
              if (!showDone) onAudioAssetsChange?.(next);
              else
                setDraftState((current) => ({ ...current, audioAssets: next }));
            }}
            readOnly={readOnly || saving}
            value={editorState.value}
            voiceProfile={editorState.voiceProfile}
          />
        </Suspense>
      </div>
    </ConfigProvider>
  );

  if (presentation === "editor") return editor;
  return (
    <>
      {fieldView}
      {saved && !editing && <span role="status">修改已保存为草稿</span>}
      {defaultLoading && <span role="status">正在加载默认配音…</span>}
      {!editing && defaultVoice?.key === defaultKey && defaultVoice.error && (
        <Alert type="warning" showIcon title={defaultVoice.error} />
      )}
      {editing && (
        <VoiceEditorModal
          {...(area ? { width: 1200 } : {})}
          title={editorTitle ?? `编辑${ariaLabel}`}
          open={editing}
          footer={null}
          onCancel={cancelEditing}
          closable={!doneLoading && !saving}
          keyboard={!doneLoading && !saving && !draftPending}
        >
          {editor}
        </VoiceEditorModal>
      )}
    </>
  );
}

// renderActions 在子编辑器渲染时调用，提交限制通过 effect 通知宿主。
function EditorPendingState({
  pending,
  onChange
}: {
  pending: boolean;
  onChange?: (pending: boolean) => void;
}) {
  useEffect(() => {
    onChange?.(pending);
    return () => onChange?.(false);
  }, [pending, onChange]);
  return null;
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
      const currentStyle = getComputedStyle(input);
      overlay.style.setProperty(
        "--v3-voice-text-liaison-color",
        currentStyle.color
      );
      for (const property of MIRRORED_OUTER_STYLES) {
        overlay.style.setProperty(
          property,
          currentStyle.getPropertyValue(property)
        );
      }
      overlay.style.borderBottomWidth = `${(Number.parseFloat(currentStyle.borderBottomWidth) || 0) + (Number.parseFloat(currentStyle.paddingBottom) || 0)}px`;
      for (const property of MIRRORED_INNER_STYLES) {
        content.style.setProperty(
          property,
          currentStyle.getPropertyValue(property)
        );
      }
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
  }, [value]);
  return (
    <div ref={overlayRef} className="v3-voice-text-liaison-overlay" aria-hidden>
      <div ref={contentRef} className="v3-voice-text-liaison-content">
        {mirrored && <RichTextReadOnly value={value} />}
      </div>
    </div>
  );
}
