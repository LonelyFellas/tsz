import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  Alert,
  Button,
  Collapse,
  Drawer,
  Flex,
  Input,
  Popover,
  Select,
  Space,
  Spin,
  Typography
} from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RichTextHighlightColor, RichTextV2 } from "@tsz/types";
import {
  buildSsmlPreview,
  canonicalVoiceHash,
  RichTextValidationError,
  toRichTextV2
} from "../core";
import { RichTextReadOnly } from "../reader";
import type {
  VoiceOption,
  VoicePreviewResult,
  VoiceRichTextEditorProps,
  VoiceSettings
} from "../types";
import {
  EmphasisMark,
  HighlightMark,
  LiaisonMark,
  PauseNode,
  PhonemeMark
} from "./extensions";
import { editorJsonToRichTextV2, richTextToEditorJson } from "./mapping";

const PAUSE_OPTIONS = [200, 300, 500, 800, 1000];
const RATE_OPTIONS = [-10, -5, 0, 5, 10];
const PITCH_OPTIONS = [-2, -1, 0, 1, 2];
const HIGHLIGHTS: Array<{
  color: RichTextHighlightColor;
  hex: string;
  label: string;
}> = [
  { color: "yellow", hex: "#fde047", label: "黄色高亮" },
  { color: "green", hex: "#86efac", label: "绿色高亮" },
  { color: "pink", hex: "#f9a8d4", label: "粉色高亮" },
  { color: "blue", hex: "#93c5fd", label: "蓝色高亮" },
  { color: "orange", hex: "#fdba74", label: "橙色高亮" }
];

function errorMessage(error: unknown): string {
  if (error instanceof RichTextValidationError) return error.message;
  return error instanceof Error ? error.message : "操作失败，请重试";
}

function defaultVoiceSettings(voices: VoiceOption[]): VoiceSettings {
  const voice = voices.find((item) => item.isDefault) ?? voices[0];
  return {
    voiceId: voice?.id ?? "",
    ratePercent: defaultRangeValue(voice?.rateRange),
    pitchSemitones: defaultRangeValue(voice?.pitchRange)
  };
}

function defaultRangeValue(
  range: VoiceOption["rateRange"] | VoiceOption["pitchRange"]
): number | undefined {
  if (!range) return undefined;
  return range.min <= 0 && 0 <= range.max ? 0 : range.min;
}

function withinRange(
  value: number | undefined,
  range: VoiceOption["rateRange"] | VoiceOption["pitchRange"]
): boolean {
  return Boolean(
    value !== undefined && range && range.min <= value && value <= range.max
  );
}

function controlledOptions(
  presets: readonly number[],
  range: VoiceOption["rateRange"] | VoiceOption["pitchRange"]
): number[] {
  if (!range) return [];
  return [...new Set([...presets, range.min, range.max])]
    .filter((value) => Number.isInteger(value) && withinRange(value, range))
    .sort((left, right) => left - right);
}

