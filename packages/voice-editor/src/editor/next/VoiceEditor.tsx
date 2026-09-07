import {
  AudioOutlined,
  DashboardOutlined,
  EditOutlined,
  LinkOutlined,
  PauseOutlined,
  SoundOutlined
} from "@ant-design/icons";
import { Alert, Button, Tag, Tooltip } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RichText, RichTextV2, TextLinkV3 } from "@tsz/types";
import { AUDIO_ASSETS_PER_VARIANT_MAX } from "@tsz/types";
import {
  MAX_PAUSE_MS,
  MIN_PAUSE_MS,
  normalizeRichTextV2,
  toRichTextV2,
  validateRichTextV2
} from "../../core";
import { rangesOverlap, remapTextLinks, wordSegments } from "../../core";
import type { AudioAsset, VoiceOption, VoiceEditorProps } from "../../types";
import {
  describeUploadError,
  isSignedUrlFresh,
  preflightAudioFile,
  progressPercent,
  tooManyAudioError,
  type PendingUpload
} from "./audioAssets";
import { MarkupPanel, type DropdownTool } from "./MarkupPanel";
import {
  LiaisonIcon,
  LiaisonPanel,
  PausePanel,
  RatePanel,
  RolePanel,
  UploadPanel,
  VoicePanel
} from "./ToolPanels";
import type { UploadDraft } from "./ToolPanels";
import {
  DEFAULT_BRUSH,
  GRAMMAR_ROLES,
  PAUSE_PRESETS,
  RATE_MULTIPLIER_MAX,
  RATE_MULTIPLIER_MIN,
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
  offsetToAnchor,
  remapMarks,
  splitRangeAtParagraphs,
  tokenize,
  type LiaisonAnchor,
  type LiaisonDraft,
  type MarkState,
  type RoleUnit
} from "./tokens";
import { useVoiceAudition } from "./useVoiceAudition";

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请重试";
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
function parseValue(value: RichText): { value: RichTextV2; error?: string } {
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
      error: `原有标注读不出来（${errorMessage(error)}），已只保留正文`
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
export function VoiceEditor({
  value,
  mode = "grammar",
  textLinks,
  renderAssociationPicker,
  language = "en",
  contextLabel = "语音编辑器",
  previewAdapter,
  previewIsMock,
  readOnly,
  textReadOnly,
  inputDataAttributes,
  placeholder,
  voiceProfile,
  onVoiceProfileChange,
  audioUploadAdapter,
  audioAssets,
  onAudioAssetsChange,
  audioAssetLimit = AUDIO_ASSETS_PER_VARIANT_MAX,
  onChange
}: VoiceEditorProps) {
  /*
   * 初值直接从 value 灌，而不是先置空再由 effect 补。先置空的话，首帧折算出的是
   * 空内容，实时回调会把这份空值抛给宿主——一挂载就把表单里原有的文本清掉。
   */
  const [initial] = useState(() => parseValue(value));
  const [text, setText] = useState(initial.value.text);
  const [links, setLinks] = useState<TextLinkV3[]>(textLinks ?? []);
  const [linkWords, setLinkWords] = useState<
    Array<{ start: number; end: number }>
  >([]);
  const [linkAnchor, setLinkAnchor] = useState<number>();
  const [inspectedLinkId, setInspectedLinkId] = useState<string>();
  const [associationPickerOpen, setAssociationPickerOpen] = useState(false);
  const [linkNotice, setLinkNotice] = useState("");
  const [marks, setMarks] = useState<MarkState>(() =>
    annotationsToMarks(initial.value)
  );
  const [loadError, setLoadError] = useState(initial.error ?? "");
  const [brush, setBrush] = useState<Brush>(DEFAULT_BRUSH);
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
    setLinkWords([]);
    setLinkAnchor(undefined);
    setInspectedLinkId(undefined);
    setAssociationPickerOpen(false);
    setDraft({});
    setRoleAnchor(undefined);
    setLiaisonEnd("start");
  }, []);
  const tokens = tokenize(text);
  const [validationMessage, setValidationMessage] = useState("");

  /*
   * enabledTouched 区分「没配过」与「配过且恰好选了这些」：
   * 没配过时启用全部音色（清单是异步拉的，所以不能一上来就固化成一个列表）。
   * wire 上 voice_profile 为 null 就对应「没配过」。
   */
  const [enabledVoiceIds, setEnabledVoiceIds] = useState<string[]>(
    voiceProfile?.voice_ids ?? []
  );
  const [enabledTouched, setEnabledTouched] = useState(Boolean(voiceProfile));
  const [upload, setUpload] = useState<UploadDraft>({
    locale: "en-GB",
    gender: "female"
  });
  /** 已落成资产的音频（受控，与 voiceProfile 同款进出）。 */
  const [assets, setAssets] = useState<AudioAsset[]>(audioAssets ?? []);
  const assetsRef = useRef(assets);
  /** 还没落成资产的上传：进行中或失败待重试。 */
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [playingAssetId, setPlayingAssetId] = useState<string>();
  /** 试听失败的说明；只在音频面板里显示，不走阻断性错误那条红色通道。 */
  const [playbackMessage, setPlaybackMessage] = useState<string>();
  const uploadSeqRef = useRef(0);
  const uploadAudioRef = useRef<HTMLAudioElement | null>(null);
  /** 正在取签名 URL 的那次试听；停播 / 卸载时中止，免得 URL 回来后在没人管的地方开播。 */
  const playRequestRef = useRef<AbortController | null>(null);
  const playingAssetIdRef = useRef<string | undefined>(undefined);
  const uploadControllersRef = useRef(new Map<string, AbortController>());
  /** 试听 URL 是短期签名，只放内存；过期重取。 */
  const assetUrlCacheRef = useRef(
    new Map<string, { url: string; expiresAt: string }>()
  );
  const [ratePercent, setRatePercent] = useState<number | undefined>(
    voiceProfile?.rate_percent
  );
  const [customRate, setCustomRate] = useState("");
  const [customPause, setCustomPause] = useState("");
  const [openTool, setOpenTool] = useState<string>();
  /*
   * 音色清单要到「音色」面板第一次打开才拉：内联后同一页可能挂着多个编辑器，
   * 若像抽屉时代那样一挂载就拉，会变成 N 个并发的 listVoices 请求。
   * 拉过就一直留着，收起面板不该把已经拿到的清单丢掉。
   */
  const [voicesRequested, setVoicesRequested] = useState(false);

  /**
   * 撤销/重做栈。快照存「文本 + 全部标注」，因为改文本会连带重挂标注，
   * 只回退其中一半会得到自相矛盾的状态。深度设上限，避免长时间编辑无限增长。
   */
  const [past, setPast] = useState<EditorSnapshot[]>([]);
  const [future, setFuture] = useState<EditorSnapshot[]>([]);

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
    JSON.stringify({ value: initial.value, links: textLinks ?? [] })
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
      return { value: candidate, error: errorMessage(error) };
    }
  }, [marks, text]);

  const workingValue = working.value;
  const serialized = JSON.stringify({ value: workingValue, links });

  // 外部值变了才重新灌入；自己刚抛出去、又被父组件回灌的那一份直接跳过。
  useEffect(() => {
    const parsed = parseValue(value);
    const incoming = JSON.stringify({
      value: parsed.value,
      links: textLinks ?? []
    });
    if (incoming === incomingRef.current) return;
    incomingRef.current = incoming;
    // 换了新值：基准重设，让下面那个 effect 重新记一次而不是当成改动抛出去。
    emittedRef.current = undefined;
    setText(parsed.value.text);
    setLinks(textLinks ?? []);
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
  }, [value, textLinks]);

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
    if (readOnly || working.error) return;
    if (serialized === emittedRef.current) return;
    emittedRef.current = serialized;
    // 自己抛出去的这份，等父组件回灌时不能再被当成外部改动。
    incomingRef.current = serialized;
    if (mode === "association") onChange(workingValue, links);
    else onChange(workingValue);
  }, [
    onChange,
    readOnly,
    serialized,
    working.error,
    workingValue,
    links,
    mode
  ]);

  /* 自己刚抛出去、又被父组件回灌的那份要跳过，否则每次改动都会重置一遍。 */
  const emittedProfileRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const incoming = JSON.stringify(voiceProfile ?? null);
    if (incoming === emittedProfileRef.current) return;
    emittedProfileRef.current = incoming;
    setEnabledVoiceIds(voiceProfile?.voice_ids ?? []);
    setEnabledTouched(Boolean(voiceProfile));
    setRatePercent(voiceProfile?.rate_percent);
  }, [voiceProfile]);

  /**
   * 把当前的音色与语速抛给宿主。
   *
   * 只在用户真的动过之后才抛：没动过时 voice_ids 该是「全部」，而「全部」在 wire 上
   * 没有表示法——此时固化成当天的音色列表是错的（以后新增的音色就落不进来）。
   * 一旦动过，选择就固化成显式列表，这正是「持久化」的含义。
   */
  const emitProfile = (next: { voiceIds: string[]; rate?: number }) => {
    if (readOnly || !onVoiceProfileChange) return;
    const profile = {
      voice_ids: next.voiceIds,
      rate_percent: next.rate ?? 0
    };
    emittedProfileRef.current = JSON.stringify(profile);
    onVoiceProfileChange(profile);
  };

  const auditionSettings = useMemo(() => ({ ratePercent }), [ratePercent]);
  const {
    voices,
    voicesLoading,
    status: auditionStatus,
    pendingVoiceId,
    playingVoiceId,
    audition,
    stop: stopAudition
  } = useVoiceAudition({
    open: voicesRequested,
    language,
    content: workingValue,
    settings: auditionSettings,
    previewAdapter
  });

  const effectiveEnabledIds = useMemo(
    () => (enabledTouched ? enabledVoiceIds : voices.map((voice) => voice.id)),
    [enabledTouched, enabledVoiceIds, voices]
  );

  const changeBrush = (next: Brush) => {
    if (next.kind === "role") lastRoleRef.current = next.level;
    if (next.kind === "pause") lastPauseRef.current = next.durationMs;
    setBrush(next);
    resetTransient();
  };

  /* 语法结构与停顿选完就收起浮层，好腾出标注带落笔；连读的面板要留着用。 */
  const pickBrush = (next: Brush) => {
    changeBrush(next);
    setOpenTool(undefined);
  };

  /* 点开一支笔的面板即换上这支笔，省掉「先选笔再点开」的一次往返。 */
  /*
   * 点开一支笔的面板即拿起这支笔；放下笔走「文本」这枚显式的工具。
   *
   * 不用「再点一次同一枚按钮收笔」：选完分类面板会自动收起，此时再点那枚按钮
   * 既可能是想收笔、也可能是想重新打开面板换个分类，同一个手势两个意思。
   */
  const openToolAndArm = (key?: string) => {
    if (key === "association-word" || key === "association-phrase") {
      const targetKind = key === "association-word" ? "word" : "phrase";
      setOpenTool(key);
      setAssociationPickerOpen(false);
      setInspectedLinkId(undefined);
      if (brush.kind !== "association" || brush.targetKind !== targetKind)
        changeBrush({ kind: "association", targetKind });
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
    setOpenTool(key);
    if (key === "voices") setVoicesRequested(true);
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
  const commit = (
    next: (current: EditorSnapshot) => EditorSnapshot,
    options?: { typing?: boolean }
  ) => {
    const before: EditorSnapshot = { text, marks, textLinks: links };
    const after = next(before);
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
    setValidationMessage("");
  };

  const undo = () => {
    const previous = past[past.length - 1];
    if (!previous) return;
    typingRunRef.current = 0;
    setPast((stack) => stack.slice(0, -1));
    setFuture((stack) =>
      [{ text, marks, textLinks: links }, ...stack].slice(0, MAX_HISTORY)
    );
    setText(previous.text);
    setMarks(previous.marks);
    setLinks(previous.textLinks ?? []);
    setLinkNotice("");
    resetTransient();
    setValidationMessage("");
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture((stack) => stack.slice(1));
    setPast((stack) =>
      [...stack, { text, marks, textLinks: links }].slice(-MAX_HISTORY)
    );
    setText(next.text);
    setMarks(next.marks);
    setLinks(next.textLinks ?? []);
    setLinkNotice("");
    resetTransient();
    setValidationMessage("");
  };

  const changeText = (nextText: string) => {
    if (readOnly || textReadOnly) return;
    setLinkNotice(
      remapTextLinks(text, nextText, links).length < links.length
        ? "被修改词段的关联已移除，请重新选择；可撤销恢复。"
        : ""
    );
    // 改文本时按词重挂标注：词没动的保留，被改写的连同它的标注一起消失。
    commit(
      (current) => ({
        text: nextText,
        textLinks: remapTextLinks(
          current.text,
          nextText,
          current.textLinks ?? []
        ),
        marks: remapMarks(current.text, nextText, current.marks)
      }),
      { typing: true }
    );
    resetTransient();
  };

  const linkSegments = wordSegments(text, linkWords);
  const selectedLink = links.find((link) => link.id === inspectedLinkId);
  const selectWord = (range: { start: number; end: number }) => {
    if (readOnly || !renderAssociationPicker || brush.kind !== "association")
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
        setLinkNotice("请选择同一段落内的词语。");
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
    !readOnly &&
    associationPickerOpen &&
    (selectedLink || linkSegments.length > 0) &&
    renderAssociationPicker?.({
      kind: brush.targetKind,
      segments: selectedLink?.source_segments ?? linkSegments,
      selected: selectedLink,
      onSelect: (next) => {
        if (readOnly) return;
        if (selectedLink) {
          if (next) return;
          commit((current) => ({
            ...current,
            textLinks: (current.textLinks ?? []).filter(
              (link) => link.id !== selectedLink.id
            )
          }));
          resetTransient();
          return;
        }
        if (!next) return;
        if (
          links.some((link) =>
            rangesOverlap(link.source_segments, linkSegments)
          )
        ) {
          setLinkNotice("所选单词已有关联，请先清除原关联。");
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
      setValidationMessage(issues[0]!.message);
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
    const token = offsetToAnchor(tokens, start)?.token;
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

  const handleGapClick = (gapIndex: number) => {
    if (brush.kind !== "pause") return;
    commit((current) => {
      const pauses = { ...current.marks.pauses };
      /*
       * 与语法结构同一套语义：点空的落笔、点同值的取消、点不同值的替换。
       * 早先只按「有 / 无」切换，拿 1s 的笔点一条 500ms 的缝会变成删除，
       * 得点两下才能改时长。
       */
      if (pauses[gapIndex] === brush.durationMs) delete pauses[gapIndex];
      else pauses[gapIndex] = brush.durationMs;
      return { ...current, marks: { ...current.marks, pauses } };
    });
  };

  /**
   * 端别由面板上的「起点 / 终点」开关决定，不按点击先后推断。
   * 早先「第一个词是起点、点到另一个词就是终点」的自动判定，让人没法先定终点
   * 再回头选起点，也没法选完终点后回去改起点。同一端内点相邻字母则扩展锚点，
   * 点到别的词则换成那个词。成线仍由「添加连读」显式确认。
   */
  const handleLetterClick = (anchor: LiaisonAnchor) => {
    if (brush.kind !== "liaison") return;
    const offset = anchor.offsets[0]!;
    setDraft((current) => {
      const existing = current[liaisonEnd];
      const next =
        existing && existing.token === anchor.token
          ? extendAnchor(existing, offset)
          : anchor;
      return { ...current, [liaisonEnd]: next };
    });
  };

  const commitLiaison = () => {
    if (!draft.start || !draft.end) return;
    const link =
      draft.start.token < draft.end.token
        ? { start: draft.start, end: draft.end }
        : { start: draft.end, end: draft.start };
    if (!isValidLiaison(link)) {
      // 界面上「添加连读」在两端同词时就已禁用，这里是兜底；一旦真的触发，
      // 走顶部 Alert 而不是静默返回，免得出问题时什么反馈都没有。
      setValidationMessage("连读要连接两个不同的词");
      return;
    }
    const sameAnchors = (a: LiaisonAnchor, b: LiaisonAnchor) =>
      a.token === b.token &&
      a.offsets.length === b.offsets.length &&
      a.offsets.every((offset, index) => offset === b.offsets[index]);
    if (
      marks.liaisons.some(
        (existing) =>
          sameAnchors(existing.start, link.start) &&
          sameAnchors(existing.end, link.end)
      )
    ) {
      // 重复添加会画出两道重合的弧，落盘时被 normalize 合并成一条，数据与屏幕分叉。
      setValidationMessage("这两处已经连过了");
      resetTransient();
      return;
    }
    if (crossesParagraph(text, tokens, link)) {
      // wire 不接受跨换行的标注；放进来的话本地就折算不出合法 wire，
      // 从此改动静默停止回写，比当场说清楚糟得多。
      setValidationMessage("连读不能跨越换行，请把两个词放在同一行");
      return;
    }
    commit((current) => ({
      ...current,
      marks: { ...current.marks, liaisons: [...current.marks.liaisons, link] }
    }));
    resetTransient();
  };

  const resetDraft = resetTransient;

  const handleLiaisonClick = (index: number) => {
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
    // 透传注解不是用户在这里标的，清空标注不该把它们一并抹掉。
    commit((current) => ({
      ...current,
      marks: { ...current.marks, roles: [], liaisons: [], pauses: {} }
    }));
    resetDraft();
  };

  const toggleVoice = (voiceId: string) => {
    const current = effectiveEnabledIds;
    const next = current.includes(voiceId)
      ? current.filter((id) => id !== voiceId)
      : [...current, voiceId];
    setEnabledTouched(true);
    setEnabledVoiceIds(next);
    emitProfile({ voiceIds: next, rate: ratePercent });
  };

  const isRateAllowed = useCallback(
    (percent: number) => {
      const candidates = voices.filter(
        (voice) =>
          effectiveEnabledIds.includes(voice.id) && voice.supportsRate !== false
      );
      if (candidates.length === 0) return true;
      return candidates.some(
        (voice) =>
          !voice.rateRange ||
          (voice.rateRange.min <= percent && percent <= voice.rateRange.max)
      );
    },
    [effectiveEnabledIds, voices]
  );

  const applyRate = (percent: number) => {
    setRatePercent(percent);
    setCustomRate("");
    setValidationMessage("");
    emitProfile({ voiceIds: effectiveEnabledIds, rate: percent });
  };

  const applyCustomRate = (raw: string) => {
    const multiplier = Number(raw.trim());
    if (
      !raw.trim() ||
      !Number.isFinite(multiplier) ||
      multiplier < RATE_MULTIPLIER_MIN ||
      multiplier > RATE_MULTIPLIER_MAX
    ) {
      setValidationMessage(
        `语速倍数必须在 ${RATE_MULTIPLIER_MIN.toFixed(2)}× – ${RATE_MULTIPLIER_MAX.toFixed(2)}× 之间`
      );
      return;
    }
    const percent = Math.round((multiplier - 1) * 100);
    setRatePercent(percent);
    setValidationMessage("");
    emitProfile({ voiceIds: effectiveEnabledIds, rate: percent });
  };

  /** 自定义停顿按毫秒输入，与底层模型同单位，避免多一层换算。 */
  const applyCustomPause = (raw: string) => {
    const durationMs = Number(raw.trim());
    if (
      !raw.trim() ||
      !Number.isInteger(durationMs) ||
      durationMs < MIN_PAUSE_MS ||
      durationMs > MAX_PAUSE_MS
    ) {
      setValidationMessage(
        `停顿时长必须是 ${MIN_PAUSE_MS}–${MAX_PAUSE_MS} 之间的整数毫秒`
      );
      return;
    }
    changeBrush({ kind: "pause", durationMs });
    setValidationMessage("");
  };

  /*
   * 折算不出合法 wire 时不上抛（不能把坏值写进表单），但必须说清楚「现在改的东西
   * 没有被保存」——只报一条规则的话，用户会以为改动已经生效。
   */
  const blockingError =
    validationMessage ||
    (working.error && `${working.error}；在改回来之前，这里的编辑不会被保存`) ||
    loadError;

  // TTS 试听与资产试听同一时间只响一路
  const handleAudition = (voice: VoiceOption) => {
    stopAssetPlayback();
    audition(voice);
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
    if (!audioUploadAdapter) return;
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
          uploadControllersRef.current.delete(entry.id);
          if (controller.signal.aborted) return;
          dropPending(entry.id);
          emitAssets([...assetsRef.current, asset]);
        },
        (error: unknown) => {
          uploadControllersRef.current.delete(entry.id);
          if (controller.signal.aborted) return;
          patchPending(entry.id, { error: describeUploadError(error) });
        }
      );
  };

  const addAudioFiles = (files: FileList) => {
    if (!audioUploadAdapter || readOnly) return;
    // 名额 = 上限 − 已落成 − 还在路上的；预检不过的那些不占名额。
    const inFlight = pendingUploads.filter((item) => !item.error).length;
    let room = audioAssetLimit - assetsRef.current.length - inFlight;
    const entries: PendingUpload[] = [...files].map((file) => {
      // id 不用 crypto.randomUUID：测试服是裸 HTTP 的非安全上下文，该 API 缺失。
      uploadSeqRef.current += 1;
      let error = preflightAudioFile(file);
      if (!error) {
        if (room <= 0) error = tooManyAudioError(audioAssetLimit);
        else room -= 1;
      }
      return {
        id: `upload-${uploadSeqRef.current}`,
        file,
        name: file.name,
        locale: upload.locale,
        gender: upload.gender,
        progress: 0,
        error: error ? describeUploadError(error) : undefined
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

  const PLAYBACK_FAILED = "音频暂时无法试听，请稍后重试";

  const playAsset = async (asset: AudioAsset) => {
    if (playingAssetId === asset.id) {
      stopAssetPlayback();
      return;
    }
    stopAssetPlayback();
    stopAudition();
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
    audio.addEventListener(
      "ended",
      () => {
        if (uploadAudioRef.current === audio) stopAssetPlayback();
      },
      { once: true }
    );
    void audio.play().catch(() => {
      if (uploadAudioRef.current !== audio) return;
      stopAssetPlayback();
      setPlaybackMessage(PLAYBACK_FAILED);
    });
  };

  /* 自定义语速也要显示得出来，所以由百分比反算倍数，而不是回查预设表。 */
  const rateSummary = `${(1 + (ratePercent ?? 0) / 100).toFixed(2)}×`;

  const roleLevel = brush.kind === "role" ? brush.level : lastRoleRef.current;
  const roleLabel =
    GRAMMAR_ROLES.find((role) => role.level === roleLevel)?.label ??
    GRAMMAR_ROLES[0]!.label;
  const pauseDuration =
    brush.kind === "pause" ? brush.durationMs : lastPauseRef.current;

  /* 存储未开通由适配器记一次（同一页可能挂着几十个编辑器），这里每次渲染直接问。 */
  const storageUnavailable =
    audioUploadAdapter?.isStorageUnavailable?.() ?? false;

  const tools = [
    {
      key: "text",
      label: "文本",
      ariaLabel: "编辑文本",
      icon: <EditOutlined />,
      active: brush.kind === "none",
      className: "tsz-ve-text-button"
    },
    {
      key: "roles",
      dividerBefore: true,
      label: "语法结构",
      ariaLabel: `语法结构 ${roleLabel}`,
      className: `tsz-ve-role-button is-${roleLevel}`,
      active: brush.kind === "role",
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
          brush={brush}
          onBrushChange={pickBrush}
        />
      )
    },
    {
      key: "liaison",
      label: "连读",
      icon: <LiaisonIcon />,
      className: "tsz-ve-liaison-button",
      active: brush.kind === "liaison",
      dividerBefore: true,
      // 面板开在上方且不随外部点击关闭：选锚点要在下面的文字上点字母。
      placement: "topLeft" as const,
      stayOpen: true,
      content: (
        <LiaisonPanel
          readOnly={readOnly}
          tokens={tokens}
          draft={draft}
          activeEnd={liaisonEnd}
          onActiveEndChange={setLiaisonEnd}
          onCommit={commitLiaison}
          onResetDraft={resetDraft}
        />
      )
    },
    {
      key: "pause",
      label: "停顿",
      icon: <PauseOutlined />,
      summary: formatPauseLabel(pauseDuration),
      className: "tsz-ve-pause-button",
      active: brush.kind === "pause",
      dividerBefore: true,
      content: (
        <PausePanel
          readOnly={readOnly}
          hasWords={tokens.length > 0}
          brush={brush}
          onBrushChange={pickBrush}
          customPause={customPause}
          onCustomPauseChange={setCustomPause}
          onCustomPauseSubmit={(raw) => {
            applyCustomPause(raw);
            setOpenTool(undefined);
          }}
        />
      )
    },
    {
      key: "voices",
      dividerBefore: true,
      label: "音色",
      // 清单要到面板首次打开才拉，没拉之前不报数——显示「0」会被读成「一个都没启用」。
      // 已配过就直接报数；没配过时要等清单拉回来才知道「全部」是几个。
      summary:
        enabledTouched || voices.length > 0
          ? String(effectiveEnabledIds.length)
          : undefined,
      icon: <SoundOutlined />,
      content: (
        <VoicePanel
          readOnly={readOnly}
          voices={voices}
          voicesLoading={voicesLoading}
          enabledVoiceIds={effectiveEnabledIds}
          onToggleVoice={toggleVoice}
          pendingVoiceId={pendingVoiceId}
          playingVoiceId={playingVoiceId}
          canAudition={Boolean(previewAdapter) && text.trim().length > 0}
          onAudition={handleAudition}
          auditionStatus={
            previewAdapter ? auditionStatus : "TTS 后端未启用，仍可编辑"
          }
        />
      )
    },
    {
      key: "rate",
      label: "语速",
      summary: rateSummary,
      icon: <DashboardOutlined />,
      content: (
        <RatePanel
          readOnly={readOnly}
          ratePercent={ratePercent}
          isRateAllowed={isRateAllowed}
          onRate={applyRate}
          customRate={customRate}
          onCustomRateChange={setCustomRate}
          onCustomRateSubmit={applyCustomRate}
        />
      )
    },
    {
      key: "uploads",
      label: "音频",
      summary: assets.length > 0 ? String(assets.length) : undefined,
      icon: <AudioOutlined />,
      content: (
        <UploadPanel
          readOnly={readOnly}
          available={Boolean(audioUploadAdapter) && !storageUnavailable}
          unavailableReason={
            audioUploadAdapter
              ? "音频存储尚未开通，暂时不能上传"
              : "音频上传未启用"
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
      )
    }
  ].filter((tool) => !textReadOnly || tool.key !== "text");

  // 外壳不另起可及名：名字归那个真正可编辑的文本框，避免同名两份。
  return (
    <section
      className="tsz-ve-editor"
      data-readonly={readOnly || undefined}
      /*
       * Esc 收笔挂在编辑器根节点而不是画布上：拿着笔时鼠标点不了光标，得有个
       * 不用瞄按钮的退路，而这时焦点常常还落在工具栏按钮上——挂在画布上收不到。
       * 浮层渲染在 portal（不在本节点内），所以「Esc 关浮层」不受影响，仍归 antd。
       */
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        if (brush.kind === "none") return;
        event.stopPropagation();
        openToolAndArm("text");
      }}
    >
      {blockingError && <Alert type="error" title={blockingError} showIcon />}
      {linkNotice && <Alert type="warning" title={linkNotice} showIcon />}

      <div className="tsz-ve-badge-row">
        {previewAdapter && previewIsMock && (
          <Tooltip title="当前走本地 TTS mock，试听音频不是真实合成结果">
            <Tag
              className="tsz-ve-preview-mock-tag"
              color="warning"
              role="note"
              aria-label="试听走本地 TTS mock，音频不是真实合成结果"
            >
              模拟
            </Tag>
          </Tooltip>
        )}
      </div>

      <MarkupPanel
        associationContent={associationContent || undefined}
        associationAnchor={linkAnchor}
        selectedLinkRanges={selectedLink?.source_segments ?? linkSegments}
        linkedRanges={links.flatMap((link) => link.source_segments)}
        onWordRange={selectWord}
        text={text}
        marks={marks}
        brush={brush}
        draft={draft}
        readOnly={readOnly}
        textReadOnly={textReadOnly}
        onRoleRange={handleRoleRange}
        roleAnchorStart={roleAnchor?.start}
        onGapClick={handleGapClick}
        onLetterClick={handleLetterClick}
        onLiaisonClick={handleLiaisonClick}
        onClearAll={clearAll}
        inputLabel={contextLabel}
        inputDataAttributes={inputDataAttributes}
        inputPlaceholder={
          textReadOnly ? "请先在外面的输入框填写文字" : placeholder
        }
        onTextChange={changeText}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
        tools={
          mode === "association"
            ? tools.flatMap<DropdownTool>((tool) =>
                tool.key === "roles"
                  ? (["word", "phrase"] as const).map((targetKind) => ({
                      key: `association-${targetKind}`,
                      label: targetKind === "word" ? "关联单词" : "关联短语",
                      icon: <LinkOutlined />,
                      active:
                        brush.kind === "association" &&
                        brush.targetKind === targetKind,
                      dividerBefore: targetKind === "word",
                      placement: "topLeft",
                      stayOpen: true,
                      content: (
                        <div className="tsz-ve-pop">
                          <div className="tsz-ve-pop-hint">
                            {!renderAssociationPicker
                              ? "当前后端尚不支持正文关联，已有关联保留。"
                              : targetKind === "word"
                                ? "点击一个未关联的单词，再选择单词、词形和词义。"
                                : linkWords.length > 0
                                  ? `已选 ${linkWords.length} 个单词：${linkSegments.map((segment) => segment.surface).join(" … ")}`
                                  : "依次点击至少两个未关联的单词，可不连续；再次点击取消选择。"}
                          </div>
                          {renderAssociationPicker &&
                            targetKind === "phrase" && (
                              <Button
                                size="small"
                                disabled={readOnly || linkWords.length < 2}
                                onClick={() => {
                                  setOpenTool(undefined);
                                  setAssociationPickerOpen(true);
                                }}
                              >
                                选择关联短语
                              </Button>
                            )}
                        </div>
                      )
                    }))
                  : [tool]
              )
            : tools
        }
        openTool={openTool}
        onOpenToolChange={openToolAndArm}
      />
    </section>
  );
}
