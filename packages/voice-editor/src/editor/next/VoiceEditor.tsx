import { AudioUploadError } from "../../types";
import {
  localVoiceEditorErrorText,
  richTextIssueMessage,
  voiceEditorErrorMessage,
  useVoiceEditorTranslation,
  defaultVoiceEditorTranslation,
  type VoiceEditorTranslation,
  useVoiceEditorMessageState,
  createVoiceEditorMessage
} from "../i18n";
import { speechAccentGroup } from "@tsz/shared";
import "./interaction.css";
import {
  MicIcon,
  BoldIcon,
  UnderlineIcon,
  PencilIcon,
  ItalicIcon,
  LinkIcon,
  PauseIcon,
  Volume2Icon
} from "lucide-react";
import { Alert, Button, Space, Tag, Typography } from "@tsz/ui/admin/display";
import { Input, Select } from "@tsz/ui/admin/forms";
import { Modal, Tooltip } from "@tsz/ui/admin/overlays";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GrammarFormLinkV3,
  RichText,
  RichTextV2,
  TextLinkV3
} from "@tsz/types";
import { AUDIO_ASSETS_PER_VARIANT_MAX } from "@tsz/types";
import {
  MAX_PAUSE_MS,
  convertVoicePool,
  MIN_PAUSE_MS,
  isVoiceRecommendationAvailable,
  localVoiceProfile,
  recommendationVoiceSetting,
  retainResolvedAudio,
  voiceEffectKey,
  resolveRecommendedVoices,
  newVoiceVersionId,
  selectVoiceVersion,
  voiceLocale,
  voiceSettingFor,
  voiceSettingKey,
  withNativeVoiceVersion,
  normalizeRichTextV2,
  normalizeSpellingRich,
  toRichTextV2,
  validateRichTextV2
} from "../../core";
import {
  rangesOverlap,
  remapTextLinks,
  remapTextLinksWithRecovery,
  wordSegments,
  type RecoverableTextLink
} from "../../core";
import type {
  AudioAsset,
  VoiceOption,
  VoiceEditorProps,
  VoiceAssociation,
  VoiceSetting,
  VoiceRecommendation
} from "../../types";
import {
  describeUploadError,
  isSignedUrlFresh,
  preflightAudioFile,
  progressPercent,
  tooManyAudioError,
  type PendingUpload
} from "./audioAssets";
import { MarkupPanel, type DropdownTool } from "./MarkupPanel";
import { VoiceVersions } from "./VoiceVersions";
import { LocalVoicePool } from "./LocalVoicePool";
import { AudioReview, type ReviewAudio } from "./AudioReview";
import { SsmlReview } from "./SsmlReview";
import { ReferenceAudio } from "./ReferenceAudio";
import {
  LiaisonIcon,
  PausePanel,
  RolePanel,
  UploadPanel,
  VoicePanel
} from "./ToolPanels";
import type { UploadDraft } from "./ToolPanels";
import {
  DEFAULT_BRUSH,
  grammarRoleDefinitions,
  PAUSE_PRESETS,
  formatPauseLabel,
  type Brush,
  type LiaisonEnd
} from "./roles";
import {
  type EditorSnapshot,
  annotationsToMarks,
  applyRoleRange,
  extendAnchor,
  unitAt,
  isValidLiaison,
  marksToAnnotations,
  crossesParagraph,
  makeAnchor,
  tokenIndexAt,
  remapMarks,
  splitRangeAtParagraphs,
  tokenize,
  type LiaisonAnchor,
  type LiaisonDraft,
  type LiaisonLink,
  type MarkState,
  type RoleUnit
} from "./tokens";
import { useVoiceAudition } from "./useVoiceAudition";
import { ShortcutHint } from "./ShortcutHint";

/** 历史栈上限：标注操作很轻，但长时间编辑也不该无限攒快照。 */
const MAX_HISTORY = 100;

/**
 * 连续打字合并成一步撤销的时间窗。
 *
 * 不合并的话每个按键推一个快照，一百来个字符就把 MAX_HISTORY 填满，
 * 早先的标注操作被挤出栈、再也撤不回来。停手超过这个窗口、或中间做了别的操作，
 * 就重新起一步——与常见编辑器的「一段连续输入算一步」一致。
 */
const TYPING_COALESCE_MS = 800;

function errorMessage(
  error: unknown,
  t: VoiceEditorTranslation = defaultVoiceEditorTranslation
): string {
  return localVoiceEditorErrorText(error, t);
}

/**
 * 解析传入值；坏数据一律降级，绝不把异常抛到 render 外面。
 *
 * `toRichTextV2` 对越界区间、跨段落标注等脏数据是 **throw** 的。抽屉时代编辑器
 * 只在用户点开时挂载，一条坏数据顶多让那一次打开失败；内联之后每条例句、每条
 * 语法结构都挂一份，同一条坏数据会把整个第 3 步白屏——而 admin 没有
 * ErrorBoundary 兜底。所以这里降级成「只保留正文、丢掉读不出的标注」并说明原因，
 * 让人还能继续编辑。
 */
function parseValue(value: RichText): { value: RichTextV2; error?: unknown } {
  try {
    return { value: toRichTextV2(value) };
  } catch (error) {
    const raw: unknown = (value as { text?: unknown })?.text;
    return {
      value: {
        version: 2,
        text: typeof raw === "string" ? raw : "",
        annotations: []
      },
      error
    };
  }
}

/**
 * 语音编辑器（标注工具形态）。
 *
 * 文本用纯输入框写，标注在「词 / 字母 / 词缝」的标注带上直接点。因此这里不再
 * 需要富文本编辑器——词级/词间标注本就不该允许落在半个单词上，纯文本 + 码点
 * 区间反而更贴合 wire 模型。
 */