export function VoiceRichTextEditor({
  open,
  value,
  language = "en",
  contextLabel = "语音富文本",
  pronunciationHints = {},
  previewAdapter,
  readOnly = false,
  onApply,
  onCancel,
  onDirtyChange,
  confirmDiscard
}: VoiceRichTextEditorProps) {
  const initialValue = useMemo(() => toRichTextV2(value), [value]);
  const [workingValue, setWorkingValue] = useState<RichTextV2>(initialValue);
  const [dirty, setDirty] = useState(false);
  const [selectionText, setSelectionText] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [pauseDuration, setPauseDuration] = useState(300);
  const [selectedPause, setSelectedPause] = useState<number>();
  const [customPause, setCustomPause] = useState("");
  const [phonemeOpen, setPhonemeOpen] = useState(false);
  const [phonemeInput, setPhonemeInput] = useState("");
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [settings, setSettings] = useState<VoiceSettings>({ voiceId: "" });
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewResult, setPreviewResult] = useState<VoicePreviewResult>();
  const [previewHash, setPreviewHash] = useState("");
  const [previewStatus, setPreviewStatus] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);
  const previewRequestHashRef = useRef("");
  const previewResultRef = useRef<VoicePreviewResult | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const printCleanupRef = useRef<(() => void) | null>(null);
  const initialSerializedRef = useRef(JSON.stringify(initialValue));

  const updateDirty = useCallback(
    (next: RichTextV2) => {
      const nextDirty = JSON.stringify(next) !== initialSerializedRef.current;
      setDirty(nextDirty);
      onDirtyChange?.(nextDirty);
    },
    [onDirtyChange]
  );

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      UndoRedo,
      EmphasisMark,
      PhonemeMark,
      LiaisonMark,
      HighlightMark,
      PauseNode
    ],
    content: richTextToEditorJson(initialValue),
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => {
      try {
        const next = editorJsonToRichTextV2(current.getJSON());
        setWorkingValue(next);
        updateDirty(next);
        setValidationMessage("");
      } catch (error) {
        setDirty(true);
        onDirtyChange?.(true);
        setValidationMessage(errorMessage(error));
      }
    },
    onSelectionUpdate: ({ editor: current }) => {
      const selection = current.state.selection;
      setSelectionText(
        current.state.doc.textBetween(selection.from, selection.to, " ").trim()
      );
      setSelectedPause(
        selection instanceof NodeSelection &&
          selection.node.type.name === "voicePause"
          ? Number(selection.node.attrs.durationMs)
          : undefined
      );
    },
    onTransaction: ({ editor: current }) => {
      setCanUndo(current.can().undo());
      setCanRedo(current.can().redo());
    }
  });

  const stopPreviewMedia = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    previewResultRef.current?.dispose?.();
    previewResultRef.current = null;
  }, []);

  const clearExpiryTimer = useCallback(() => {
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    expiryTimerRef.current = null;
  }, []);

  const cleanupPreview = useCallback(() => {
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    clearExpiryTimer();
    stopPreviewMedia();
  }, [clearExpiryTimer, stopPreviewMedia]);

  const discardPreviewResult = useCallback(() => {
    clearExpiryTimer();
    stopPreviewMedia();
    setPreviewResult(undefined);
    setPreviewHash("");
  }, [clearExpiryTimer, stopPreviewMedia]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (open) return;
    cleanupPreview();
    setPreviewResult(undefined);
    setPreviewHash("");
    setPreviewBusy(false);
  }, [cleanupPreview, open]);

  useEffect(() => {
    if (!open || !editor) return;
    const next = toRichTextV2(value);
    initialSerializedRef.current = JSON.stringify(next);
    setWorkingValue(next);
    editor.commands.setContent(richTextToEditorJson(next), {
      emitUpdate: false
    });
    setDirty(false);
    onDirtyChange?.(false);
    setValidationMessage("");
    setSelectionText("");
    setSelectedPause(undefined);
    cleanupPreview();
    setPreviewResult(undefined);
    setPreviewHash("");
    setPreviewStatus("");
  }, [cleanupPreview, editor, onDirtyChange, open, value]);

  useEffect(() => {
    if (!open || !previewAdapter) {
      setVoices([]);
      setSettings({ voiceId: "" });
      return;
    }
    const controller = new AbortController();
    setVoicesLoading(true);
    previewAdapter
      .listVoices({ language, signal: controller.signal })
      .then((items) => {
        if (controller.signal.aborted) return;
        setVoices(items);
        setSettings(defaultVoiceSettings(items));
        setPreviewStatus(items.length > 0 ? "" : "暂无可用发音人");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setPreviewStatus(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setVoicesLoading(false);
      });
    return () => controller.abort();
  }, [language, open, previewAdapter]);

  useEffect(
    () => () => {
      cleanupPreview();
      printCleanupRef.current?.();
    },
    [cleanupPreview]
  );

  const activeVoice = voices.find((voice) => voice.id === settings.voiceId);
  const currentHash = useMemo(
    () => canonicalVoiceHash(workingValue, settings),
    [settings, workingValue]
  );
  const previewStale = Boolean(previewHash && previewHash !== currentHash);
  const previewExpired = Boolean(
    previewResult &&
    Number.isFinite(Date.parse(previewResult.expiresAt)) &&
    Date.parse(previewResult.expiresAt) <= Date.now()
  );
  const ssml = useMemo(() => {
    try {
      return buildSsmlPreview(workingValue, {
        ...settings,
        voiceId: settings.voiceId || "preview",
        locale: activeVoice?.locale ?? "en-US"
      });
    } catch (error) {
      return errorMessage(error);
    }
  }, [activeVoice?.locale, settings, workingValue]);

  useEffect(() => {
    const controller = previewAbortRef.current;
    if (!controller || previewRequestHashRef.current === currentHash) return;
    controller.abort();
    previewAbortRef.current = null;
    setPreviewBusy(false);
    setPreviewStatus("内容或语音参数已变化，请重新生成试听");
  }, [currentHash]);

  useEffect(() => {
    if (!previewStale && !previewExpired) return;
    discardPreviewResult();
    setPreviewStatus(
      previewExpired
        ? "试听已过期，请重新生成"
        : "内容或语音参数已变化，请重新生成试听"
    );
  }, [discardPreviewResult, previewExpired, previewStale]);

  useEffect(() => {
    clearExpiryTimer();
    if (!previewResult || previewStale) return;
    const expiresIn = Date.parse(previewResult.expiresAt) - Date.now();
    const expire = () => {
      discardPreviewResult();
      setPreviewStatus("试听已过期，请重新生成");
    };
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) expire();
    else expiryTimerRef.current = setTimeout(expire, expiresIn);
    return clearExpiryTimer;
  }, [clearExpiryTimer, discardPreviewResult, previewResult, previewStale]);

  const hasSelection = Boolean(selectionText);

  const setHighlight = (color: RichTextHighlightColor) => {
    // The matching toolbar control is disabled until both invariants hold.
    /* v8 ignore next */
    if (!editor || !hasSelection) return;
    const attributes = editor.getAttributes("voiceHighlight");
    const chain = editor.chain().focus();
    if (editor.isActive("voiceHighlight") && attributes.color === color) {
      chain.unsetMark("voiceHighlight").run();
    } else {
      chain.setMark("voiceHighlight", { color }).run();
    }
  };

  const openPhoneme = () => {
    // The IPA popover trigger is disabled until both invariants hold.
    /* v8 ignore next */
    if (!editor || !hasSelection) return;
    const current = String(editor.getAttributes("phoneme").phoneme ?? "");
    const hint = pronunciationHints[selectionText.toLowerCase()] ?? "";
    setPhonemeInput(current || hint);
    setPhonemeOpen(true);
  };

  const applyPhoneme = () => {
    // The apply action only exists inside a popover opened by openPhoneme.
    /* v8 ignore next */
    if (!editor) return;
    const phoneme = phonemeInput.trim();
    const chain = editor.chain().focus();
    if (phoneme) chain.setMark("phoneme", { phoneme }).run();
    else chain.unsetMark("phoneme").run();
    setPhonemeOpen(false);
  };

  const updatePause = (raw: string | number) => {
    // Pause controls only render for a TipTap NodeSelection.
    /* v8 ignore next */
    if (!editor) return;
    const durationMs = Number(raw);
    if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > 5000) {
      setValidationMessage("停顿时长必须是 1–5000ms 的整数");
      return;
    }
    editor.chain().focus().updateAttributes("voicePause", { durationMs }).run();
    setSelectedPause(durationMs);
    setCustomPause("");
    setValidationMessage("");
  };

  const clearMarks = () => {
    editor
      ?.chain()
      .focus()
      .unsetMark("emphasis")
      .unsetMark("phoneme")
      .unsetMark("liaison")
      .unsetMark("voiceHighlight")
      .run();
  };

  const chooseVoice = (voiceId: string) => {
    const nextVoice = voices.find((voice) => voice.id === voiceId);
    setSettings((current) => ({
      voiceId,
      style: nextVoice?.styles.includes(current.style ?? "")
        ? current.style
        : undefined,
      ratePercent: withinRange(current.ratePercent, nextVoice?.rateRange)
        ? current.ratePercent
        : defaultRangeValue(nextVoice?.rateRange),
      pitchSemitones: withinRange(current.pitchSemitones, nextVoice?.pitchRange)
        ? current.pitchSemitones
        : defaultRangeValue(nextVoice?.pitchRange)
    }));
  };

  const generatePreview = async () => {
    // The generate button mirrors these guards through its disabled state.
    /* v8 ignore next */
    if (
      !previewAdapter ||
      !settings.voiceId ||
      !workingValue.text.trim() ||
      previewBusy ||
      readOnly
    ) {
      return;
    }
    previewAbortRef.current?.abort();
    discardPreviewResult();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    previewRequestHashRef.current = currentHash;
    setPreviewBusy(true);
    setPreviewStatus("正在生成试听…");
    try {
      const result = await previewAdapter.synthesize(
        {
          language,
          content: toRichTextV2(workingValue),
          ...settings
        },
        { signal: controller.signal }
      );
      if (
        controller.signal.aborted ||
        previewRequestHashRef.current !== currentHash
      ) {
        result.dispose?.();
        return;
      }
      previewResultRef.current = result;
      setPreviewResult(result);
      setPreviewHash(currentHash);
      const audio = new Audio(result.audioUrl);
      audioRef.current = audio;
      audio.addEventListener(
        "error",
        () => {
          if (audioRef.current !== audio) return;
          discardPreviewResult();
          setPreviewStatus("试听音频加载失败，请重新生成");
        },
        { once: true }
      );
      audio.addEventListener(
        "ended",
        () => {
          if (audioRef.current !== audio) return;
          setPreviewStatus(result.cached ? "已生成（缓存命中）" : "已生成试听");
        },
        { once: true }
      );
      try {
        await audio.play();
        if (audioRef.current !== audio) return;
        setPreviewStatus(
          result.cached ? "播放中（缓存命中）" : "播放中（新合成）"
        );
      } catch {
        if (audioRef.current !== audio) return;
        setPreviewStatus(result.cached ? "已生成（缓存命中）" : "已生成试听");
      }
    } catch (error) {
      if (!controller.signal.aborted) setPreviewStatus(errorMessage(error));
    } finally {
      if (previewAbortRef.current === controller) {
        previewAbortRef.current = null;
        setPreviewBusy(false);
      }
    }
  };

  const replay = async () => {
    // The replay button mirrors these guards through its disabled state.
    /* v8 ignore next */
    if (!previewResult || previewStale || previewExpired) return;
    audioRef.current?.pause();
    const audio = new Audio(previewResult.audioUrl);
    audioRef.current = audio;
    audio.addEventListener(
      "error",
      () => {
        if (audioRef.current !== audio) return;
        discardPreviewResult();
        setPreviewStatus("试听音频加载失败，请重新生成");
      },
      { once: true }
    );
    audio.addEventListener(
      "ended",
      () => {
        if (audioRef.current !== audio) return;
        setPreviewStatus(
          previewResult.cached ? "已生成（缓存命中）" : "已生成试听"
        );
      },
      { once: true }
    );
    try {
      await audio.play();
      if (audioRef.current !== audio) return;
      setPreviewStatus("播放中");
    } catch {
      if (audioRef.current !== audio) return;
      setPreviewStatus("浏览器阻止自动播放，请再次点击重播");
    }
  };

  const exportPdf = () => {
    printCleanupRef.current?.();
    const cleanup = () => {
      document.body.classList.remove("tsz-ve-printing");
      window.removeEventListener("afterprint", cleanup);
      printCleanupRef.current = null;
    };
    printCleanupRef.current = cleanup;
    document.body.classList.add("tsz-ve-printing");
    window.addEventListener("afterprint", cleanup);
    window.print();
    window.setTimeout(cleanup, 1000);
  };

  const cancel = async () => {
    if (dirty && !readOnly) {
      const approved = await (confirmDiscard?.() ??
        window.confirm("放弃未应用的编辑内容？"));
      if (!approved) return;
    }
    cleanupPreview();
    setPreviewResult(undefined);
    setPreviewHash("");
    setDirty(false);
    onDirtyChange?.(false);
    onCancel();
  };

  const apply = () => {
    if (!editor || readOnly) return;
    try {
      const next = editorJsonToRichTextV2(editor.getJSON());
      onApply(next);
      initialSerializedRef.current = JSON.stringify(next);
      setWorkingValue(next);
      setDirty(false);
      onDirtyChange?.(false);
      setValidationMessage("");
    } catch (error) {
      setValidationMessage(errorMessage(error));
    }
  };

  const phonemeContent = (
    <Space orientation="vertical" size={8}>
      <Typography.Text type="secondary">
        为“{selectionText}”标注 IPA
      </Typography.Text>
      <Input
        autoFocus
        aria-label="IPA 读音"
        value={phonemeInput}
        placeholder="例如 ɪnˈtelɪdʒəns"
        onChange={(event) => setPhonemeInput(event.target.value)}
        onPressEnter={applyPhoneme}
        onKeyDown={(event) => {
          if (event.key === "Escape") setPhonemeOpen(false);
        }}
      />
      <Flex justify="end" gap={8}>
        <Button size="small" onClick={() => setPhonemeOpen(false)}>
          取消
        </Button>
        <Button size="small" type="primary" onClick={applyPhoneme}>
          应用
        </Button>
      </Flex>
    </Space>
  );

  const pauseContent = (
    <Space orientation="vertical" size={8}>
      <Typography.Text type="secondary">修改当前停顿</Typography.Text>
      <Space wrap>
        {PAUSE_OPTIONS.map((duration) => (
          <Button
            key={duration}
            size="small"
            type={duration === selectedPause ? "primary" : "default"}
            onClick={() => updatePause(duration)}
          >
            {duration}ms
          </Button>
        ))}
      </Space>
      <Space.Compact>
        <Input
          aria-label="自定义停顿时长"
          value={customPause}
          placeholder="例如 750"
          onChange={(event) => setCustomPause(event.target.value)}
          onPressEnter={() => updatePause(customPause)}
        />
        <Button onClick={() => updatePause(customPause)}>应用</Button>
        <Button
          danger
          onClick={() => {
            editor?.chain().focus().deleteSelection().run();
            setSelectedPause(undefined);
          }}
        >
          删除
        </Button>
      </Space.Compact>
    </Space>
  );

  return (
    <Drawer
      className="tsz-ve-editor-shell"
      title={contextLabel}
      open={open}
      size={1180}
      destroyOnHidden
      onClose={() => void cancel()}
      footer={
        <Flex justify="space-between" align="center">
          <Button onClick={exportPdf}>导出 PDF</Button>
          <Space>
            <Button onClick={() => void cancel()}>
              {readOnly ? "关闭" : "取消"}
            </Button>
            {!readOnly && (
              <Button
                type="primary"
                disabled={Boolean(validationMessage)}
                onClick={apply}
              >
                应用
              </Button>
            )}
          </Space>
        </Flex>
      }
    >
      <Space orientation="vertical" size={14} style={{ width: "100%" }}>
        {!readOnly && (
          <Flex wrap gap={8} align="center">
            <Button
              aria-label="加重音"
              disabled={!hasSelection}
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .toggleMark("emphasis", { level: "strong" })
                  .run()
              }
            >
              重音
            </Button>
            <Button
              aria-label="加连读"
              disabled={!hasSelection}
              onClick={() =>
                editor?.chain().focus().toggleMark("liaison").run()
              }
            >
              连读
            </Button>
            {HIGHLIGHTS.map((item) => (
              <button
                type="button"
                className="tsz-ve-color-button"
                aria-label={item.label}
                disabled={!hasSelection}
                key={item.color}
                style={{ backgroundColor: item.hex }}
                onClick={() => setHighlight(item.color)}
              />
            ))}
            <Select
              aria-label="默认停顿时长"
              value={pauseDuration}
              options={PAUSE_OPTIONS.map((duration) => ({
                value: duration,
                label: `${duration}ms`
              }))}
              onChange={setPauseDuration}
            />
            <Button
              aria-label="插入停顿"
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .insertContent({
                    type: "voicePause",
                    attrs: { durationMs: pauseDuration }
                  })
                  .run()
              }
            >
              停顿
            </Button>
            <Popover
              open={phonemeOpen}
              content={phonemeContent}
              trigger="click"
              onOpenChange={setPhonemeOpen}
            >
              <Button disabled={!hasSelection} onClick={openPhoneme}>
                IPA
              </Button>
            </Popover>
            {selectedPause !== undefined && (
              <Popover open content={pauseContent} trigger="click">
                <Button>编辑停顿</Button>
              </Popover>
            )}
            <Button disabled={!hasSelection} onClick={clearMarks}>
              清除标注
            </Button>
            <Button
              aria-label="撤销"
              disabled={!canUndo}
              onClick={() => editor?.chain().focus().undo().run()}
            >
              ↶
            </Button>
            <Button
              aria-label="重做"
              disabled={!canRedo}
              onClick={() => editor?.chain().focus().redo().run()}
            >
              ↷
            </Button>
            <Typography.Text type="secondary">
              {selectionText
                ? `已选中：“${selectionText.slice(0, 32)}”`
                : "未选中文本"}
            </Typography.Text>
          </Flex>
        )}

        {validationMessage && (
          <Alert type="error" title={validationMessage} showIcon />
        )}
        <EditorContent editor={editor} aria-label="语音富文本正文" />

        <Spin spinning={voicesLoading}>
          <Flex wrap gap={8} align="center">
            <Select
              aria-label="发音人"
              placeholder="选择发音人"
              value={settings.voiceId || undefined}
              disabled={!previewAdapter || readOnly}
              options={voices.map((voice) => ({
                value: voice.id,
                label: voice.label
              }))}
              onChange={chooseVoice}
            />
            <Select
              aria-label="说话风格"
              placeholder="默认风格"
              allowClear
              value={settings.style}
              disabled={
                !activeVoice || activeVoice.styles.length === 0 || readOnly
              }
              options={activeVoice?.styles.map((style) => ({
                value: style,
                label: style
              }))}
              onChange={(style) =>
                setSettings((current) => ({ ...current, style }))
              }
            />
            <Select
              aria-label="整体语速"
              value={settings.ratePercent}
              disabled={!activeVoice?.supportsRate || readOnly}
              options={controlledOptions(
                RATE_OPTIONS,
                activeVoice?.rateRange
              ).map((rate) => ({
                value: rate,
                label:
                  rate === 0
                    ? "语速：正常"
                    : `语速：${rate > 0 ? "+" : ""}${rate}%`
              }))}
              onChange={(ratePercent) =>
                setSettings((current) => ({ ...current, ratePercent }))
              }
            />
            <Select
              aria-label="整体音高"
              value={settings.pitchSemitones}
              disabled={!activeVoice?.supportsPitch || readOnly}
              options={controlledOptions(
                PITCH_OPTIONS,
                activeVoice?.pitchRange
              ).map((pitch) => ({
                value: pitch,
                label:
                  pitch === 0
                    ? "音高：正常"
                    : `音高：${pitch > 0 ? "+" : ""}${pitch}st`
              }))}
              onChange={(pitchSemitones) =>
                setSettings((current) => ({ ...current, pitchSemitones }))
              }
            />
            <Button
              type="primary"
              loading={previewBusy}
              disabled={
                !previewAdapter ||
                !settings.voiceId ||
                !workingValue.text.trim() ||
                readOnly
              }
              onClick={() => void generatePreview()}
            >
              生成试听
            </Button>
            <Button
              disabled={!previewResult || previewStale || previewExpired}
              onClick={() => void replay()}
            >
              重播
            </Button>
            <Typography.Text type="secondary" aria-live="polite">
              {previewAdapter
                ? previewStatus
                : "TTS 后端未启用，仍可编辑和导出"}
            </Typography.Text>
          </Flex>
        </Spin>

        <Collapse
          size="small"
          items={[
            {
              key: "ssml",
              label: "高级：SSML 预览",
              children: <pre className="tsz-ve-ssml">{ssml}</pre>
            }
          ]}
        />
      </Space>
      <div className="tsz-ve-print-root" aria-hidden>
        <RichTextReadOnly value={workingValue} />
      </div>
    </Drawer>
  );
}