export function VoiceEditor<TLink extends VoiceAssociation = TextLinkV3>({
  value,
  mode = "pronunciation",
  textRole = "body",
  locale,
  textFormattingEnabled = true,
  textLinks,
  restoreTextLinksOnCorrection = false,
  renderAssociationPicker,
  readingLinks,
  renderReadingPicker,
  onAssociationPendingChange,
  renderActions,
  afterText,
  collapseVoiceSettings = false,
  speechCapabilities,
  onValidationChange,
  language = "en",
  contextLabel = "语音编辑器",
  contextKey,
  previewAdapter,
  previewEnabled = true,
  loadRecommendations,
  recommendationArea,
  autoRecommend,
  previewIsMock,
  readOnly: fullyReadOnly,
  contentReadOnly = false,
  associationsReadOnly = false,
  textReadOnly,
  inputDataAttributes,
  placeholder,
  voiceProfile,
  onVoiceProfileChange,
  audioUploadAdapter,
  audioUploadAllowed = true,
  audioAssets,
  onAudioAssetsChange,
  audioAssetLimit = AUDIO_ASSETS_PER_VARIANT_MAX,
  onChange
}: VoiceEditorProps<TLink>) {
  const { t } = useVoiceEditorTranslation();
  const [recommendations, setRecommendations] = useState<VoiceRecommendation[]>(
    []
  );
  const [recommendationsLoaded, setRecommendationsLoaded] = useState(false);
  const [recommendationRefresh, setRecommendationRefresh] = useState(0);
  const visibleRecommendations = recommendations.filter(
    (item) => !item.fallbackOnly
  );
  const [recommendationId, setRecommendationId] = useState<string>();
  const [recommendationError, setRecommendationError] =
    useVoiceEditorMessageState("");
  const [editingVersionKey, setEditingVersionKey] = useState<string>();
  const [generatingVersion, setGeneratingVersion] = useState<string>();
  const [automaticAudioKeys, setAutomaticAudioKeys] = useState<string[]>([]);
  const automaticAudioAttempts = useRef(new Map<string, string>());
  const generationRequest = useRef<AbortController | null>(null);
  const generationKeys = useRef(
    new Map<string, { input: string; id: string }>()
  );
  useEffect(() => () => generationRequest.current?.abort(), []);
  const [refreshingRecommendations, setRefreshingRecommendations] =
    useState(false);
  const recommendationRequest = useRef<AbortController | null>(null);
  const voiceSettingsRef = useRef<VoiceSetting[]>([]);
  const latestReadOnly = useRef(false);
  useEffect(() => () => recommendationRequest.current?.abort(), []);
  const initialRecommendationPending = useRef(
    (autoRecommend ?? !value.text.trim()) && voiceProfile == null
  );
  useEffect(() => {
    recommendationRequest.current?.abort();
    setRefreshingRecommendations(false);
    setRecommendations([]);
    setRecommendationsLoaded(false);
    setRecommendationId(undefined);
    setRecommendationError("");
    if (!loadRecommendations || !recommendationArea) return;
    const controller = new AbortController();
    loadRecommendations({
      area: recommendationArea,
      locale,
      signal: controller.signal,
      ...(recommendationRefresh ? { refresh: true } : {})
    })
      .then((items) => {
        if (!controller.signal.aborted) {
          setRecommendations(items);
          setRecommendationsLoaded(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setRecommendationError(
            createVoiceEditorMessage(
              "could_not_load_group_recommendations_you_can_still_select_voices_below"
            )
          );
      });
    return () => controller.abort();
  }, [recommendationArea, locale, loadRecommendations, recommendationRefresh]);
  const readOnly = fullyReadOnly || contentReadOnly;
  const linksReadOnly = fullyReadOnly || associationsReadOnly;
  /*
   * 初值直接从 value 灌，而不是先置空再由 effect 补。先置空的话，首帧折算出的是
   * 空内容，实时回调会把这份空值抛给宿主——一挂载就把表单里原有的文本清掉。
   */
  const [initial] = useState(() => parseValue(value));
  const [text, setText] = useState(initial.value.text);
  const [links, setLinks] = useState<TLink[]>(textLinks ?? []);
  const [speechLinks, setSpeechLinks] = useState<GrammarFormLinkV3[]>(
    readingLinks ?? []
  );
  const [recoverableLinks, setRecoverableLinks] = useState<
    RecoverableTextLink<TLink>[]
  >([]);
  const [linkWords, setLinkWords] = useState<
    Array<{ start: number; end: number }>
  >([]);
  const [linkAnchor, setLinkAnchor] = useState<number>();
  const [inspectedLinkId, setInspectedLinkId] = useState<string>();
  const [associationPickerOpen, setAssociationPickerOpen] = useState(false);
  const [associationDraftPending, setAssociationDraftPending] = useState(false);
  const [linkNotice, setLinkNotice] = useVoiceEditorMessageState("");
  const [marks, setMarks] = useState<MarkState>(() =>
    annotationsToMarks(initial.value)
  );
  const [pendingText, setPendingText] = useState<string>();
  const pendingTextCoalesceRef = useRef(true);
  const [loadError, setLoadError] = useState(initial.error ?? "");
  const [brush, setBrush] = useState<Brush>(DEFAULT_BRUSH);
  const [textSelection, setTextSelection] = useState<{
    start: number;
    end: number;
  }>();
  const [spellingNotice, setSpellingNotice] = useVoiceEditorMessageState("");
  const [readingKind, setReadingKind] = useState("characters");
  const [readingAlias, setReadingAlias] = useState("");
  const [phonemeAlphabet, setPhonemeAlphabet] = useState<"ipa" | "ups">("ipa");
  const [phonemeText, setPhonemeText] = useState("");
  const [caretPosition, setCaretPosition] = useState<number>();
  const [pauseGap, setPauseGap] = useState<number>();
  const [pendingConflict, setPendingConflict] = useState<
    | { kind: "pause"; gap: number; durationMs: number; links: number[] }
    | { kind: "liaison"; link: LiaisonLink; gaps: number[] }
  >();
  /** 正在拼的这条连读：起点/终点两个锚点，各自可含多个连续字母。 */
  const [draft, setDraft] = useState<LiaisonDraft>({});
  /** 接下来点的字母归哪一端；由面板上的「起点 / 终点」开关决定。 */
  const [liaisonEnd, setLiaisonEnd] = useState<LiaisonEnd>("start");
  /**
   * 语法结构画笔上一次单击上色的那个字母。同一个词里再单击另一个字母时，
   * 两者之间的字母一并上色——点首尾两个字母就能标一段，不必拖。
   */
  const [roleAnchor, setRoleAnchor] = useState<
    { token: number; start: number; end: number } | undefined
  >();
  /** 换笔、改文本、撤销重做、连读成线……凡是字母会挪或语义失效的时刻，瞬态状态一起清。 */
  const resetTransient = useCallback(() => {
    setTextSelection(undefined);
    setSpellingNotice("");
    setCaretPosition(undefined);
    setPauseGap(undefined);
    setPendingConflict(undefined);
    setPendingText(undefined);
    setLinkWords([]);
    setLinkAnchor(undefined);
    setInspectedLinkId(undefined);
    setAssociationPickerOpen(false);
    setAssociationDraftPending(false);
    setDraft({});
    setRoleAnchor(undefined);
    setLiaisonEnd("start");
  }, []);
  const tokens = tokenize(text);
  const gapAtCaret = (position?: number) => {
    if (position === undefined) return undefined;
    const index = tokens.findIndex(
      (token, index) =>
        index < tokens.length - 1 &&
        position >= token.end &&
        position <= tokens[index + 1]!.start &&
        !/[\r\n]/.test(
          Array.from(text)
            .slice(token.end, tokens[index + 1]!.start)
            .join("")
        )
    );
    return index < 0 ? undefined : index;
  };
  const [validationMessage, setValidationMessage] =
    useVoiceEditorMessageState("");

  // 未配置表示尚未选择 C 端音色；只有显式保存的选择才回填。
  const [voiceSettings, setVoiceSettings] = useState<VoiceSetting[]>(
    voiceProfile?.voices ?? []
  );
  voiceSettingsRef.current = voiceSettings;
  latestReadOnly.current = !!readOnly;
  const [upload, setUpload] = useState<UploadDraft>({
    locale: locale ?? "en-GB",
    gender: "female"
  });
  /** 已落成资产的音频（受控，与 voiceProfile 同款进出）。 */
  const [assets, setAssets] = useState<AudioAsset[]>(audioAssets ?? []);
  const assetsRef = useRef(assets);
  /** 还没落成资产的上传：进行中或失败待重试。 */
  function uploadFailure(error: unknown) {
    const issue = describeUploadError(error, t);
    return error instanceof AudioUploadError
      ? { ...issue, code: error.code }
      : issue;
  }
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [playingAssetId, setPlayingAssetId] = useState<string>();
  const [assetReview, setAssetReview] = useState<ReviewAudio>();
  /** 试听失败的说明；只在音频面板里显示，不走阻断性错误那条红色通道。 */
  const [playbackMessage, setPlaybackMessage] = useState<string>();
  const uploadSeqRef = useRef(0);
  const uploadAudioRef = useRef<HTMLAudioElement | null>(null);
  const stopReferenceRef = useRef<(() => void) | undefined>(undefined);
  const registerReferenceStop = useCallback((stop: () => void) => {
    stopReferenceRef.current = stop;
    return () => {
      if (stopReferenceRef.current === stop)
        stopReferenceRef.current = undefined;
    };
  }, []);
  const stopSsmlRef = useRef<(() => void) | undefined>(undefined);
  const registerSsmlStop = useCallback((stop: () => void) => {
    stopSsmlRef.current = stop;
    return () => {
      if (stopSsmlRef.current === stop) stopSsmlRef.current = undefined;
    };
  }, []);
  /** 正在取签名 URL 的那次试听；停播 / 卸载时中止，免得 URL 回来后在没人管的地方开播。 */
  const playRequestRef = useRef<AbortController | null>(null);
  const playingAssetIdRef = useRef<string | undefined>(undefined);
  const uploadControllersRef = useRef(new Map<string, AbortController>());
  /** 试听 URL 是短期签名，只放内存；过期重取。 */
  const assetUrlCacheRef = useRef(
    new Map<string, { url: string; expiresAt: string }>()
  );
  const [customPause, setCustomPause] = useState("");
  const [openTool, setOpenTool] = useState<string>();
  const pauseActive =
    openTool === "pause" ||
    brush.kind === "pause" ||
    (!readOnly && brush.kind === "none" && pauseGap !== undefined);

  /**
   * 撤销/重做栈。快照存「文本 + 全部标注」，因为改文本会连带重挂标注，
   * 只回退其中一半会得到自相矛盾的状态。深度设上限，避免长时间编辑无限增长。
   */
  const [past, setPast] = useState<EditorSnapshot<TLink>[]>([]);
  const [future, setFuture] = useState<EditorSnapshot<TLink>[]>([]);

  /*
   * 受控内联下值是双向流动的（自己改 → 抛给父组件 → 父组件灌回来），要两个基准，
   * 不能共用一个：
   *
   * - incomingRef：最近一次从 props 读到的原始值，用来判断**外部**换没换值；
   * - emittedRef：最近一次抛出去的折算结果，用来判断**本地**有没有真的改。
   *
   * 这两个量不是同一个东西——`annotationsToMarks → marksToAnnotations` 的往返
   * 不是恒等（跨词的 emphasis 会被拆成逐词、认不出的 liaison 会被丢弃）。早先
   * 共用一个基准时，挂载后第一轮就会因为「往返结果 ≠ 传入值」而把这份整理过的
   * 数据当成用户改动抛出去：人还没动手，历史标注已经被改写、表单已经变脏。
   */
  const incomingRef = useRef(
    JSON.stringify({
      value: initial.value,
      links: textLinks ?? [],
      readingLinks: readingLinks ?? []
    })
  );
  const emittedRef = useRef<string | undefined>(undefined);
  /** 记住最近用过的语法结构分类：画笔切到连读/停顿再切回来时不必重挑。 */
  const lastRoleRef = useRef("core");
  const lastPauseRef = useRef(PAUSE_PRESETS[0]!);
  /** 上一次「键入正文」的时刻；0 表示当前没有正在进行的打字连击。 */
  const typingRunRef = useRef(0);

  const stopAssetPlayback = useCallback(() => {
    playRequestRef.current?.abort();
    playRequestRef.current = null;
    uploadAudioRef.current?.pause();
    uploadAudioRef.current = null;
    setAssetReview(undefined);
    playingAssetIdRef.current = undefined;
    setPlayingAssetId(undefined);
  }, []);

  // 卸载：停播，并中止还在路上的上传（confirm 落库前中止不会留下资产）。
  useEffect(
    () => () => {
      stopAssetPlayback();
      uploadControllersRef.current.forEach((controller) => controller.abort());
      uploadControllersRef.current.clear();
    },
    [stopAssetPlayback]
  );

  useEffect(() => {
    if (audioUploadAllowed && !readOnly) return;
    if (!uploadControllersRef.current.size) return;
    uploadControllersRef.current.forEach((controller) => controller.abort());
    uploadControllersRef.current.clear();
    setPendingUploads((current) =>
      current.map((entry) =>
        entry.error
          ? entry
          : {
              ...entry,
              error: {
                message: t("you_do_not_have_permission_to_upload_audio"),
                retryable: true,
                code: "permission_denied"
              }
            }
      )
    );
  }, [audioUploadAllowed, readOnly]);

  /* 与 voiceProfile 同款：自己刚抛出去、又被父组件回灌的那份要跳过。 */
  const emittedAssetsRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const incoming = JSON.stringify(audioAssets ?? []);
    if (incoming === emittedAssetsRef.current) return;
    emittedAssetsRef.current = incoming;
    assetsRef.current = audioAssets ?? [];
    setAssets(assetsRef.current);
    // 外部换值把正在播的那条拿掉了：列表项没了音频还在响，得跟着停；缓存的签名 URL 也一并丢
    const ids = new Set(assetsRef.current.map((asset) => asset.id));
    if (playingAssetIdRef.current && !ids.has(playingAssetIdRef.current)) {
      stopAssetPlayback();
    }
    for (const id of assetUrlCacheRef.current.keys()) {
      if (!ids.has(id)) assetUrlCacheRef.current.delete(id);
    }
  }, [audioAssets, stopAssetPlayback]);

  /*
   * 上传是异步的，完成回调里拿到的 props 是发起那一帧的：宿主的 onAudioAssetsChange
   * 往往内联捕获了当时的草稿，直接调用会把上传期间的编辑整体冲掉。走 ref 取最新的那份。
   */
  const onAudioAssetsChangeRef = useRef(onAudioAssetsChange);
  useEffect(() => {
    onAudioAssetsChangeRef.current = onAudioAssetsChange;
  });
  const emitAssets = (next: AudioAsset[]) => {
    assetsRef.current = next;
    setAssets(next);
    emittedAssetsRef.current = JSON.stringify(next);
    onAudioAssetsChangeRef.current?.(next);
  };

  /** 编辑态（文本 + 标注）折算回 wire；非法内容在这里被拦下。 */
  const working = useMemo((): { value: RichTextV2; error?: string } => {
    const candidate: RichTextV2 = {
      version: 2,
      text,
      annotations: marksToAnnotations(text, marks)
    };
    try {
      return { value: normalizeRichTextV2(candidate) };
    } catch (error) {
      return { value: candidate, error: errorMessage(error, t) };
    }
  }, [marks, text, t]);

  const workingValue = working.value;
  const serialized = JSON.stringify({
    value: workingValue,
    links,
    readingLinks: speechLinks
  });

  // 外部值变了才重新灌入；自己刚抛出去、又被父组件回灌的那一份直接跳过。
  useEffect(() => {
    const parsed = parseValue(value);
    const incoming = JSON.stringify({
      value: parsed.value,
      links: textLinks ?? [],
      readingLinks: readingLinks ?? []
    });
    if (incoming === incomingRef.current) return;
    incomingRef.current = incoming;
    // 换了新值：基准重设，让下面那个 effect 重新记一次而不是当成改动抛出去。
    emittedRef.current = undefined;
    setText(parsed.value.text);
    setLinks(textLinks ?? []);
    setSpeechLinks(readingLinks ?? []);
    setRecoverableLinks([]);
    setMarks(annotationsToMarks(parsed.value));
    setLoadError(parsed.error ?? "");
    typingRunRef.current = 0;
    setBrush(DEFAULT_BRUSH);
    setCustomPause("");
    setOpenTool(undefined);
    resetTransient();
    setValidationMessage("");
    setPast([]);
    setFuture([]);
  }, [value, textLinks, readingLinks]);

  // 折算结果一变就往上抛；折算不出合法 wire 时不抛，免得把坏值写进表单。
  useEffect(() => {
    if (emittedRef.current === undefined) {
      /*
       * 刚灌入的第一轮只记基准、不上抛。往返不恒等，这一轮的差异是「整理」而不是
       * 用户的改动；抛出去就等于人一打开页面，历史标注就被悄悄改写。
       */
      emittedRef.current = serialized;
      return;
    }
    if (fullyReadOnly || mode === "synthesis" || working.error) return;
    if (serialized === emittedRef.current) return;
    emittedRef.current = serialized;
    // 自己抛出去的这份，等父组件回灌时不能再被当成外部改动。
    incomingRef.current = serialized;
    if (readingLinks !== undefined || renderReadingPicker)
      onChange(workingValue, links, speechLinks);
    else if (
      mode === "association" ||
      (mode === "grammar" && textLinks !== undefined)
    )
      onChange(workingValue, links);
    else onChange(workingValue);
  }, [
    onChange,
    fullyReadOnly,
    serialized,
    working.error,
    workingValue,
    links,
    speechLinks,
    mode,
    textLinks,
    readingLinks,
    renderReadingPicker
  ]);

  /* 自己刚抛出去、又被父组件回灌的那份要跳过，否则每次改动都会重置一遍。 */
  const emittedProfileRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const incoming = JSON.stringify(voiceProfile ?? null);
    if (incoming === emittedProfileRef.current) return;
    emittedProfileRef.current = incoming;
    setVoiceSettings(voiceProfile?.voices ?? []);
  }, [voiceProfile]);

  /** 仅在用户编辑时保存未来 C 端音频的音色选择；试听不改变选择。 */
  const updateVoice = (
    voiceId: string,
    patch: Partial<Omit<VoiceSetting, "voice_id">>
  ) => {
    if (readOnly) return;
    initialRecommendationPending.current = false;
    const existing = voiceSettingFor(
      displayedSettings,
      voiceId,
      editingVersionKey
    );
    const updated = withNativeVoiceVersion(
      {
        ...(existing ?? {
          voice_id: voiceId,
          enabled: false,
          rate_percent: 0,
          ...voices.find((voice) => voice.id === voiceId)?.defaultSettings
        }),
        ...patch,
        ...([
          "rate_percent",
          "pitch_semitones",
          "volume_percent",
          "style",
          "style_degree",
          "role",
          "output_format"
        ].some((key) => key in patch)
          ? { audio_asset_id: undefined }
          : {})
      },
      voices.find((voice) => voice.id === voiceId)
    );
    const baseline = displayedSettings;
    const next = existing
      ? baseline.map((item) =>
          voiceSettingKey(item) === voiceSettingKey(existing) ? updated : item
        )
      : [...baseline, updated];
    const profile = localVoiceProfile(
      next,
      voices,
      recommendationArea,
      voiceProfile
    );
    setVoiceSettings(profile.voices);
    emittedProfileRef.current = JSON.stringify(profile);
    onVoiceProfileChange?.(profile);
  };

  const {
    voices,
    voicesLoading,
    status: auditionStatus,
    media: auditionMedia,
    pendingVoiceId,
    playingVoiceId,
    audition,
    stop: stopAudition
  } = useVoiceAudition({
    open: mode !== "actual-pron",
    language,
    content: mode === "synthesis" ? toRichTextV2(value) : workingValue,
    settings: voiceSettings,
    previewAdapter
  });

  function changeVoiceSettings(next: VoiceSetting[]) {
    restoreInheritance.current = false;
    if (readOnly || !onVoiceProfileChange) return;
    initialRecommendationPending.current = false;
    stopAudition();
    const profile = localVoiceProfile(
      next,
      voices,
      recommendationArea,
      voiceProfile
    );
    setVoiceSettings(profile.voices);
    emittedProfileRef.current = JSON.stringify(profile);
    onVoiceProfileChange(profile);
  }

  const generationContent =
    mode === "synthesis"
      ? toRichTextV2(value)
      : mode === "spelling"
        ? {
            ...workingValue,
            annotations: workingValue.annotations.filter((mark) =>
              ["pause", "say_as", "sub"].includes(mark.type)
            )
          }
        : workingValue;
  const inherited = voiceProfile?.dubbing?.mode === "inherit";
  const refreshSavedRecommendations = useCallback(() => {
    if (inherited) {
      stopAudition();
      generationRequest.current?.abort();
      generationRequest.current = null;
      setGeneratingVersion(undefined);
    }
    setRecommendationRefresh((value) => value + 1);
  }, [inherited, stopAudition]);
  useEffect(() => {
    if (!recommendationArea || !loadRecommendations || readOnly) return;
    window.addEventListener("focus", refreshSavedRecommendations);
    return () =>
      window.removeEventListener("focus", refreshSavedRecommendations);
  }, [
    recommendationArea,
    loadRecommendations,
    readOnly,
    refreshSavedRecommendations
  ]);
  const resolutionKey = JSON.stringify([
    voiceProfile,
    generationContent,
    previewAdapter?.audioSourceKey,
    locale,
    inherited ? recommendationRefresh : 0
  ]);
  const [resolvedVoices, setResolvedVoices] = useState<{
    key: string;
    voices: VoiceSetting[];
  }>();
  useEffect(() => {
    if (!voiceProfile?.dubbing || !previewAdapter?.resolveVoices) return;
    const controller = new AbortController();
    Promise.allSettled(
      (["gb", "us"] as const)
        .filter(
          (accent) =>
            !locale || (locale === "en-GB" ? accent === "gb" : accent === "us")
        )
        .map((accent) =>
          previewAdapter.resolveVoices!(
            { profile: voiceProfile, content: generationContent, accent },
            { signal: controller.signal }
          )
        )
    )
      .then((values) => {
        if (controller.signal.aborted) return;
        setResolvedVoices({
          key: resolutionKey,
          voices: values.flatMap((value) =>
            value.status === "fulfilled" ? value.value : []
          )
        });
        const failed = values.find((value) => value.status === "rejected");
        setRecommendationError(
          failed?.status === "rejected"
            ? voiceEditorErrorMessage(
                failed.reason,
                "could_not_resolve_voice_settings_for_some_accents_fix_the_configuration"
              )
            : ""
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setResolvedVoices({ key: resolutionKey, voices: [] });
          setRecommendationError(
            voiceEditorErrorMessage(
              error,
              "could_not_resolve_effective_voice_settings_fix_the_configuration"
            )
          );
        }
      });
    return () => controller.abort();
  }, [resolutionKey, previewAdapter]);
  const effectiveSettings = useMemo(() => {
    if (voiceProfile?.dubbing && previewAdapter?.resolveVoices)
      return resolvedVoices?.key === resolutionKey
        ? retainResolvedAudio(resolvedVoices.voices, voiceSettings)
        : [];
    return resolveRecommendedVoices(
      voiceProfile?.dubbing
        ? { ...voiceProfile, voices: voiceSettings }
        : { voices: voiceSettings },
      recommendations,
      voices,
      locale,
      generationContent
    );
  }, [
    voiceProfile,
    voiceSettings,
    recommendations,
    voices,
    locale,
    previewAdapter,
    resolvedVoices,
    resolutionKey
  ]);
  const unavailableVersions =
    voiceProfile?.dubbing && previewAdapter?.resolveVoices
      ? new Set(
          voiceSettings
            .filter(
              (setting) =>
                setting.enabled &&
                !effectiveSettings.some(
                  (resolved) =>
                    voiceSettingKey(resolved) === voiceSettingKey(setting)
                )
            )
            .map(voiceSettingKey)
        )
      : undefined;
  const displayedSettings =
    voiceProfile?.dubbing?.pool_version && voiceProfile.dubbing.mode === "local"
      ? voiceSettings
      : voiceProfile?.dubbing
        ? [
            ...effectiveSettings,
            ...voiceSettings.filter(
              (setting) =>
                !effectiveSettings.some(
                  (resolved) =>
                    voiceSettingKey(resolved) === voiceSettingKey(setting)
                )
            )
          ]
        : voiceSettings;
  const previousAudio = voiceProfile?.dubbing
    ? voiceSettings.filter(
        (setting) =>
          setting.audio_asset_id &&
          effectiveSettings.some(
            (resolved) =>
              voiceSettingKey(resolved) === voiceSettingKey(setting) &&
              voiceEffectKey(resolved) !== voiceEffectKey(setting)
          )
      )
    : [];
  const enabledVoiceIds = displayedSettings
    .filter((voice) => voice.enabled)
    .map((voice) => voice.voice_id);
  function reorderVoices(next: VoiceSetting[]) {
    if (!voiceProfile?.dubbing || readOnly || !onVoiceProfileChange) return;
    const ids = next.map(voiceSettingKey);
    const profile = {
      ...voiceProfile,
      dubbing: { ...voiceProfile.dubbing, recommendation_order: ids },
      voices: [...voiceSettings].sort(
        (left, right) =>
          ids.indexOf(voiceSettingKey(left)) -
          ids.indexOf(voiceSettingKey(right))
      )
    };
    setVoiceSettings(profile.voices);
    emittedProfileRef.current = JSON.stringify(profile);
    onVoiceProfileChange(profile);
  }
  const currentDubbing = useRef({
    settings: effectiveSettings,
    mode: voiceProfile?.dubbing,
    profile: voiceProfile
  });
  currentDubbing.current = {
    settings: voiceProfile?.dubbing ? displayedSettings : voiceSettings,
    mode: voiceProfile?.dubbing,
    profile: voiceProfile
  };
  const restoreInheritance = useRef(false);
  async function restoreRecommendations() {
    restoreInheritance.current = true;
    if (!recommendationArea || readOnly || !onVoiceProfileChange) return;
    stopAudition();
    generationRequest.current?.abort();
    generationRequest.current = null;
    setGeneratingVersion(undefined);
    setRecommendationRefresh((value) => value + 1);
    const profile = {
      voices: [],
      dubbing: {
        mode: "inherit" as const,
        area: recommendationArea,
        pool_version: "provider_id_v1" as const,
        recommendation_order: voiceProfile?.dubbing?.recommendation_order ?? []
      }
    };
    setVoiceSettings([]);
    emittedProfileRef.current = JSON.stringify(profile);
    onVoiceProfileChange(profile);
  }
  const audioContentKey = JSON.stringify([
    contextKey ?? contextLabel,
    inputDataAttributes,
    locale,
    recommendationArea,
    generationContent,
    mode === "grammar" ? links : undefined,
    speechLinks,
    previewAdapter?.audioSourceKey
  ]);
  const lastAudioContent = useRef(audioContentKey);
  const audioContentRef = useRef(audioContentKey);
  audioContentRef.current = audioContentKey;
  useEffect(() => {
    if (lastAudioContent.current === audioContentKey) return;
    lastAudioContent.current = audioContentKey;
    stopAudition();
    stopSsmlRef.current?.();
    stopReferenceRef.current?.();
    generationRequest.current?.abort();
    uploadControllersRef.current.forEach((controller) => controller.abort());
    uploadControllersRef.current.clear();
    setPendingUploads([]);
    stopAssetPlayback();
    setGeneratingVersion(undefined);
    if (voiceSettingsRef.current.some((setting) => setting.audio_asset_id)) {
      const profile = {
        ...voiceProfile,
        voices: voiceSettingsRef.current.map(
          ({ audio_asset_id: _audio, ...setting }) => setting
        )
      };
      setVoiceSettings(profile.voices);
      emittedProfileRef.current = JSON.stringify(profile);
      onVoiceProfileChange?.(profile);
      setRecommendationError(
        createVoiceEditorMessage(
          "the_text_or_reading_changed_generate_final_audio_again"
        )
      );
    }
  }, [audioContentKey, onVoiceProfileChange]);

  async function generateVersionAudio(
    setting: VoiceSetting,
    automatic = false
  ) {
    if (
      !previewAdapter?.generateAudio ||
      readOnly ||
      generatingVersion ||
      unavailableVersions?.has(voiceSettingKey(setting)) ||
      !setting.version_id
    )
      return;
    const content = generationContent;
    const selectedVoice = voices.find((voice) => voice.id === setting.voice_id);
    if (
      selectedVoice &&
      ((selectedVoice.supportsVolume === false &&
        (setting.volume_percent ?? 100) !== 100) ||
        (selectedVoice.supportsRate === false && setting.rate_percent !== 0) ||
        (selectedVoice.supportsPitch === false &&
          (setting.pitch_semitones ?? 0) !== 0) ||
        ((mode === "synthesis" || mode === "phoneme-settings") &&
          selectedVoice.supportsPhoneme === false) ||
        content.annotations.some(
          (mark) =>
            (mark.type === "pause" && selectedVoice.supportsPause === false) ||
            (mark.type === "phoneme" && selectedVoice.supportsPhoneme === false)
        ))
    ) {
      setRecommendationError(
        createVoiceEditorMessage(
          "this_model_does_not_support_the_current_parameters_pauses_or_phonemes_adjus"
        )
      );
      return;
    }
    const key = voiceSettingKey(setting);
    const signature = JSON.stringify([
      content,
      previewAdapter.audioSourceKey,
      key,
      voiceEffectKey(setting)
    ]);
    const previous = generationKeys.current.get(key);
    const requestId =
      previous?.input === signature ? previous.id : newVoiceVersionId();
    generationKeys.current.set(key, { input: signature, id: requestId });
    generationRequest.current?.abort();
    const request = new AbortController();
    generationRequest.current = request;
    const baseline = audioContentRef.current;
    const modeBaseline = JSON.stringify(voiceProfile?.dubbing);
    setGeneratingVersion(key);
    setRecommendationError("");
    try {
      const asset = await previewAdapter.generateAudio(
        {
          requestId,
          content,
          setting,
          ...(voiceProfile?.dubbing ? { profile: voiceProfile } : {})
        },
        { signal: request.signal }
      );
      const current = currentDubbing.current.settings.find(
        (item) => voiceSettingKey(item) === key
      );
      if (
        request.signal.aborted ||
        baseline !== audioContentRef.current ||
        modeBaseline !== JSON.stringify(currentDubbing.current.mode) ||
        !current ||
        (automatic && !current.enabled) ||
        latestReadOnly.current
      )
        return;
      const currentSignature = JSON.stringify([
        content,
        previewAdapter.audioSourceKey,
        key,
        voiceEffectKey(current)
      ]);
      if (currentSignature !== signature) {
        setRecommendationError(
          createVoiceEditorMessage(
            "parameters_changed_during_generation_generate_again"
          )
        );
        return;
      }
      if (mode !== "synthesis" && value.version === 1) {
        emittedRef.current = serialized;
        incomingRef.current = serialized;
        onChange(workingValue, links);
      }
      const next = currentDubbing.current.settings.map((item) =>
        voiceSettingKey(item) === key
          ? { ...item, audio_asset_id: asset.id }
          : item
      );
      const profile = { ...currentDubbing.current.profile, voices: next };
      setVoiceSettings(next);
      emittedProfileRef.current = JSON.stringify(profile);
      onVoiceProfileChange?.(profile);
      generationKeys.current.delete(key);
      setRecommendationError(
        createVoiceEditorMessage(
          "final_audio_generated_complete_editing_and_save_the_text"
        )
      );
    } catch (error) {
      if (!request.signal.aborted)
        setRecommendationError(
          voiceEditorErrorMessage(error, "generation_failed_try_again_2")
        );
    } finally {
      if (generationRequest.current === request)
        setGeneratingVersion(undefined);
    }
  }

  function chooseVersion(setting: VoiceSetting) {
    const settings = displayedSettings;
    if (setting.enabled && (recommendationArea || voiceProfile?.dubbing)) {
      changeVoiceSettings(
        settings.map((item) =>
          voiceSettingKey(item) === voiceSettingKey(setting)
            ? { ...item, enabled: false }
            : item
        )
      );
      return;
    }
    const accent = voiceLocale(setting, voices);
    if (!accent || !speechAccentGroup(accent)) return;
    if (
      voiceSettings.some((item) => item.enabled && !voiceLocale(item, voices))
    ) {
      setRecommendationError(
        createVoiceEditorMessage(
          "an_enabled_unavailable_voice_has_an_unknown_accent_disable_it_before_select"
        )
      );
      return;
    }
    const selected: VoiceSetting = setting.version_id
      ? setting
      : {
          ...setting,
          version_id: newVoiceVersionId(),
          version_name:
            voices.find((voice) => voice.id === setting.voice_id)?.label ??
            setting.voice_id,
          locale: accent as `en-${string}`
        };
    const existing = setting.version_id
      ? settings
      : settings.filter(
          (item) => voiceSettingKey(item) !== voiceSettingKey(setting)
        );
    changeVoiceSettings(
      selectVoiceVersion(
        existing,
        selected,
        accent as `en-${string}`,
        voices,
        !!recommendationArea
      )
    );
    setEditingVersionKey(voiceSettingKey(selected));
  }

  function applyRecommendation(item: VoiceRecommendation) {
    const version: VoiceSetting = {
      ...item.setting,
      enabled: true,
      version_id: newVoiceVersionId(),
      version_name: item.name,
      locale: (voices.find((voice) => voice.id === item.setting.voice_id)
        ?.locale ?? item.locale) as `en-${string}`
    };
    changeVoiceSettings(
      selectVoiceVersion(
        voiceSettings,
        version,
        item.locale,
        voices,
        !!recommendationArea
      )
    );
    setEditingVersionKey(version.version_id);
  }

  async function useLatestRecommendation(accent: "en-GB" | "en-US") {
    if (!loadRecommendations || !recommendationArea || readOnly) return;
    recommendationRequest.current?.abort();
    const request = new AbortController();
    recommendationRequest.current = request;
    const baseline = voiceSettingsRef.current;
    setRefreshingRecommendations(true);
    try {
      const items = await loadRecommendations({
        area: recommendationArea,
        locale,
        refresh: true,
        signal: request.signal
      });
      if (request.signal.aborted || latestReadOnly.current) return;
      if (voiceSettingsRef.current !== baseline) {
        setRecommendationError(
          createVoiceEditorMessage(
            "voice_configuration_changed_while_loading_select_the_latest_recommendation"
          )
        );
        return;
      }
      setRecommendations(items);
      const first = items.find(
        (item) =>
          item.locale === accent &&
          isVoiceRecommendationAvailable(
            item,
            voices,
            accent,
            generationContent
          )
      );
      if (!first) {
        setRecommendationError(
          createVoiceEditorMessage(
            "no_first_choice_recommendation_is_available_for_this_accent_check_group_set"
          )
        );
        return;
      }
      if (
        voiceSettings.some((item) => item.enabled && !voiceLocale(item, voices))
      ) {
        setRecommendationError(
          createVoiceEditorMessage(
            "an_enabled_unavailable_voice_has_an_unknown_accent_disable_it_before_applyi"
          )
        );
        return;
      }
      setRecommendationError("");
      applyRecommendation(first);
    } catch {
      if (!request.signal.aborted)
        setRecommendationError(
          createVoiceEditorMessage(
            "could_not_load_the_latest_recommendations_current_text_configuration_is_unc"
          )
        );
    } finally {
      if (recommendationRequest.current === request)
        setRefreshingRecommendations(false);
    }
  }

  const recommendationAvailable = useCallback(
    (item: VoiceRecommendation): boolean =>
      isVoiceRecommendationAvailable(item, voices, locale, generationContent),
    [voices, locale, generationContent]
  );

  useEffect(() => {
    if (
      !initialRecommendationPending.current ||
      readOnly ||
      !text.trim() ||
      !onVoiceProfileChange ||
      voicesLoading ||
      (recommendationArea ? !recommendationsLoaded : !recommendations.length)
    )
      return;
    if (voiceSettings.length || voiceProfile != null) {
      initialRecommendationPending.current = false;
      return;
    }
    const first = (["en-GB", "en-US"] as const)
      .filter((accent) => !locale || accent === locale)
      .map((accent) =>
        recommendations.find(
          (item) =>
            item.selected !== false &&
            item.locale === accent &&
            isVoiceRecommendationAvailable(
              item,
              voices,
              accent,
              generationContent
            )
        )
      )
      .filter((item): item is VoiceRecommendation => !!item);
    if (!voices.length) return;
    const usable = first.filter(recommendationAvailable);
    const unavailable = first.filter((item) => !recommendationAvailable(item));
    if (unavailable.length)
      setRecommendationError(
        createVoiceEditorMessage(
          "first_choice_recommendations_are_unavailable_for_select_other_voices",
          {
            p0: unavailable
              .map((item) =>
                item.locale === "en-GB"
                  ? createVoiceEditorMessage("british")
                  : createVoiceEditorMessage("american")
              )
              .join("、")
          }
        )
      );
    initialRecommendationPending.current = false;
    if (!usable.length && !recommendationArea) return;
    const profile = {
      ...(recommendationArea
        ? {
            dubbing: {
              mode: "inherit" as const,
              area: recommendationArea,
              pool_version: "provider_id_v1" as const,
              recommendation_order: usable.map((item) => item.id)
            }
          }
        : {}),
      voices: usable.map((item) =>
        recommendationArea
          ? recommendationVoiceSetting(item, voices)
          : withNativeVoiceVersion(
              { ...item.setting, enabled: true },
              voices.find((voice) => voice.id === item.setting.voice_id),
              item.name
            )
      )
    };
    setVoiceSettings(profile.voices);
    emittedProfileRef.current = JSON.stringify(profile);
    onVoiceProfileChange(profile);
  }, [
    readOnly,
    text,
    onVoiceProfileChange,
    voicesLoading,
    recommendations,
    recommendationsLoaded,
    recommendationArea,
    locale,
    voiceSettings,
    voiceProfile,
    recommendationAvailable,
    voices
  ]);

  const changeBrush = (next: Brush) => {
    if (next.kind === "role") lastRoleRef.current = next.level;
    if (next.kind === "pause") lastPauseRef.current = next.durationMs;
    setBrush(next);
    resetTransient();
  };

  /* 语法结构与停顿选完就收起浮层，好腾出标注带落笔；连读的面板要留着用。 */
  const pickBrush = (next: Brush) => {
    if (mode === "grammar" && next.kind === "role" && textSelection) {
      let roles = marks.roles;
      for (const piece of splitRangeAtParagraphs(
        text,
        textSelection.start,
        textSelection.end
      )) {
        roles = applyRoleRange(
          text,
          roles,
          { ...piece, level: next.level },
          { toggle: false }
        );
      }
      paintRoles(roles);
      lastRoleRef.current = next.level;
      setBrush({ kind: "none" });
      setOpenTool(undefined);
      return;
    }
    changeBrush(next);
    setOpenTool(
      mode === "grammar" && next.kind === "role" ? "roles" : undefined
    );
  };

  /* 点开一支笔的面板即换上这支笔，省掉「先选笔再点开」的一次往返。 */
  /*
   * 点开一支笔的面板即拿起这支笔；放下笔走「文本」这枚显式的工具。
   *
   * 不用「再点一次同一枚按钮收笔」：选完分类面板会自动收起，此时再点那枚按钮
   * 既可能是想收笔、也可能是想重新打开面板换个分类，同一个手势两个意思。
   */
  const openToolAndArm = (key?: string) => {
    if (key === "italic" || key === "bold" || key === "underline") {
      toggleTextFormat(key);
      return;
    }
    if (key === "erase") {
      setOpenTool(undefined);
      changeBrush(
        brush.kind === "erase" ? { kind: "none" } : { kind: "erase" }
      );
      return;
    }
    if (key === "association-word" || key === "association-phrase") {
      const targetKind = key === "association-word" ? "word" : "phrase";
      setOpenTool(key);
      setAssociationPickerOpen(false);
      setInspectedLinkId(undefined);
      if (brush.kind !== "association" || brush.targetKind !== targetKind)
        changeBrush({ kind: "association", targetKind });
      return;
    }
    if (key === "phoneme") {
      const existing = marks.passthrough.find(
        (mark) =>
          mark.type === "phoneme" &&
          textSelection &&
          mark.start === textSelection.start &&
          mark.end === textSelection.end
      );
      setPhonemeAlphabet(
        existing?.type === "phoneme" ? existing.alphabet : "ipa"
      );
      setPhonemeText(existing?.type === "phoneme" ? existing.phoneme : "");
      setOpenTool(key);
      return;
    }
    if (key === "text") {
      setOpenTool(undefined);
      changeBrush({ kind: "none" });
      return;
    }
    /*
     * 连读的面板就是它的工作台：起点/终点回显与「添加」都在里面。关掉面板还留着
     * 这支笔的话，人还能继续点字母攒草稿，却够不着提交按钮。语法结构与停顿不同，
     * 它们本来就是「选完收起面板再落笔」，收起后要继续armed。
     */
    if (
      key === undefined &&
      (brush.kind === "liaison" || brush.kind === "association")
    ) {
      setOpenTool(undefined);
      changeBrush({ kind: "none" });
      return;
    }
    if (key === "pause") {
      if (pauseActive) {
        setOpenTool(undefined);
        changeBrush({ kind: "none" });
        return;
      }
      // 光标在词内时明确展示“在该词后”，不把停顿写进单词内部。
      const gap = gapAtCaret(caretPosition);
      changeBrush({ kind: "none" });
      setPauseGap(gap !== undefined && gap >= 0 ? gap : undefined);
      setCustomPause("");
      setOpenTool("pause");
      return;
    }
    if (mode === "grammar" && key === "roles") {
      // 打开分类保留正文选区，不自动拿起画笔。
      if (brush.kind !== "none" && brush.kind !== "role") {
        const selection = textSelection;
        changeBrush({ kind: "none" });
        setTextSelection(selection);
      }
      setOpenTool("roles");
      return;
    }
    if (key === "liaison") {
      setBrush({ kind: "none" });
      setOpenTool("liaison");
      return;
    }
    setOpenTool(key);
    /* 已经是这支笔就不重复换：再换一次会把当前分类/时长打回记忆值。 */
    if (key === "roles" && brush.kind !== "role") {
      changeBrush({ kind: "role", level: lastRoleRef.current });
    } else if (key === "liaison" && brush.kind !== "liaison") {
      changeBrush({ kind: "liaison" });
    } else if (key === "pause" && brush.kind !== "pause") {
      changeBrush({ kind: "pause", durationMs: lastPauseRef.current });
    }
  };

  /**
   * 所有会改动内容的操作都走这里，好把上一版整体推进历史栈。
   *
   * `typing` 表示这次是键入正文：连着敲的一串只占一步撤销，栈顶那一份就是
   * 这段输入开始之前的状态，所以续写时不再推新快照。
   */
  const canApplySnapshot = (next: EditorSnapshot<TLink>) => {
    if (fullyReadOnly) return false;
    if (
      contentReadOnly &&
      (next.text !== text ||
        JSON.stringify(next.marks) !== JSON.stringify(marks))
    )
      return false;
    if (
      contentReadOnly &&
      JSON.stringify(next.readingLinks ?? []) !== JSON.stringify(speechLinks)
    )
      return false;
    if (
      associationsReadOnly &&
      JSON.stringify(next.textLinks ?? []) !== JSON.stringify(links)
    ) {
      setLinkNotice(
        createVoiceEditorMessage(
          "this_change_affects_existing_links_and_requires_word_and_phrase_linking_per"
        )
      );
      return false;
    }
    return true;
  };
  const commit = (
    next: (current: EditorSnapshot<TLink>) => EditorSnapshot<TLink>,
    options?: { typing?: boolean }
  ) => {
    const before: EditorSnapshot<TLink> = {
      text,
      marks,
      textLinks: links,
      readingLinks: speechLinks,
      recoverableTextLinks: recoverableLinks
    };
    const after = next(before);
    if (!canApplySnapshot(after)) return;
    if (!options?.typing && after.textLinks !== before.textLinks) {
      // 主动改动关联后以新选择为准；只有撤销该操作才会恢复旧记录。
      after.recoverableTextLinks = [];
      setLinkNotice("");
    }
    const now = Date.now();
    const continuingRun =
      options?.typing === true &&
      now - typingRunRef.current < TYPING_COALESCE_MS;
    typingRunRef.current = options?.typing === true ? now : 0;
    if (!continuingRun) {
      setPast((stack) => [...stack, before].slice(-MAX_HISTORY));
    }
    setFuture([]);
    setText(after.text);
    setMarks(after.marks);
    setLinks(after.textLinks ?? []);
    setSpeechLinks(after.readingLinks ?? []);
    setRecoverableLinks(after.recoverableTextLinks ?? []);
    setValidationMessage("");
    setSpellingNotice("");
  };

  const voiceSavePending =
    !contentReadOnly &&
    mode !== "actual-pron" &&
    Boolean(voiceProfile?.dubbing?.pool_version) &&
    (voicesLoading ||
      (Boolean(previewAdapter?.resolveVoices) &&
        resolvedVoices?.key !== resolutionKey));

  const automaticAudio = displayedSettings.filter(
    (setting) =>
      automaticAudioKeys.includes(voiceSettingKey(setting)) &&
      setting.enabled &&
      !setting.audio_asset_id
  );
  const automaticAudioPending =
    !!previewAdapter?.generateAudio &&
    previewEnabled &&
    !previewIsMock &&
    automaticAudio.length > 0;
  // Read the current controlled draft each render: another selection can join
  // the queue while a request is running, without replacing that request.
  useEffect(() => {
    if (readOnly || !previewEnabled || previewIsMock) {
      generationRequest.current?.abort();
      if (generatingVersion) setGeneratingVersion(undefined);
      return;
    }
    if (!automaticAudioPending || generatingVersion || voiceSavePending) return;
    const setting = automaticAudio.find((item) => {
      const input = JSON.stringify([
        audioContentKey,
        voiceEffectKey(item),
        voiceProfile?.dubbing
      ]);
      return (
        automaticAudioAttempts.current.get(voiceSettingKey(item)) !== input
      );
    });
    if (!setting) return;
    automaticAudioAttempts.current.set(
      voiceSettingKey(setting),
      JSON.stringify([
        audioContentKey,
        voiceEffectKey(setting),
        voiceProfile?.dubbing
      ])
    );
    void generateVersionAudio(setting, true);
  });

  const captureResult = (forSave = false) => {
    if (forSave && automaticAudioPending)
      throw new Error(
        t("final_audio_for_selected_voices_is_incomplete_wait_or_retry")
      );
    let profile = voiceProfile;
    if (
      forSave &&
      !contentReadOnly &&
      mode !== "actual-pron" &&
      recommendationArea &&
      (autoRecommend ?? !value.text.trim()) &&
      profile == null
    )
      throw new Error(
        t(
          "default_voices_are_not_configured_load_the_catalogue_and_select_an_availabl"
        )
      );
    if (
      forSave &&
      !contentReadOnly &&
      mode !== "actual-pron" &&
      profile?.dubbing?.pool_version
    ) {
      if (voiceSavePending)
        throw new Error(
          t("checking_effective_voice_settings_wait_before_saving")
        );
      const required = locale ? [speechAccentGroup(locale)] : ["uk", "us"];
      for (const accent of required) {
        if (
          !effectiveSettings.some(
            (setting) =>
              setting.enabled &&
              speechAccentGroup(
                voiceLocale(setting, voices),
                voices.find((voice) => voice.id === setting.voice_id)?.accent
              ) === accent
          )
        )
          throw new Error(
            t("no_selected_voice_is_usable_select_one_before_saving", {
              p0: accent === "uk" ? t("british") : t("american")
            })
          );
      }
      if (inherited && !restoreInheritance.current) {
        const activeKeys = new Set(effectiveSettings.map(voiceSettingKey));
        const rawSettings = displayedSettings.map((setting) => {
          const key = voiceSettingKey(setting);
          const recommendation = recommendations.find(
            (item) => item.id === key
          );
          const raw = recommendation
            ? recommendationVoiceSetting(recommendation, voices)
            : (voiceSettings.find((item) => voiceSettingKey(item) === key) ??
              setting);
          return {
            ...raw,
            enabled: activeKeys.has(key),
            ...(setting.audio_asset_id
              ? { audio_asset_id: setting.audio_asset_id }
              : {})
          };
        });
        profile = convertVoicePool(
          profile,
          rawSettings,
          voices,
          profile.dubbing.area
        );
        const active = effectiveSettings.filter((setting) => setting.enabled);
        const sources = active.map((setting) =>
          recommendations.find((item) => item.id === voiceSettingKey(setting))
        );
        const source = sources[0];
        if (
          source?.groupId &&
          source.pairId &&
          sources.every(
            (item) =>
              item?.groupId === source.groupId && item?.pairId === source.pairId
          )
        )
          profile.dubbing!.recommendation = {
            group_id: source.groupId,
            pair_id: source.pairId,
            voice_ids: active.map((setting) => setting.voice_id),
            contribution_ids: active.map(voiceSettingKey)
          };
      }
    }
    return structuredClone({
      value: workingValue,
      textLinks: links,
      readingLinks: speechLinks,
      voiceProfile: profile,
      audioAssets: assets
    });
  };

  const prepareComplete = () => {
    if (mode !== "spelling" || readOnly) return true;
    const normalized = normalizeSpellingRich(workingValue);
    if (normalized.text === text) return true;
    commit((current) => ({
      ...current,
      text: normalized.text,
      marks: annotationsToMarks(normalized)
    }));
    resetTransient();
    setSpellingNotice(
      normalized.annotations.length < workingValue.annotations.length
        ? createVoiceEditorMessage(
            "spelling_normalised_and_affected_annotations_removed_check_before_completin"
          )
        : createVoiceEditorMessage(
            "spelling_normalised_check_before_completing_you_can_undo_this"
          )
    );
    return false;
  };

  const undo = () => {
    const previous = past[past.length - 1];
    if (!previous || !canApplySnapshot(previous)) return;
    typingRunRef.current = 0;
    setPast((stack) => stack.slice(0, -1));
    setFuture((stack) =>
      [
        {
          text,
          marks,
          textLinks: links,
          readingLinks: speechLinks,
          recoverableTextLinks: recoverableLinks
        },
        ...stack
      ].slice(0, MAX_HISTORY)
    );
    setText(previous.text);
    setMarks(previous.marks);
    setLinks(previous.textLinks ?? []);
    setSpeechLinks(previous.readingLinks ?? []);
    setRecoverableLinks(previous.recoverableTextLinks ?? []);
    setLinkNotice(
      previous.recoverableTextLinks?.length
        ? createVoiceEditorMessage(
            "some_links_are_temporarily_unavailable_and_will_recover_if_the_original_tex"
          )
        : ""
    );
    resetTransient();
    setValidationMessage("");
  };

  const redo = () => {
    const next = future[0];
    if (!next || !canApplySnapshot(next)) return;
    setFuture((stack) => stack.slice(1));
    setPast((stack) =>
      [
        ...stack,
        {
          text,
          marks,
          textLinks: links,
          readingLinks: speechLinks,
          recoverableTextLinks: recoverableLinks
        }
      ].slice(-MAX_HISTORY)
    );
    setText(next.text);
    setMarks(next.marks);
    setLinks(next.textLinks ?? []);
    setSpeechLinks(next.readingLinks ?? []);
    setRecoverableLinks(next.recoverableTextLinks ?? []);
    setLinkNotice(
      next.recoverableTextLinks?.length
        ? createVoiceEditorMessage(
            "some_links_are_temporarily_unavailable_and_will_recover_if_the_original_tex"
          )
        : ""
    );
    resetTransient();
    setValidationMessage("");
  };

  const changeText = (nextText: string, confirmed = false, coalesce = true) => {
    if (readOnly || textReadOnly) return;
    const nextMarks = remapMarks(text, nextText, marks);
    const mapped = restoreTextLinksOnCorrection
      ? remapTextLinksWithRecovery(text, nextText, links, recoverableLinks)
      : { links: remapTextLinks(text, nextText, links), recoverable: [] };
    if (
      !confirmed &&
      (nextMarks.liaisons.length < marks.liaisons.length ||
        Object.keys(nextMarks.pauses).length <
          Object.keys(marks.pauses).length ||
        mapped.links.length < links.length)
    ) {
      pendingTextCoalesceRef.current = coalesce;
      setPendingText(nextText);
      return;
    }
    setLinkNotice(
      restoreTextLinksOnCorrection
        ? mapped.recoverable.length
          ? createVoiceEditorMessage(
              "some_links_are_temporarily_unavailable_and_will_recover_if_the_original_tex"
            )
          : ""
        : mapped.links.length < links.length
          ? createVoiceEditorMessage(
              "links_in_modified_text_were_removed_select_them_again_you_can_undo_this"
            )
          : ""
    );
    // 剪切和粘贴仍是正文编辑，只在操作前后打断连续输入的历史合并。
    if (!coalesce) typingRunRef.current = 0;
    commit(
      () => ({
        text: nextText,
        textLinks: mapped.links,
        readingLinks: remapTextLinks(text, nextText, speechLinks),
        recoverableTextLinks: mapped.recoverable,
        marks: nextMarks
      }),
      { typing: true }
    );
    if (!coalesce) typingRunRef.current = 0;
    resetTransient();
  };

  const linkSegments = wordSegments(text, linkWords);
  const selectedLink = links.find((link) => link.id === inspectedLinkId);
  useEffect(() => {
    onAssociationPendingChange?.(
      associationDraftPending ||
        (brush.kind === "association" &&
          linkWords.length > 0 &&
          !inspectedLinkId)
    );
  }, [
    brush.kind,
    linkWords.length,
    inspectedLinkId,
    associationDraftPending,
    onAssociationPendingChange
  ]);
  const selectWord = (range: { start: number; end: number }) => {
    if (
      linksReadOnly ||
      !renderAssociationPicker ||
      brush.kind !== "association"
    )
      return;
    const existing = links.find((link) =>
      link.source_segments.some(
        (segment) => segment.start < range.end && range.start < segment.end
      )
    );
    if (existing) {
      // 已占用的词只打开原关联，不加入当前选择，也不允许覆盖整组。
      setInspectedLinkId(existing.id);
      setLinkAnchor(range.start);
      setAssociationPickerOpen(true);
      setOpenTool(undefined);
      return;
    }
    setInspectedLinkId(undefined);
    if (brush.targetKind === "word") {
      setLinkNotice("");
      setLinkWords([range]);
      setLinkAnchor(range.start);
      setAssociationPickerOpen(true);
      setOpenTool(undefined);
      return;
    }
    const next = linkWords.some((item) => item.start === range.start)
      ? linkWords.filter((item) => item.start !== range.start)
      : [...linkWords, range];
    if (next.length > 1) {
      const start = Math.min(...next.map((item) => item.start));
      const end = Math.max(...next.map((item) => item.end));
      if (/[\r\n]/u.test(Array.from(text).slice(start, end).join(""))) {
        setLinkNotice(
          createVoiceEditorMessage("select_words_within_the_same_paragraph")
        );
        return;
      }
    }
    setLinkNotice("");
    setLinkWords(next);
    setLinkAnchor(next.at(-1)?.start);
    // 短语先完成多选，确认后才挂载候选；改选词段时回到选词阶段。
    setAssociationPickerOpen(false);
    setOpenTool("association-phrase");
  };
  const associationContent =
    brush.kind === "association" &&
    !linksReadOnly &&
    associationPickerOpen &&
    (selectedLink || linkSegments.length > 0) &&
    renderAssociationPicker?.({
      kind: brush.targetKind,
      segments: selectedLink?.source_segments ?? linkSegments,
      selected: selectedLink,
      onCancel: resetTransient,
      onPendingChange: setAssociationDraftPending,
      onSelect: (next) => {
        if (linksReadOnly) return;
        if (selectedLink) {
          commit((current) => ({
            ...current,
            // 补全旧目标时仍沿用原标注的身份与片段，选择器只更新目标信息。
            textLinks: next
              ? (current.textLinks ?? []).map((link) =>
                  link.id === selectedLink.id
                    ? {
                        ...next,
                        id: link.id,
                        source_segments: link.source_segments
                      }
                    : link
                )
              : (current.textLinks ?? []).filter(
                  (link) => link.id !== selectedLink.id
                )
          }));
          if (mode === "grammar" && !next) {
            // 清除后继续浏览同一词段，不把已完成的解除操作当成待选择关联。
            setLinkWords(
              selectedLink.source_segments.map(({ start, end }) => ({
                start,
                end
              }))
            );
          } else {
            resetTransient();
          }
          return;
        }
        if (!next) {
          resetTransient();
          return;
        }
        if (
          links.some((link) =>
            rangesOverlap(link.source_segments, linkSegments)
          )
        ) {
          setLinkNotice(
            createVoiceEditorMessage(
              "the_selected_words_are_already_linked_clear_their_existing_links_first"
            )
          );
          return;
        }
        commit((current) => ({
          ...current,
          textLinks: [
            ...(current.textLinks ?? []),
            { ...next, source_segments: linkSegments }
          ]
        }));
        resetTransient();
      }
    });

  /**
   * 语法结构按**字母**落笔：点一个字母上一个字母的色，按住拖过一段字母则整段
   * 上色（可以只是一个词里的几个字母，也可以拖过几个词）；区间里已经全是这个
   * 分类时再刷一次即取消。区间是绝对码点 [start, end)。
   *
   * 单击还会记下锚点：同一个词里紧接着再单击另一个字母，两者之间的字母一并
   * 上色（点 w 再点 k，work 整段变色），接上之后锚点清空。只在同一个词里接——
   * 隔着几个词的两次单击各自独立，否则想分别标两个字母就会被连成一大段。
   */
  /**
   * 语法结构落笔前先过一遍核心层校验：与音标区间交叉这类错要当场说清并拒掉，
   * 不能让它进入 marks 之后才在折算时报错——那样编辑器会进入「不保存」状态。
   */
  const paintRoles = (roles: RoleUnit[]): boolean => {
    const issues = validateRichTextV2({
      version: 2,
      text,
      annotations: marksToAnnotations(text, { ...marks, roles })
    });
    if (issues.length > 0) {
      setValidationMessage(richTextIssueMessage(issues[0]));
      return false;
    }
    commit((current) => ({ ...current, marks: { ...current.marks, roles } }));
    return true;
  };

  const handleRoleRange = (
    start: number,
    end: number,
    mode: "click" | "drag"
  ) => {
    if (brush.kind !== "role") return;
    const level = brush.level;
    const token = tokenIndexAt(tokens, start);
    if (
      mode === "click" &&
      roleAnchor &&
      token !== undefined &&
      roleAnchor.token === token &&
      roleAnchor.start !== start
    ) {
      const bridge = {
        start: Math.min(roleAnchor.start, start),
        end: Math.max(roleAnchor.end, end),
        level
      };
      paintRoles(applyRoleRange(text, marks.roles, bridge, { toggle: false }));
      setRoleAnchor(undefined);
      return;
    }
    // 拖过换行的区间按行各自上色：wire 不接受跨段落的标注。
    let roles = marks.roles;
    for (const piece of splitRangeAtParagraphs(text, start, end)) {
      roles = applyRoleRange(text, roles, { ...piece, level });
    }
    if (!paintRoles(roles)) return;
    // 只有「这一下真把字母上了色」才留锚点：取消上色或拖选之后都不留。
    const painted = unitAt(roles, start)?.level === level;
    setRoleAnchor(
      mode === "click" && painted && token !== undefined
        ? { token, start, end }
        : undefined
    );
  };

  const selectionHasFormat = (
    type: "italic" | "bold" | "underline",
    selection = textSelection
  ) => {
    const ranges = selection
      ? splitRangeAtParagraphs(text, selection.start, selection.end)
      : [];
    return (
      ranges.length > 0 &&
      ranges.every((range) => {
        let coveredEnd = range.start;
        const formats = marks.passthrough
          .filter(
            (
              annotation
            ): annotation is Exclude<
              RichTextV2["annotations"][number],
              { type: "pause" }
            > => annotation.type === type
          )
          .sort((left, right) => left.start - right.start);
        for (const annotation of formats) {
          if (annotation.start > coveredEnd) return false;
          coveredEnd = Math.max(coveredEnd, annotation.end);
          if (coveredEnd >= range.end) return true;
        }
        return false;
      })
    );
  };
  const toggleTextFormat = (
    type: "italic" | "bold" | "underline",
    selection = textSelection
  ) => {
    if (readOnly || !selection) return;
    const selectionRanges = splitRangeAtParagraphs(
      text,
      selection.start,
      selection.end
    );
    let passthrough = marks.passthrough;
    if (selectionHasFormat(type, selection)) {
      for (const range of selectionRanges) {
        passthrough = passthrough.flatMap((annotation) => {
          if (
            annotation.type !== type ||
            annotation.end <= range.start ||
            annotation.start >= range.end
          )
            return [annotation];
          return [
            ...(annotation.start < range.start
              ? [{ ...annotation, end: range.start }]
              : []),
            ...(annotation.end > range.end
              ? [{ ...annotation, start: range.end }]
              : [])
          ];
        });
      }
    } else {
      passthrough = [
        ...passthrough,
        ...selectionRanges.map((range) => ({
          type,
          ...range
        }))
      ];
    }
    const issues = validateRichTextV2({
      version: 2,
      text,
      annotations: marksToAnnotations(text, { ...marks, passthrough })
    });
    if (issues.length > 0) {
      setValidationMessage(richTextIssueMessage(issues[0]));
      return;
    }
    const normalized = normalizeRichTextV2({
      version: 2,
      text,
      annotations: passthrough
    }).annotations;
    commit((current) => ({
      ...current,
      marks: { ...current.marks, passthrough: normalized }
    }));
  };

  const removePause = (gapIndex: number) => {
    if (readOnly || marks.pauses[gapIndex] === undefined) return;
    commit((current) => {
      const pauses = { ...current.marks.pauses };
      delete pauses[gapIndex];
      return { ...current, marks: { ...current.marks, pauses } };
    });
  };

  const inspectPause = (gapIndex: number) => {
    if (readOnly) return;
    if (brush.kind === "erase") {
      removePause(gapIndex);
      return;
    }
    changeBrush({ kind: "none" });
    setPauseGap(gapIndex);
    setCustomPause("");
    setOpenTool("pause");
  };

  const crossesGap = (link: LiaisonLink, gap: number) => {
    const token = tokens[gap];
    return (
      token !== undefined &&
      link.start.start < token.end &&
      link.end.end > token.end
    );
  };

  const requestPause = (gap: number, durationMs: number) => {
    if (readOnly || speechCapabilities?.supportsPause === false) return;
    const links = marks.liaisons.flatMap((link, index) =>
      crossesGap(link, gap) ? [index] : []
    );
    setOpenTool(undefined);
    if (links.length) {
      setPendingConflict({ kind: "pause", gap, durationMs, links });
      return;
    }
    if (marks.pauses[gap] !== durationMs) {
      commit((current) => ({
        ...current,
        marks: {
          ...current.marks,
          pauses: { ...current.marks.pauses, [gap]: durationMs }
        }
      }));
    }
    changeBrush({ kind: "pause", durationMs });
  };

  const confirmConflict = () => {
    if (readOnly || !pendingConflict) return;
    const pending = pendingConflict;
    commit((current) => {
      if (pending.kind === "pause")
        return {
          ...current,
          marks: {
            ...current.marks,
            liaisons: current.marks.liaisons.filter(
              (_, index) => !pending.links.includes(index)
            ),
            pauses: {
              ...current.marks.pauses,
              [pending.gap]: pending.durationMs
            }
          }
        };
      const pauses = { ...current.marks.pauses };
      pending.gaps.forEach((gap) => delete pauses[gap]);
      return {
        ...current,
        marks: {
          ...current.marks,
          pauses,
          liaisons: [...current.marks.liaisons, pending.link]
        }
      };
    });
    if (pending.kind === "pause") {
      changeBrush({ kind: "pause", durationMs: pending.durationMs });
    } else {
      resetTransient();
    }
  };

  const applyPause = (durationMs: number) => {
    if (readOnly || !pauseActive || speechCapabilities?.supportsPause === false)
      return;
    if (brush.kind === "pause" || pauseGap === undefined) {
      changeBrush({ kind: "pause", durationMs });
      setOpenTool(undefined);
      return;
    }
    requestPause(pauseGap, durationMs);
  };

  const handleGapClick = (gapIndex: number) => {
    if (brush.kind === "erase") {
      removePause(gapIndex);
      return;
    }
    if (brush.kind === "none" && openTool === "pause") {
      inspectPause(gapIndex);
      return;
    }
    if (brush.kind !== "pause") return;
    requestPause(gapIndex, brush.durationMs);
  };

  /**
   * 端别由面板上的「起点 / 终点」开关决定，不按点击先后推断。
   * 早先「第一个词是起点、点到另一个词就是终点」的自动判定，让人没法先定终点
   * 再回头选起点，也没法选完终点后回去改起点。
   *
   * 同一端内点第二个字母，把两次点击之间整段收进来，跨过空格也照收——一端本来
   * 就可能盖住相邻几个词。点已经选中的字母则收回到该字母，用来就地重来。
   * 成线仍由「添加连读」显式确认。
   */
  const handleLetterClick = (letter: LiaisonAnchor) => {
    if (brush.kind !== "liaison") return;
    setDraft((current) => {
      const existing = current[liaisonEnd];
      return {
        ...current,
        [liaisonEnd]: existing ? extendAnchor(existing, letter) : letter
      };
    });
  };

  const findLiaison = (link: LiaisonLink) =>
    marks.liaisons.findIndex(
      (existing) =>
        existing.start.start === link.start.start &&
        existing.start.end === link.start.end &&
        existing.end.start === link.end.start &&
        existing.end.end === link.end.end
    );

  const selectionHasLiaison =
    !!textSelection &&
    findLiaison({
      start: makeAnchor(textSelection.start),
      end: makeAnchor(textSelection.end - 1)
    }) >= 0;

  const commitLiaison = (
    selected: LiaisonDraft = draft,
    selection = textSelection
  ) => {
    if (readOnly || !selected.start || !selected.end) return;
    const link =
      selected.start.start <= selected.end.start
        ? { start: selected.start, end: selected.end }
        : { start: selected.end, end: selected.start };
    if (!isValidLiaison(link)) {
      setValidationMessage(
        createVoiceEditorMessage("select_valid_liaison_endpoints")
      );
      return;
    }
    const existingIndex = findLiaison(link);
    if (existingIndex >= 0) {
      commit((current) => ({
        ...current,
        marks: {
          ...current.marks,
          liaisons: current.marks.liaisons.filter(
            (_, index) => index !== existingIndex
          )
        }
      }));
      resetTransient();
      setTextSelection(selection);
      return;
    }
    if (crossesParagraph(text, link)) {
      // wire 不接受跨换行的标注；放进来的话本地就折算不出合法 wire，
      // 从此改动静默停止回写，比当场说清楚糟得多。
      setValidationMessage(
        createVoiceEditorMessage(
          "liaison_cannot_cross_a_line_break_put_both_words_on_the_same_line"
        )
      );
      return;
    }
    const gaps = Object.keys(marks.pauses)
      .map(Number)
      .filter((gap) => crossesGap(link, gap));
    if (gaps.length) {
      setOpenTool(undefined);
      setPendingConflict({ kind: "liaison", link, gaps });
      return;
    }
    commit((current) => ({
      ...current,
      marks: { ...current.marks, liaisons: [...current.marks.liaisons, link] }
    }));
    resetTransient();
    setTextSelection(selection);
  };

  const resetDraft = resetTransient;

  const toggleSelectionLiaison = (selection = textSelection) => {
    if (!selection || selection.end - selection.start < 2) return;
    commitLiaison(
      {
        start: makeAnchor(selection.start),
        end: makeAnchor(selection.end - 1)
      },
      selection
    );
  };

  const handleLiaisonClick = (index: number) => {
    if (readOnly || (brush.kind !== "liaison" && brush.kind !== "erase"))
      return;
    commit((current) => ({
      ...current,
      marks: {
        ...current.marks,
        liaisons: current.marks.liaisons.filter(
          (_, position) => position !== index
        )
      }
    }));
  };

  const clearAll = () => {
    // 正文编辑保留历史音标；试听模式明确清除本次标注和临时读法关联。
    commit((current) => ({
      ...current,
      ...(mode === "voice-trial" ? { readingLinks: [] } : {}),
      marks: {
        ...current.marks,
        roles: [],
        liaisons: [],
        pauses: {},
        passthrough:
          mode === "voice-trial"
            ? []
            : current.marks.passthrough.filter(
                (annotation) =>
                  annotation.type !== "italic" &&
                  annotation.type !== "bold" &&
                  annotation.type !== "underline"
              )
      }
    }));
    resetDraft();
  };

  const toggleVoice = (voiceId: string) => {
    const setting = voiceSettingFor(
      displayedSettings,
      voiceId,
      editingVersionKey
    );
    if (setting?.enabled) {
      updateVoice(voiceId, { enabled: false });
      return;
    }
    const voice = voices.find((item) => item.id === voiceId);
    if (!voice || !speechAccentGroup(voice.locale)) return;
    if (
      voiceSettings.some((item) => item.enabled && !voiceLocale(item, voices))
    ) {
      setRecommendationError(
        createVoiceEditorMessage(
          "an_enabled_unavailable_voice_has_an_unknown_accent_disable_it_before_select_2"
        )
      );
      return;
    }
    const selected = withNativeVoiceVersion(
      setting ?? {
        voice_id: voiceId,
        enabled: false,
        rate_percent: 0,
        ...voice.defaultSettings
      },
      voice
    );
    const existing =
      setting && voiceSettingKey(selected) !== voiceSettingKey(setting)
        ? displayedSettings.filter(
            (item) => voiceSettingKey(item) !== voiceSettingKey(setting)
          )
        : displayedSettings;
    changeVoiceSettings(
      selectVoiceVersion(
        existing,
        selected,
        voice.locale as `en-${string}`,
        voices,
        !!recommendationArea
      )
    );
  };

  /** 自定义停顿按毫秒输入，与底层模型同单位，避免多一层换算。 */
  const applyCustomPause = (raw: string) => {
    if (readOnly || !pauseActive) return;
    const durationMs = Number(raw.trim());
    if (
      !raw.trim() ||
      !Number.isInteger(durationMs) ||
      durationMs < MIN_PAUSE_MS ||
      durationMs > MAX_PAUSE_MS
    ) {
      setValidationMessage(
        createVoiceEditorMessage(
          "pause_duration_must_be_an_integer_between_and_milliseconds",
          { p0: MIN_PAUSE_MS, p1: MAX_PAUSE_MS }
        )
      );
      return;
    }
    applyPause(durationMs);
    setValidationMessage("");
  };

  /*
   * 折算不出合法 wire 时不上抛（不能把坏值写进表单），但必须说清楚「现在改的东西
   * 没有被保存」——只报一条规则的话，用户会以为改动已经生效。
   */
  const blockingError =
    validationMessage ||
    (working.error &&
      t("edits_here_will_not_be_saved_until_this_is_corrected", {
        p0: working.error
      })) ||
    (loadError
      ? t("previous_annotations_could_not_be_read_only_the_text_was_retained", {
          p0: errorMessage(loadError, t)
        })
      : "");

  const conflictCount = Object.keys(marks.pauses).filter((gap) =>
    marks.liaisons.some((link) => crossesGap(link, Number(gap)))
  ).length;

  // TTS 试听与资产试听同一时间只响一路；历史冲突保留数据，先由编辑者处理。
  const handleAudition = (
    voice: VoiceOption,
    setting?: VoiceSetting,
    catalog = false
  ) => {
    if (!previewEnabled) return;
    if (
      conflictCount > 0 ||
      ((mode === "synthesis" || mode === "phoneme-settings") &&
        locale &&
        voice.locale.toLowerCase() !== locale.toLowerCase())
    )
      return;
    stopAssetPlayback();
    stopSsmlRef.current?.();
    stopReferenceRef.current?.();
    audition(
      voice,
      setting ??
        voiceSettingFor(displayedSettings, voice.id, editingVersionKey),
      catalog
        ? {
            version: 2,
            text: "Hello, this is a voice preview.",
            annotations: []
          }
        : undefined
    );
  };

  /**
   * 一条上传的三步（申请许可 → 直传 → confirm）都在适配器里；这里只管排队、进度、
   * 成功入列、失败留在队列可重试。StrictMode 下更新函数会跑两次，所以启动请求
   * 这类副作用都放在更新函数之外。
   */
  const patchPending = (id: string, patch: Partial<PendingUpload>) =>
    setPendingUploads((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  const dropPending = (id: string) =>
    setPendingUploads((current) => current.filter((item) => item.id !== id));

  const startUpload = (entry: PendingUpload) => {
    if (!audioUploadAdapter || !audioUploadAllowed || readOnly) return;
    const controller = new AbortController();
    uploadControllersRef.current.set(entry.id, controller);
    patchPending(entry.id, { error: undefined, progress: 0 });
    audioUploadAdapter
      .upload({
        file: entry.file,
        locale: entry.locale,
        gender: entry.gender,
        signal: controller.signal,
        // 进度条只显示整数百分比，同一个百分点内的事件不必重渲染
        onProgress: (ratio) =>
          setPendingUploads((current) => {
            const item = current.find((candidate) => candidate.id === entry.id);
            if (
              !item ||
              progressPercent(item.progress) === progressPercent(ratio)
            )
              return current;
            return current.map((candidate) =>
              candidate.id === entry.id
                ? { ...candidate, progress: ratio }
                : candidate
            );
          })
      })
      .then(
        (asset) => {
          if (controller.signal.aborted) return;
          uploadControllersRef.current.delete(entry.id);
          dropPending(entry.id);
          emitAssets([...assetsRef.current, asset]);
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          uploadControllersRef.current.delete(entry.id);
          patchPending(entry.id, { error: uploadFailure(error) });
        }
      );
  };

  const addAudioFiles = (files: FileList) => {
    if (!audioUploadAdapter || !audioUploadAllowed || readOnly) return;
    // 名额 = 上限 − 已落成 − 还在路上的；预检不过的那些不占名额。
    const inFlight = pendingUploads.filter((item) => !item.error).length;
    let room = audioAssetLimit - assetsRef.current.length - inFlight;
    const entries: PendingUpload[] = [...files].map((file) => {
      // id 不用 crypto.randomUUID：测试服是裸 HTTP 的非安全上下文，该 API 缺失。
      uploadSeqRef.current += 1;
      let error = preflightAudioFile(file, undefined, t);
      if (!error) {
        if (room <= 0) error = tooManyAudioError(audioAssetLimit, t);
        else room -= 1;
      }
      return {
        id: `upload-${uploadSeqRef.current}`,
        file,
        name: file.name,
        locale: upload.locale,
        gender: upload.gender,
        progress: 0,
        error: error ? uploadFailure(error) : undefined
      };
    });
    setPendingUploads((current) => [...current, ...entries]);
    entries.filter((entry) => !entry.error).forEach(startUpload);
  };

  const retryUpload = (id: string) => {
    const entry = pendingUploads.find((item) => item.id === id);
    if (entry) startUpload(entry);
  };

  const dismissUpload = (id: string) => {
    if (readOnly) return;
    uploadControllersRef.current.get(id)?.abort();
    uploadControllersRef.current.delete(id);
    dropPending(id);
  };

  /**
   * 移除只是把引用从草稿里去掉（保存后才生效），对象由后端按引用回收。
   * 不进撤销栈：音频不属于「文本 + 标注」的快照，硬塞进去两套历史会打架，
   * 面板里那一步确认（Popconfirm）兜底。
   */
  const removeAsset = (asset: AudioAsset) => {
    if (readOnly) return;
    if (playingAssetId === asset.id) stopAssetPlayback();
    emitAssets(assetsRef.current.filter((item) => item.id !== asset.id));
  };

  const PLAYBACK_FAILED = t(
    "audio_cannot_currently_be_auditioned_try_again_later"
  );

  const playAsset = async (asset: AudioAsset) => {
    if (playingAssetId === asset.id) {
      stopAssetPlayback();
      return;
    }
    stopAssetPlayback();
    stopAudition();
    stopSsmlRef.current?.();
    stopReferenceRef.current?.();
    if (!audioUploadAdapter) return;
    setPlaybackMessage(undefined);
    // 取 URL 期间就算「在播」：再点一次是停止，连点不会起第二路
    playingAssetIdRef.current = asset.id;
    setPlayingAssetId(asset.id);
    const request = new AbortController();
    playRequestRef.current = request;
    const cached = assetUrlCacheRef.current.get(asset.id);
    let resolved =
      cached && isSignedUrlFresh(cached.expiresAt) ? cached : undefined;
    if (!resolved) {
      try {
        resolved = await audioUploadAdapter.resolveUrl(asset.id, {
          signal: request.signal
        });
      } catch {
        if (request.signal.aborted) return;
        stopAssetPlayback();
        setPlaybackMessage(PLAYBACK_FAILED);
        return;
      }
      // 等 URL 期间被停掉 / 换了一条 / 卸载了：这一路作废
      if (request.signal.aborted) return;
      assetUrlCacheRef.current.set(asset.id, resolved);
    }
    playRequestRef.current = null;
    const audio = new Audio(resolved.url);
    uploadAudioRef.current = audio;
    setAssetReview({
      audio,
      name: asset.original_name,
      result: {
        audioUrl: resolved.url,
        expiresAt: resolved.expiresAt,
        cached: true,
        originalName: asset.original_name,
        ...(audioUploadAdapter.loadAudio
          ? {
              loadAudio: (options?: { signal?: AbortSignal }) =>
                audioUploadAdapter.loadAudio!(asset.id, options)
            }
          : {})
      }
    });
    audio.addEventListener(
      "ended",
      () => {
        if (uploadAudioRef.current === audio) setPlayingAssetId(undefined);
      },
      { once: true }
    );
    void audio.play().catch(() => {
      if (uploadAudioRef.current !== audio) return;
      stopAssetPlayback();
      setPlaybackMessage(PLAYBACK_FAILED);
    });
  };

  const roleLevel = brush.kind === "role" ? brush.level : lastRoleRef.current;
  const roleLabel =
    Object.values(grammarRoleDefinitions(t)).find(
      (role) => role.level === roleLevel
    )?.label ?? Object.values(grammarRoleDefinitions(t))[0]!.label;
  const pauseDuration =
    brush.kind === "pause" ? brush.durationMs : lastPauseRef.current;

  /* 存储未开通由适配器记一次（同一页可能挂着几十个编辑器），这里每次渲染直接问。 */
  const storageUnavailable =
    audioUploadAdapter?.isStorageUnavailable?.() ?? false;

  const readingSegment =
    textSelection && wordSegments(text, [textSelection])[0];
  const selectedReading =
    readingSegment &&
    speechLinks.find((link) =>
      rangesOverlap(link.source_segments, [readingSegment])
    );
  const speechRangeOverlaps = (
    mark: RichTextV2["annotations"][number],
    range: { start: number; end: number }
  ) =>
    (mark.type === "phoneme" ||
      mark.type === "say_as" ||
      mark.type === "sub") &&
    mark.start < range.end &&
    mark.end > range.start;
  const withoutReadingLinks = (
    current: EditorSnapshot<TLink>,
    range: { start: number; end: number }
  ) =>
    mode === "voice-trial"
      ? (current.readingLinks ?? []).filter(
          (link) =>
            !link.source_segments.some(
              (segment) =>
                segment.start < range.end && segment.end > range.start
            )
        )
      : current.readingLinks;
  const tools = [
    ...(mode === "voice-trial"
      ? [
          {
            key: "phoneme",
            label: t("enter_phonemes"),
            disabled:
              !textSelection || speechCapabilities?.supportsPhoneme === false,
            disabledReason:
              speechCapabilities?.supportsPhoneme === false
                ? t("this_voice_does_not_support_specified_phonemes_yet")
                : undefined,
            content: (
              <Space orientation="vertical" size={8}>
                <Select
                  aria-label={t("phonetic_alphabet")}
                  value={phonemeAlphabet}
                  options={[
                    {
                      value: "ipa",
                      label: t("ipa_international_phonetic_alphabet")
                    },
                    { value: "ups", label: t("ups_universal_phone_set") }
                  ]}
                  onChange={setPhonemeAlphabet}
                />
                <Input.TextArea
                  aria-label={t("specified_phonemes")}
                  value={phonemeText}
                  onChange={(event) => setPhonemeText(event.target.value)}
                  autoSize={{ minRows: 2, maxRows: 5 }}
                />
                <Space>
                  <Button
                    disabled={
                      readOnly ||
                      !textSelection ||
                      !phonemeText.trim() ||
                      speechCapabilities?.supportsPhoneme === false
                    }
                    onClick={() => {
                      if (
                        !textSelection ||
                        speechCapabilities?.supportsPhoneme === false
                      )
                        return;
                      const range = { ...textSelection };
                      const nextMarks = {
                        ...marks,
                        passthrough: [
                          ...marks.passthrough.filter(
                            (mark) => !speechRangeOverlaps(mark, range)
                          ),
                          {
                            type: "phoneme" as const,
                            ...range,
                            alphabet: phonemeAlphabet,
                            phoneme: phonemeText.trim()
                          }
                        ]
                      };
                      const issue = validateRichTextV2({
                        version: 2,
                        text,
                        annotations: marksToAnnotations(text, nextMarks)
                      })[0];
                      if (issue) {
                        setValidationMessage(richTextIssueMessage(issue));
                        return;
                      }
                      commit((current) => ({
                        ...current,
                        marks: nextMarks,
                        readingLinks: withoutReadingLinks(current, range)
                      }));
                      setValidationMessage("");
                      setOpenTool(undefined);
                    }}
                  >
                    {t("apply_phonemes")}
                  </Button>
                  <Button
                    disabled={readOnly || !textSelection}
                    onClick={() => {
                      if (!textSelection) return;
                      commit((current) => ({
                        ...current,
                        marks: {
                          ...current.marks,
                          passthrough: current.marks.passthrough.filter(
                            (mark) =>
                              mark.type !== "phoneme" ||
                              !speechRangeOverlaps(mark, textSelection)
                          )
                        }
                      }));
                      setValidationMessage("");
                      setOpenTool(undefined);
                    }}
                  >
                    {t("delete_phonemes")}
                  </Button>
                </Space>
              </Space>
            )
          }
        ]
      : []),
    ...(renderReadingPicker
      ? [
          {
            key: "reading-link",
            label: t("link_a_word_reading"),
            icon: <LinkIcon aria-hidden />,
            disabled:
              readOnly ||
              !readingSegment ||
              speechCapabilities?.supportsPhoneme === false,
            disabledReason:
              speechCapabilities?.supportsPhoneme === false
                ? t("this_voice_does_not_support_linked_word_readings_yet")
                : undefined,
            content:
              readingSegment && openTool === "reading-link"
                ? renderReadingPicker({
                    kind: "word",
                    segments: selectedReading?.source_segments ?? [
                      readingSegment
                    ],
                    selected: selectedReading,
                    onPendingChange: setAssociationDraftPending,
                    onCancel: () => {
                      setOpenTool(undefined);
                      setAssociationDraftPending(false);
                    },
                    onSelect: (next) => {
                      if (
                        readOnly ||
                        speechCapabilities?.supportsPhoneme === false
                      )
                        return;
                      commit((current) => ({
                        ...current,
                        ...(mode === "voice-trial" && next
                          ? {
                              marks: {
                                ...current.marks,
                                passthrough: current.marks.passthrough.filter(
                                  (mark) =>
                                    !next.source_segments.some((segment) =>
                                      speechRangeOverlaps(mark, segment)
                                    )
                                )
                              }
                            }
                          : {}),
                        readingLinks: [
                          ...(current.readingLinks ?? []).filter(
                            (link) => link.id !== selectedReading?.id
                          ),
                          ...(next ? [next] : [])
                        ]
                      }));
                    }
                  })
                : undefined
          }
        ]
      : []),
    {
      key: "reading",
      label: t("special_reading"),
      icon: <Volume2Icon aria-hidden />,
      disabled:
        readOnly ||
        !textSelection ||
        (speechCapabilities?.supportsSayAs === false &&
          speechCapabilities?.supportsSub === false),
      disabledReason:
        speechCapabilities?.supportsSayAs === false &&
        speechCapabilities?.supportsSub === false
          ? t("this_voice_does_not_support_special_readings_yet")
          : undefined,
      content: (
        <Space orientation="vertical" size={8}>
          <Select
            aria-label={t("special_reading_type")}
            value={readingKind}
            onChange={setReadingKind}
            options={[
              {
                value: "characters",
                disabled: speechCapabilities?.supportsSayAs === false,
                label: t("spell_out")
              },
              {
                value: "cardinal",
                disabled: speechCapabilities?.supportsSayAs === false,
                label: t("cardinal_number")
              },
              {
                value: "ordinal",
                disabled: speechCapabilities?.supportsSayAs === false,
                label: t("ordinal_number")
              },
              {
                value: "digits",
                disabled: speechCapabilities?.supportsSayAs === false,
                label: t("digits")
              },
              {
                value: "date",
                disabled: speechCapabilities?.supportsSayAs === false,
                label: t("date")
              },
              {
                value: "time",
                disabled: speechCapabilities?.supportsSayAs === false,
                label: t("time")
              },
              {
                value: "telephone",
                disabled: speechCapabilities?.supportsSayAs === false,
                label: t("telephone_number")
              },
              {
                value: "sub",
                disabled: speechCapabilities?.supportsSub === false,
                label: t("read_replacement_text")
              }
            ]}
          />
          {readingKind === "sub" && (
            <Input
              aria-label={t("replacement_reading_text")}
              value={readingAlias}
              maxLength={200}
              onChange={(event) => setReadingAlias(event.target.value)}
            />
          )}
          <Button
            disabled={
              !textSelection ||
              readOnly ||
              (readingKind === "sub"
                ? !readingAlias.trim() ||
                  speechCapabilities?.supportsSub === false
                : speechCapabilities?.supportsSayAs === false)
            }
            onClick={() => {
              if (
                !textSelection ||
                (readingKind === "sub"
                  ? speechCapabilities?.supportsSub === false
                  : speechCapabilities?.supportsSayAs === false)
              )
                return;
              const range = { ...textSelection };
              const annotation =
                readingKind === "sub"
                  ? { type: "sub" as const, ...range, alias: readingAlias }
                  : {
                      type: "say_as" as const,
                      ...range,
                      interpret_as: readingKind as "characters"
                    };
              commit((current) => ({
                ...current,
                readingLinks: withoutReadingLinks(current, range),
                marks: {
                  ...current.marks,
                  passthrough: [
                    ...current.marks.passthrough.filter(
                      (mark) =>
                        !(
                          mark.type === "say_as" ||
                          mark.type === "sub" ||
                          (mode === "voice-trial" && mark.type === "phoneme")
                        ) ||
                        mark.end <= range.start ||
                        mark.start >= range.end
                    ),
                    annotation
                  ]
                }
              }));
              setOpenTool(undefined);
            }}
          >
            {t("apply_special_reading")}
          </Button>
          <Button
            disabled={!textSelection || readOnly}
            onClick={() => {
              if (!textSelection) return;
              const range = { ...textSelection };
              commit((current) => ({
                ...current,
                marks: {
                  ...current.marks,
                  passthrough: current.marks.passthrough.filter(
                    (mark) =>
                      !(mark.type === "say_as" || mark.type === "sub") ||
                      mark.end <= range.start ||
                      mark.start >= range.end
                  )
                }
              }));
              setOpenTool(undefined);
            }}
          >
            {t("delete_special_reading")}
          </Button>
        </Space>
      )
    },
    ...(mode === "grammar" ||
    mode === "association" ||
    mode === "spelling" ||
    mode === "actual-pron"
      ? [
          {
            key: "erase",
            label: t("clear_mode"),
            className: "tsz-ve-clear-mode",
            active: brush.kind === "erase"
          }
        ]
      : []),
    {
      key: "text",
      label: contentReadOnly
        ? t("end_linking")
        : mode === "grammar" ||
            mode === "association" ||
            mode === "spelling" ||
            mode === "actual-pron"
          ? t("text_editing")
          : t("text"),

      ariaLabel: contentReadOnly ? t("end_linking") : t("edit_text"),
      icon: <PencilIcon />,
      active: brush.kind === "none",
      className: "tsz-ve-text-button"
    },
    ...(mode === "grammar" ||
    mode === "spelling" ||
    (mode === "association" && textFormattingEnabled)
      ? [
          {
            key: "italic",
            label: t("italic"),
            icon: <ItalicIcon />,
            active: selectionHasFormat("italic"),
            disabled: !textSelection
          }
        ]
      : []),
    ...(mode === "association" && textFormattingEnabled
      ? [
          {
            key: "bold",
            label: t("bold"),
            icon: <BoldIcon />,
            active: selectionHasFormat("bold"),
            disabled: !textSelection
          },
          {
            key: "underline",
            label: t("underline"),
            icon: <UnderlineIcon />,
            active: selectionHasFormat("underline"),
            disabled: !textSelection
          }
        ]
      : []),
    {
      key: "roles",
      label: t("grammar_structures"),
      ariaLabel: t("grammar_structure", { p0: roleLabel }),
      className: `tsz-ve-role-button is-${roleLevel}`,
      active: !!textSelection || brush.kind === "role",
      disabled: !textSelection && brush.kind !== "role",
      icon: (
        <span
          className={`tsz-ve-pop-swatch is-${roleLevel} tsz-ve-role-dot`}
          aria-hidden
        />
      ),
      content: (
        <RolePanel
          readOnly={readOnly}
          hasWords={tokens.length > 0}
          onBrushChange={pickBrush}
          selectionText={
            textSelection
              ? Array.from(text)
                  .slice(textSelection.start, textSelection.end)
                  .join("")
              : undefined
          }
          selectedLevel={
            textSelection
              ? marks.roles.find(
                  (role) =>
                    role.start <= textSelection.start &&
                    role.end >= textSelection.end
                )?.level
              : undefined
          }
        />
      )
    },
    {
      key: "liaison",
      label: t("liaison"),
      icon: <LiaisonIcon />,
      className: "tsz-ve-liaison-button",
      active: !!textSelection,
      disabled: !textSelection,
      content: (
        <div
          className="tsz-ve-selection-liaison"
          onMouseDown={(event) => event.preventDefault()}
        >
          <Button
            size="small"
            icon={<LiaisonIcon part="start" />}
            iconPlacement="end"
            disabled={readOnly || !textSelection}
            onClick={() => {
              if (!textSelection) return;
              setDraft({ start: { ...textSelection } });
            }}
          >
            {t("liaison_start")}
          </Button>
          <Button
            size="small"
            icon={<LiaisonIcon part="end" />}
            iconPlacement="start"
            disabled={readOnly || !draft.start || !textSelection}
            onClick={() => {
              if (textSelection)
                commitLiaison({
                  start: draft.start,
                  end: { ...textSelection }
                });
            }}
          >
            {t("liaison_end")}
          </Button>
          <Tooltip title={<ShortcutHint shortcut="L" />}>
            <Button
              size="small"
              icon={<LiaisonIcon />}
              iconPlacement="end"
              disabled={
                readOnly ||
                !textSelection ||
                textSelection.end - textSelection.start < 2
              }
              aria-pressed={selectionHasLiaison}
              onClick={() => toggleSelectionLiaison()}
            >
              {selectionHasLiaison ? t("cancel_liaison") : t("add_once")}
            </Button>
          </Tooltip>
          {draft.start && (
            <Button size="small" onClick={resetDraft}>
              {t("cancel_start")}
            </Button>
          )}
          <span>
            {draft.start
              ? t("start_select_the_endpoint_text", {
                  p0: Array.from(text)
                    .slice(draft.start.start, draft.start.end)
                    .join("")
                })
              : textSelection
                ? t("selected_6", {
                    p0: Array.from(text)
                      .slice(textSelection.start, textSelection.end)
                      .join("")
                  })
                : t("select_text_before_adding_liaison")}
          </span>
        </div>
      )
    },
    {
      key: "pause",
      label: t("pause_3"),
      icon: <PauseIcon />,
      summary:
        brush.kind === "pause" ? formatPauseLabel(pauseDuration) : undefined,
      className: "tsz-ve-pause-button",
      active: pauseActive,
      disabled:
        tokens.length < 2 || speechCapabilities?.supportsPause === false,
      disabledReason:
        speechCapabilities?.supportsPause === false
          ? t("this_voice_does_not_support_pauses_yet")
          : undefined,
      placement: "topLeft" as const,
      stayOpen: true,
      content: (
        <PausePanel
          active={pauseActive}
          readOnly={readOnly}
          hasWords={tokens.length > 1}
          brush={brush}
          location={
            pauseGap !== undefined
              ? {
                  before: tokens[pauseGap]!.text,
                  after: tokens[pauseGap + 1]!.text
                }
              : undefined
          }
          duration={pauseGap !== undefined ? marks.pauses[pauseGap] : undefined}
          onApply={applyPause}
          onRemove={() => {
            if (readOnly || pauseGap === undefined) return;
            removePause(pauseGap);
            setOpenTool(undefined);
          }}
          onClose={() => {
            setOpenTool(undefined);
            changeBrush({ kind: "none" });
          }}
          customPause={customPause}
          onCustomPauseChange={setCustomPause}
          onCustomPauseSubmit={applyCustomPause}
        />
      )
    },
    {
      key: "voices",
      label: t("pronunciation"),
      className: "tsz-ve-speech-tool",
      // 「已选」两字在窄容器里就是一行的代价，去掉后语义不减。
      summary: t("voices", { p0: enabledVoiceIds.length }),
      icon: <Volume2Icon />,
      content: (
        <div
          className="tsz-ve-speech-panel"
          aria-label={t("pronunciation_settings_and_audition")}
        >
          <div>
            <div className="tsz-ve-speech-panel-title">
              {mode === "synthesis" && locale === "en-GB"
                ? t("british_voice")
                : mode === "synthesis" && locale === "en-US"
                  ? t("american_voice")
                  : t("voice")}
            </div>
            {recommendationError && (
              <Alert type="warning" title={recommendationError} />
            )}
            {voiceSettings.some(
              (setting) =>
                setting.enabled &&
                !voices.some((voice) => voice.id === setting.voice_id)
            ) &&
              !voicesLoading && (
                <Alert
                  type="warning"
                  title={t(
                    "an_enabled_unavailable_voice_has_an_unknown_accent_disable_it_before_applyi_2"
                  )}
                />
              )}
            {visibleRecommendations.length > 0 && (
              <Space wrap style={{ marginBottom: 12 }}>
                <Select
                  aria-label={t("group_recommendations")}
                  placeholder={t("select_group_recommendation")}
                  value={recommendationId}
                  style={{ minWidth: 220 }}
                  onChange={setRecommendationId}
                  options={visibleRecommendations.map((item) => ({
                    value: item.id,
                    label: t("label_3", {
                      p0: item.groupName,
                      p1:
                        item.locale === "en-GB" ? t("british") : t("american"),
                      p2: item.name
                    }),
                    disabled: !recommendationAvailable(item)
                  }))}
                />
                <Button
                  disabled={
                    readOnly ||
                    !recommendationId ||
                    !onVoiceProfileChange ||
                    voiceSettings.some(
                      (setting) =>
                        setting.enabled &&
                        !voices.some((voice) => voice.id === setting.voice_id)
                    )
                  }
                  onClick={() => {
                    const item = recommendations.find(
                      (value) => value.id === recommendationId
                    );
                    if (!item || !recommendationAvailable(item)) return;
                    applyRecommendation(item);
                  }}
                >
                  {t("apply_to_current_text")}
                </Button>
              </Space>
            )}
            {loadRecommendations && recommendationArea && (
              <Space wrap style={{ marginBottom: 12 }}>
                <Tag>
                  {inherited
                    ? t("inherit_recommendations")
                    : voiceProfile?.dubbing
                      ? t("local_custom_settings")
                      : t("historical_custom_settings")}
                </Tag>
                <Button
                  disabled={readOnly || !onVoiceProfileChange}
                  onClick={() => void restoreRecommendations()}
                >
                  {t("restore_inherited_recommendations")}
                </Button>
                {(["en-GB", "en-US"] as const)
                  .filter((accent) => !locale || accent === locale)
                  .map((accent) => (
                    <Button
                      key={accent}
                      loading={refreshingRecommendations}
                      disabled={readOnly || !onVoiceProfileChange}
                      onClick={() => void useLatestRecommendation(accent)}
                    >
                      {t("use_latest_accent_recommendation", {
                        accent:
                          accent === "en-GB" ? t("british") : t("american")
                      })}
                    </Button>
                  ))}
              </Space>
            )}
            <VoiceVersions
              multiple={!!recommendationArea || !!voiceProfile?.dubbing}
              settings={displayedSettings}
              unavailableVersions={unavailableVersions}
              voices={voices}
              hasPause={generationContent.annotations.some(
                (mark) => mark.type === "pause"
              )}
              hasPhoneme={generationContent.annotations.some(
                (mark) => mark.type === "phoneme"
              )}
              locale={locale}
              phonemeLocale={
                mode === "synthesis" || mode === "phoneme-settings"
                  ? locale
                  : undefined
              }
              editingKey={editingVersionKey}
              canAudition={
                previewEnabled &&
                !!previewAdapter &&
                !!text.trim() &&
                conflictCount === 0
              }
              readOnly={readOnly || !onVoiceProfileChange}
              onEdit={setEditingVersionKey}
              onChange={changeVoiceSettings}
              onReorder={voiceProfile?.dubbing ? reorderVoices : undefined}
              onSelect={chooseVersion}
              onAudition={handleAudition}
              onGenerate={
                previewEnabled &&
                previewAdapter?.generateAudio &&
                !previewIsMock
                  ? generateVersionAudio
                  : undefined
              }
              generatingVersion={generatingVersion}
            />
            {previousAudio.map((setting) => {
              const voice = voices.find((item) => item.id === setting.voice_id);
              return voice ? (
                <Button
                  key={voiceSettingKey(setting)}
                  size="small"
                  disabled={!previewAdapter?.resolveAudio}
                  onClick={() => {
                    stopAssetPlayback();
                    stopSsmlRef.current?.();
                    stopReferenceRef.current?.();
                    audition(voice, setting);
                  }}
                >
                  {t("play_previous_audio")}{" "}
                  {setting.version_name ?? setting.voice_id}
                </Button>
              ) : null;
            })}
            <VoicePanel
              readOnly={readOnly}
              locale={locale}
              auditionLocale={
                mode === "synthesis" || mode === "phoneme-settings"
                  ? locale
                  : undefined
              }
              voices={voices}
              voicesLoading={voicesLoading}
              enabledVoiceIds={enabledVoiceIds}
              voiceSettings={displayedSettings}
              editingVersionKey={editingVersionKey}
              onRateChange={(voiceId, rate_percent) =>
                updateVoice(voiceId, { rate_percent })
              }
              onParametersChange={updateVoice}
              onToggleVoice={toggleVoice}
              pendingVoiceId={pendingVoiceId}
              playingVoiceId={playingVoiceId}
              canAudition={
                previewEnabled &&
                Boolean(previewAdapter) &&
                text.trim().length > 0 &&
                conflictCount === 0
              }
              onAudition={handleAudition}
              auditionStatus={
                conflictCount > 0
                  ? t("resolve_pause_and_liaison_conflicts_before_auditioning")
                  : previewAdapter
                    ? auditionStatus
                    : t("tts_backend_is_disabled_editing_is_still_available")
              }
            />
            {auditionMedia && (
              <AudioReview
                key={auditionMedia.result.audioUrl}
                media={auditionMedia}
                onPlay={() => {
                  stopAssetPlayback();
                  stopSsmlRef.current?.();
                  stopReferenceRef.current?.();
                }}
              />
            )}
            <ReferenceAudio
              registerStop={registerReferenceStop}
              onPlay={() => {
                stopAudition();
                stopAssetPlayback();
                stopSsmlRef.current?.();
              }}
            />
            {previewAdapter?.renderSsml && displayedSettings.length > 0 && (
              <SsmlReview
                adapter={previewAdapter}
                content={generationContent}
                settings={displayedSettings}
                registerStop={registerSsmlStop}
                onPlay={() => {
                  stopAudition();
                  stopAssetPlayback();
                  stopReferenceRef.current?.();
                }}
              />
            )}
          </div>
        </div>
      )
    },
    {
      key: "uploads",
      label: mode === "grammar" ? t("upload_audio") : t("audio"),
      ariaLabel: t("audio"),
      summary: assets.length > 0 ? String(assets.length) : undefined,
      icon: <MicIcon />,
      content: (
        <>
          <UploadPanel
            uploadAllowed={audioUploadAllowed}
            readOnly={readOnly}
            locale={locale}
            available={Boolean(audioUploadAdapter) && !storageUnavailable}
            unavailableReason={
              audioUploadAdapter
                ? t("audio_storage_is_unavailable_uploading_is_disabled")
                : t("audio_uploading_is_disabled")
            }
            upload={upload}
            onUploadChange={(next: Partial<UploadDraft>) =>
              setUpload((current) => ({ ...current, ...next }))
            }
            assets={assets}
            pending={pendingUploads}
            limit={audioAssetLimit}
            onAddFiles={addAudioFiles}
            onRetryUpload={retryUpload}
            onDismissUpload={dismissUpload}
            onRemoveAsset={removeAsset}
            onPlayAsset={(asset) => void playAsset(asset)}
            playingAssetId={playingAssetId}
            playbackMessage={playbackMessage}
          />
          {assetReview && (
            <AudioReview
              key={assetReview.result.audioUrl}
              media={assetReview}
              onPlay={() => {
                stopAudition();
                stopSsmlRef.current?.();
                stopReferenceRef.current?.();
              }}
            />
          )}
        </>
      )
    }
  ].filter((tool) => {
    if (mode === "voice-trial")
      return ["phoneme", "reading-link", "reading", "pause"].includes(tool.key);
    if (contentReadOnly) return tool.key === "roles" || tool.key === "text";
    if (textReadOnly && tool.key === "text") return false;
    // 字典音标只负责喂语音合成，连读是展示用的标注，归实际发音那一侧。
    // 判据必须是这个显式取值：默认的 pronunciation 还挂着别的调用方，
    // 摘在默认值上会连带把它们的连读也拿掉。
    if (mode === "phoneme-settings")
      return (
        tool.key === "pause" ||
        tool.key === "voices" ||
        tool.key === "reading" ||
        tool.key === "uploads"
      );
    if (mode === "spelling")
      return [
        "text",
        "italic",
        "liaison",
        "erase",
        "pause",
        "voices",
        "reading",
        "uploads"
      ].includes(tool.key);
    if (mode === "dict-phonetic")
      return tool.key !== "roles" && tool.key !== "liaison";
    // 实际发音只用于展示，其余工具都是冲着合成去的。
    if (mode === "actual-pron")
      return (
        tool.key === "text" || tool.key === "liaison" || tool.key === "erase"
      );
    if (mode === "pronunciation") return tool.key !== "roles";
    return true;
  });

  const localPool =
    recommendationArea && mode !== "actual-pron" && !contentReadOnly ? (
      <LocalVoicePool
        profile={voiceProfile}
        unavailableVersions={unavailableVersions}
        previousAudio={previousAudio}
        settings={
          inherited
            ? displayedSettings.map((item) =>
                effectiveSettings.some(
                  (effective) =>
                    voiceSettingKey(effective) === voiceSettingKey(item)
                )
                  ? item
                  : { ...item, enabled: false }
              )
            : displayedSettings
        }
        voices={voices}
        loading={voicesLoading}
        recommendations={recommendations}
        area={recommendationArea}
        locale={locale}
        content={generationContent}
        nativeAuditionLocale={
          mode === "synthesis" || mode === "phoneme-settings"
            ? locale
            : undefined
        }
        sourceKey={audioContentKey}
        adapter={
          previewIsMock || !previewEnabled
            ? {
                ...previewAdapter!,
                generateAudio: undefined,
                synthesizeSsml: undefined
              }
            : previewAdapter
        }
        readOnly={readOnly || !onVoiceProfileChange}
        canAudition={
          previewEnabled &&
          !!previewAdapter &&
          !!text.trim() &&
          conflictCount === 0
        }
        canAuditionCatalog={
          previewEnabled && !!previewAdapter && conflictCount === 0
        }
        auditionStatus={auditionStatus}
        auditionActive={!!(pendingVoiceId || playingVoiceId)}
        onStopAudition={stopAudition}
        error={recommendationError}
        pendingUpload={pendingUploads.some((item) => !item.error)}
        generatingVersion={generatingVersion}
        audioPending={automaticAudioPending}
        onRetryAudio={() => {
          automaticAudioAttempts.current.clear();
          setAutomaticAudioKeys([...automaticAudioKeys]);
          setRecommendationError("");
        }}
        onChange={(profile) => {
          if (readOnly || !onVoiceProfileChange) return;
          initialRecommendationPending.current = false;
          stopAudition();
          const pending = profile.voices
            .filter((setting) => setting.enabled && !setting.audio_asset_id)
            .map(voiceSettingKey);
          for (const key of automaticAudioAttempts.current.keys()) {
            if (!pending.includes(key))
              automaticAudioAttempts.current.delete(key);
          }
          if (generatingVersion && !pending.includes(generatingVersion)) {
            generationRequest.current?.abort();
            setGeneratingVersion(undefined);
          }
          setAutomaticAudioKeys(pending);
          setVoiceSettings(profile.voices);
          emittedProfileRef.current = JSON.stringify(profile);
          onVoiceProfileChange(profile);
        }}
        onAudition={handleAudition}
        onRestore={() => void restoreRecommendations()}
        onOpenDetail={(dialect) => {
          stopAudition();
          stopAssetPlayback();
          setUpload((current) => ({ ...current, locale: dialect }));
        }}
        onCloseDetail={stopAssetPlayback}
        audioTools={(dialect, stopDetailPlayback) => (
          <section aria-label={t("recordings_for_this_text_s_accent")}>
            <Typography.Title level={5}>
              {t("human_recording")}
            </Typography.Title>
            <p>
              {t("recordings_accent_help", {
                accent: dialect === "en-GB" ? t("british") : t("american")
              })}
            </p>
            <UploadPanel
              uploadAllowed={audioUploadAllowed}
              readOnly={readOnly}
              locale={dialect}
              available={!!audioUploadAdapter && !storageUnavailable}
              unavailableReason={
                audioUploadAdapter
                  ? t("audio_storage_is_unavailable_uploading_is_disabled")
                  : t("audio_uploading_is_disabled")
              }
              upload={{ ...upload, locale: dialect }}
              onUploadChange={(next) =>
                setUpload((current) => ({
                  ...current,
                  ...next,
                  locale: dialect
                }))
              }
              assets={assets.filter((asset) => asset.locale === dialect)}
              pending={pendingUploads.filter((item) => item.locale === dialect)}
              limit={audioAssetLimit}
              onAddFiles={addAudioFiles}
              onRetryUpload={retryUpload}
              onDismissUpload={dismissUpload}
              onRemoveAsset={removeAsset}
              onPlayAsset={(asset) => {
                stopDetailPlayback();
                void playAsset(asset);
              }}
              playingAssetId={playingAssetId}
              playbackMessage={playbackMessage}
            />
            {assetReview && (
              <AudioReview
                key={assetReview.result.audioUrl}
                media={assetReview}
                onPlay={() => {
                  stopDetailPlayback();
                  stopAudition();
                }}
              />
            )}
          </section>
        )}
      />
    ) : undefined;

  const unsupportedSpeech =
    workingValue.annotations.some(
      (mark) =>
        (mark.type === "phoneme" &&
          speechCapabilities?.supportsPhoneme === false) ||
        (mark.type === "pause" &&
          speechCapabilities?.supportsPause === false) ||
        (mark.type === "say_as" &&
          speechCapabilities?.supportsSayAs === false) ||
        (mark.type === "sub" && speechCapabilities?.supportsSub === false)
    ) ||
    (speechLinks.length > 0 && speechCapabilities?.supportsPhoneme === false);
  const editorReady =
    !blockingError &&
    !unsupportedSpeech &&
    pendingText === undefined &&
    !pendingConflict &&
    conflictCount === 0 &&
    !associationPickerOpen &&
    !associationDraftPending &&
    linkWords.length === 0 &&
    !draft.start &&
    !draft.end &&
    !generatingVersion &&
    !automaticAudioPending &&
    !pendingUploads.some((item) => !item.error);
  useEffect(
    () => onValidationChange?.(editorReady),
    [editorReady, onValidationChange]
  );
  if (mode === "synthesis") {
    return (
      <section
        className="tsz-ve-editor tsz-ve-synthesis"
        data-locale={locale}
        aria-label={
          contextLabel === "语音编辑器" ? t("voice_editor") : contextLabel
        }
      >
        {previewIsMock && <Tag color="warning">{t("mock_audition")}</Tag>}
        {localPool}
        {!localPool &&
          tools
            .filter((tool) => tool.key === "voices" || tool.key === "uploads")
            .map((tool) => (
              <div key={tool.key}>
                {tool.key === "uploads" &&
                !audioUploadAdapter &&
                assets.length === 0 ? (
                  <div className="tsz-ve-synthesis-upload-unavailable">
                    {t("human_recording_disabled")}
                  </div>
                ) : (
                  tool.content
                )}
              </div>
            ))}
        {renderActions && (
          <div className="tsz-ve-editor-actions">
            {renderActions(
              !voiceSavePending &&
                !automaticAudioPending &&
                !generatingVersion &&
                !pendingUploads.some((item) => !item.error),
              prepareComplete,
              captureResult
            )}
          </div>
        )}
      </section>
    );
  }

  // 外壳不另起可及名：名字归那个真正可编辑的文本框，避免同名两份。
  return (
    <section
      className="tsz-ve-editor"
      data-mode={mode}
      data-text-role={textRole}
      data-readonly={readOnly || undefined}
      /*
       * Esc 收笔挂在编辑器根节点而不是画布上：拿着笔时鼠标点不了光标，得有个
       * 不用瞄按钮的退路，而这时焦点常常还落在工具栏按钮上——挂在画布上收不到。
       * 浮层渲染在 portal（不在本节点内），所以「Esc 关浮层」不受影响，仍归 antd。
       */
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey) {
          const target = event.target as HTMLElement;
          // React portal 的事件也会冒泡；只处理当前编辑器，辅助输入保留原生快捷键。
          if (
            event.defaultPrevented ||
            event.altKey ||
            event.shiftKey ||
            event.nativeEvent.isComposing ||
            fullyReadOnly ||
            pendingText !== undefined ||
            pendingConflict ||
            associationPickerOpen ||
            !event.currentTarget.contains(target) ||
            target.closest(".tsz-ve-editor") !== event.currentTarget ||
            (target.closest("input, textarea, select, [contenteditable]") &&
              !target.matches("textarea.tsz-ve-canvas-input"))
          )
            return;
          const key = event.key.toLowerCase();
          const format =
            key === "b"
              ? "bold"
              : key === "i"
                ? "italic"
                : key === "u"
                  ? "underline"
                  : undefined;
          const tool = tools.find(
            (tool) =>
              tool.key === (format ?? (key === "l" ? "liaison" : undefined))
          );
          if (key !== "z" && !tool) return;
          event.preventDefault();
          event.stopPropagation();
          if (key === "l" && event.repeat) return;
          if (key === "z") undo();
          else if (!readOnly) {
            // 撤销后 DOM 可能仍保持原选区，再次全选不会触发 select，须读取实际选区。
            const selection =
              target instanceof HTMLTextAreaElement
                ? target.selectionEnd > target.selectionStart
                  ? {
                      start: Array.from(text.slice(0, target.selectionStart))
                        .length,
                      end: Array.from(text.slice(0, target.selectionEnd)).length
                    }
                  : undefined
                : textSelection;
            setTextSelection(selection);
            if (selection) {
              if (format) toggleTextFormat(format, selection);
              else toggleSelectionLiaison(selection);
            }
          }
          return;
        }
        if (event.key !== "Escape") return;
        if (
          brush.kind === "none" &&
          openTool !== "roles" &&
          openTool !== "pause" &&
          !textSelection
        )
          return;
        event.stopPropagation();
        openToolAndArm("text");
      }}
    >
      <Modal
        open={pendingText !== undefined}
        title={t("changing_text_will_remove_existing_annotations")}
        okText={t("confirm_changes")}
        cancelText={t("keep_original_text")}
        onOk={() => {
          if (pendingText !== undefined)
            changeText(pendingText, true, pendingTextCoalesceRef.current);
          setPendingText(undefined);
        }}
        onCancel={() => setPendingText(undefined)}
        okButtonProps={{ disabled: readOnly }}
      >
        {t(
          "this_change_removes_affected_liaison_marks_links_or_pauses_unaffected_annot"
        )}
      </Modal>
      <Modal
        destroyOnHidden
        open={!!pendingConflict}
        title={t("liaison_and_pause_cannot_share_the_same_position")}
        okText={
          pendingConflict?.kind === "pause"
            ? t("remove_conflicting_liaison_and_add_pause")
            : t("remove_conflicting_pauses_and_add_liaison")
        }
        cancelText={t("cancel_and_keep_original_annotations")}
        onOk={confirmConflict}
        onCancel={() => setPendingConflict(undefined)}
        okButtonProps={{ disabled: readOnly }}
        width={470}
      >
        <p>
          {pendingConflict?.kind === "pause"
            ? t(
                "this_position_is_inside_liaison_spans_remove_them_before_adding_a_second_pa",
                {
                  p0: pendingConflict.links.length,
                  p1: pendingConflict.durationMs / 1000
                }
              )
            : t("this_liaison_crosses_pauses_remove_them_first", {
                p0: pendingConflict?.gaps.length ?? 0
              })}
        </p>
        <p style={{ color: "#7c8593", fontSize: 12 }}>
          {t(
            "current_annotations_are_unchanged_replacement_requires_confirmation_and_can"
          )}
        </p>
      </Modal>
      {conflictCount > 0 && (
        <Alert
          type="warning"
          title={t(
            "current_content_has_overlapping_pause_and_liaison_marks_choose_which_annota",
            { p0: conflictCount }
          )}
          showIcon
        />
      )}
      {spellingNotice && <Alert type="info" title={spellingNotice} showIcon />}
      {blockingError && <Alert type="error" title={blockingError} showIcon />}
      {unsupportedSpeech && (
        <Alert
          type="warning"
          title={t(
            "this_voice_does_not_support_existing_pronunciation_annotations_clear_them_o"
          )}
          showIcon
        />
      )}
      {linkNotice && <Alert type="warning" title={linkNotice} showIcon />}

      <div className="tsz-ve-badge-row">
        {previewAdapter && previewIsMock && (
          <Tooltip
            title={t(
              "local_tts_mock_is_active_audition_audio_is_not_a_real_synthesis_result"
            )}
          >
            <Tag
              className="tsz-ve-preview-mock-tag"
              color="warning"
              role="note"
              aria-label={t(
                "audition_uses_local_tts_mock_audio_is_not_a_real_synthesis_result"
              )}
            >
              {t("mock")}
            </Tag>
          </Tooltip>
        )}
      </div>

      <MarkupPanel
        mode={mode}
        contentReadOnly={contentReadOnly}
        selectionText={
          textSelection
            ? Array.from(text)
                .slice(textSelection.start, textSelection.end)
                .join("")
            : undefined
        }
        associationContent={associationContent || undefined}
        associationAnchor={linkAnchor}
        selectedLinkRanges={selectedLink?.source_segments ?? linkSegments}
        linkedRanges={(mode === "voice-trial" ? speechLinks : links).flatMap(
          (link) => link.source_segments
        )}
        onWordRange={selectWord}
        text={text}
        marks={marks}
        brush={brush}
        draft={draft}
        readOnly={fullyReadOnly}
        textReadOnly={textReadOnly || contentReadOnly}
        onRoleRange={handleRoleRange}
        onTextSelection={setTextSelection}
        roleAnchorStart={roleAnchor?.start}
        onGapClick={handleGapClick}
        onInspectPause={inspectPause}
        selectedPauseGap={pauseGap}
        actions={renderActions?.(
          !blockingError &&
            !voiceSavePending &&
            !automaticAudioPending &&
            pendingText === undefined &&
            !pendingConflict &&
            conflictCount === 0 &&
            !associationPickerOpen &&
            linkWords.length === 0 &&
            !draft.start &&
            !draft.end &&
            !generatingVersion &&
            !pendingUploads.some((item) => !item.error),
          prepareComplete,
          captureResult
        )}
        onCaretChange={(position) => {
          setCaretPosition(position);
          if (brush.kind === "none") setPauseGap(gapAtCaret(position));
        }}
        onLetterClick={handleLetterClick}
        onLiaisonClick={handleLiaisonClick}
        onClearAll={clearAll}
        inputLabel={
          contextLabel === "语音编辑器" ? t("voice_editor") : contextLabel
        }
        inputDataAttributes={inputDataAttributes}
        inputPlaceholder={
          contentReadOnly
            ? t("text_is_read_only_links_can_be_edited")
            : textReadOnly
              ? t("enter_text_in_the_external_input_first")
              : placeholder
        }
        onTextChange={(nextText, coalesce) =>
          changeText(nextText, false, coalesce)
        }
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
        tools={
          mode === "association" ||
          (mode === "grammar" && renderAssociationPicker)
            ? tools
                .filter(
                  (tool) =>
                    !localPool ||
                    (tool.key !== "voices" && tool.key !== "uploads")
                )
                .flatMap<DropdownTool>((tool) =>
                  tool.key === "roles"
                    ? [
                        ...(mode === "grammar" && !contentReadOnly
                          ? [tool]
                          : []),
                        ...(mode === "grammar"
                          ? (["word"] as const)
                          : (["word", "phrase"] as const)
                        ).map((targetKind): DropdownTool => ({
                          key: `association-${targetKind}`,
                          disabled: linksReadOnly,
                          label:
                            targetKind === "word"
                              ? t("link_word")
                              : t("link_phrase"),
                          icon: <LinkIcon />,
                          active:
                            brush.kind === "association" &&
                            brush.targetKind === targetKind,
                          placement: "topLeft",
                          stayOpen: true,
                          content: (
                            <div className="tsz-ve-pop">
                              <div className="tsz-ve-pop-hint">
                                {!renderAssociationPicker
                                  ? t(
                                      "this_backend_does_not_support_text_links_yet_existing_links_are_retained"
                                    )
                                  : targetKind === "word"
                                    ? t(
                                        "click_an_unlinked_word_then_select_its_target"
                                      )
                                    : linkWords.length > 0
                                      ? t("selected_words", {
                                          p0: linkWords.length,
                                          p1: linkSegments
                                            .map((segment) => segment.surface)
                                            .join(" … ")
                                        })
                                      : t(
                                          "click_at_least_two_unlinked_words_in_order_they_can_be_non_adjacent_click_a"
                                        )}
                              </div>
                              {renderAssociationPicker &&
                                targetKind === "phrase" && (
                                  <Button
                                    size="small"
                                    disabled={
                                      linksReadOnly || linkWords.length < 2
                                    }
                                    onClick={() => {
                                      setOpenTool(undefined);
                                      setAssociationPickerOpen(true);
                                    }}
                                  >
                                    {t("select_linked_phrase")}
                                  </Button>
                                )}
                            </div>
                          )
                        }))
                      ]
                    : [tool]
                )
            : tools.filter(
                (tool) =>
                  !localPool ||
                  (tool.key !== "voices" && tool.key !== "uploads")
              )
        }
        openTool={openTool}
        onOpenToolChange={openToolAndArm}
      />
      {afterText}
      {localPool &&
        (collapseVoiceSettings ? (
          <details className="tsz-ve-voice-settings">
            <summary>{t("voice_settings")}</summary>
            {localPool}
          </details>
        ) : (
          localPool
        ))}
    </section>
  );
}
