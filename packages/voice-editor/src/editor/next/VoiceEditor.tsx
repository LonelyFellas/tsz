import {
  AudioOutlined,
  DashboardOutlined,
  EditOutlined,
  PauseOutlined,
  SoundOutlined
} from "@ant-design/icons";
import { Alert, Tag, Tooltip } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RichText, RichTextV2 } from "@tsz/types";
import {
  MAX_PAUSE_MS,
  MIN_PAUSE_MS,
  normalizeRichTextV2,
  toRichTextV2
} from "../../core";
import type { VoiceOption, VoiceEditorProps } from "../../types";
import { MarkupPanel } from "./MarkupPanel";
import {
  LiaisonIcon,
  LiaisonPanel,
  PausePanel,
  RatePanel,
  RolePanel,
  UploadPanel,
  VoicePanel
} from "./ToolPanels";
import type { UploadDraft, UploadedAudio } from "./ToolPanels";
import {
  DEFAULT_BRUSH,
  GRAMMAR_ROLES,
  PAUSE_PRESETS,
  RATE_MULTIPLIER_MAX,
  RATE_MULTIPLIER_MIN,
  formatPauseLabel,
  type Brush
} from "./roles";
import {
  type EditorSnapshot,
  annotationsToMarks,
  extendAnchor,
  isValidLiaison,
  marksToAnnotations,
  crossesParagraph,
  remapMarks,
  tokenize,
  type LiaisonAnchor,
  type LiaisonDraft,
  type MarkState
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
  language = "en",
  contextLabel = "语音编辑器",
  previewAdapter,
  previewIsMock,
  readOnly,
  inputDataAttributes,
  placeholder,
  voiceProfile,
  onVoiceProfileChange,
  onChange
}: VoiceEditorProps) {
  /*
   * 初值直接从 value 灌，而不是先置空再由 effect 补。先置空的话，首帧折算出的是
   * 空内容，实时回调会把这份空值抛给宿主——一挂载就把表单里原有的文本清掉。
   */
  const [initial] = useState(() => parseValue(value));
  const [text, setText] = useState(initial.value.text);
  const [marks, setMarks] = useState<MarkState>(() =>
    annotationsToMarks(initial.value)
  );
  const [loadError, setLoadError] = useState(initial.error ?? "");
  const [brush, setBrush] = useState<Brush>(DEFAULT_BRUSH);
  /** 正在拼的这条连读：起点/终点两个锚点，各自可含多个连续字母。 */
  const [draft, setDraft] = useState<LiaisonDraft>({});
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
  const [uploads, setUploads] = useState<UploadedAudio[]>([]);
  const [playingUploadId, setPlayingUploadId] = useState<string>();
  const uploadSeqRef = useRef(0);
  const uploadAudioRef = useRef<HTMLAudioElement | null>(null);
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
  const incomingRef = useRef(JSON.stringify(initial.value));
  const emittedRef = useRef<string | undefined>(undefined);
  /** 记住最近用过的语法结构分类：画笔切到连读/停顿再切回来时不必重挑。 */
  const lastRoleRef = useRef("core");
  const lastPauseRef = useRef(PAUSE_PRESETS[0]!);
  /** 上一次「键入正文」的时刻；0 表示当前没有正在进行的打字连击。 */
  const typingRunRef = useRef(0);

  const stopUploadPlayback = useCallback(() => {
    uploadAudioRef.current?.pause();
    uploadAudioRef.current = null;
    setPlayingUploadId(undefined);
  }, []);

  /** object URL 必须显式回收，否则每传一次都留一份内存直到整页卸载。 */
  const releaseUploads = useCallback((items: UploadedAudio[]) => {
    for (const item of items) URL.revokeObjectURL(item.url);
  }, []);

  // 卸载时回收全部 object URL；同样不能把副作用塞进 setState 的更新函数。
  const uploadsRef = useRef<UploadedAudio[]>([]);
  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);
  useEffect(
    () => () => {
      stopUploadPlayback();
      releaseUploads(uploadsRef.current);
    },
    [releaseUploads, stopUploadPlayback]
  );

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
  const serialized = JSON.stringify(workingValue);

  // 外部值变了才重新灌入；自己刚抛出去、又被父组件回灌的那一份直接跳过。
  useEffect(() => {
    const parsed = parseValue(value);
    const incoming = JSON.stringify(parsed.value);
    if (incoming === incomingRef.current) return;
    incomingRef.current = incoming;
    // 换了新值：基准重设，让下面那个 effect 重新记一次而不是当成改动抛出去。
    emittedRef.current = undefined;
    setText(parsed.value.text);
    setMarks(annotationsToMarks(parsed.value));
    setLoadError(parsed.error ?? "");
    typingRunRef.current = 0;
    setBrush(DEFAULT_BRUSH);
    setCustomPause("");
    setOpenTool(undefined);
    setDraft({});
    setValidationMessage("");
    setPast([]);
    setFuture([]);
  }, [value]);

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
    onChange(workingValue);
  }, [onChange, readOnly, serialized, working.error, workingValue]);

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
    audition
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
    setDraft({});
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
    if (key === undefined && brush.kind === "liaison") {
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
    const before: EditorSnapshot = { text, marks };
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
    setValidationMessage("");
  };

  const undo = () => {
    const previous = past[past.length - 1];
    if (!previous) return;
    typingRunRef.current = 0;
    setPast((stack) => stack.slice(0, -1));
    setFuture((stack) => [{ text, marks }, ...stack].slice(0, MAX_HISTORY));
    setText(previous.text);
    setMarks(previous.marks);
    setDraft({});
    setValidationMessage("");
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture((stack) => stack.slice(1));
    setPast((stack) => [...stack, { text, marks }].slice(-MAX_HISTORY));
    setText(next.text);
    setMarks(next.marks);
    setDraft({});
    setValidationMessage("");
  };

  const changeText = (nextText: string) => {
    // 改文本时按词重挂标注：词没动的保留，被改写的连同它的标注一起消失。
    commit(
      (current) => ({
        text: nextText,
        marks: remapMarks(current.text, nextText, current.marks)
      }),
      { typing: true }
    );
    setDraft({});
  };

  const handleWordClick = (tokenIndex: number) => {
    if (brush.kind !== "role") return;
    commit((current) => {
      const roles = { ...current.marks.roles };
      if (roles[tokenIndex] === brush.level) delete roles[tokenIndex];
      else roles[tokenIndex] = brush.level;
      return { ...current, marks: { ...current.marks, roles } };
    });
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
   * 连读端别自动判定：第一个点中的词是起点，点到另一个词就成为终点；
   * 在已选中的那个词里继续点相邻字母，则扩展该端的锚点。
   * 少一次「我现在在选哪一端」的切换，点起点→点终点一气呵成。
   * 因为两端都要允许继续扩展，成线仍由「添加连读」显式确认。
   */
  const handleLetterClick = (anchor: LiaisonAnchor) => {
    if (brush.kind !== "liaison") return;
    const offset = anchor.offsets[0]!;
    setDraft((current) => {
      if (!current.start) return { start: anchor };
      if (anchor.token === current.start.token) {
        return { ...current, start: extendAnchor(current.start, offset) };
      }
      if (current.end && anchor.token === current.end.token) {
        return { ...current, end: extendAnchor(current.end, offset) };
      }
      return { ...current, end: anchor };
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
      setDraft({});
      return;
    }
    if (crossesParagraph(text, tokenize(text), link)) {
      // wire 不接受跨换行的标注；放进来的话本地就折算不出合法 wire，
      // 从此改动静默停止回写，比当场说清楚糟得多。
      setValidationMessage("连读不能跨越换行，请把两个词放在同一行");
      return;
    }
    commit((current) => ({
      ...current,
      marks: { ...current.marks, liaisons: [...current.marks.liaisons, link] }
    }));
    setDraft({});
  };

  const resetDraft = () => {
    setDraft({});
  };

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
      marks: { ...current.marks, roles: {}, liaisons: [], pauses: {} }
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

  const handleAudition = (voice: VoiceOption) => audition(voice);

  const addUploads = (files: FileList) => {
    // id 不用 crypto.randomUUID：测试服是裸 HTTP 的非安全上下文，该 API 缺失。
    const added = [...files].map((file) => {
      uploadSeqRef.current += 1;
      return {
        id: `upload-${uploadSeqRef.current}`,
        name: file.name,
        locale: upload.locale,
        gender: upload.gender,
        url: URL.createObjectURL(file)
      };
    });
    setUploads((current) => [...current, ...added]);
  };

  const removeUpload = (id: string) => {
    // 回收放在更新函数之外：更新函数必须是纯的，StrictMode 会调用两次。
    // 正在放的那条被移除时先停：只清播放态的话音频还在响，而列表项已经没了，
    // 用户再没有任何停止入口。revoke 一个正在播的 URL 也是错的。
    if (playingUploadId === id) stopUploadPlayback();
    const target = uploads.find((item) => item.id === id);
    if (target) URL.revokeObjectURL(target.url);
    setUploads((current) => current.filter((item) => item.id !== id));
  };

  const playUpload = (item: UploadedAudio) => {
    if (playingUploadId === item.id) {
      stopUploadPlayback();
      return;
    }
    stopUploadPlayback();
    const audio = new Audio(item.url);
    uploadAudioRef.current = audio;
    audio.addEventListener(
      "ended",
      () => {
        if (uploadAudioRef.current === audio) setPlayingUploadId(undefined);
      },
      { once: true }
    );
    void audio.play().then(
      () => {
        if (uploadAudioRef.current === audio) setPlayingUploadId(item.id);
      },
      () => {
        if (uploadAudioRef.current === audio) setPlayingUploadId(undefined);
      }
    );
  };

  /* 自定义语速也要显示得出来，所以由百分比反算倍数，而不是回查预设表。 */
  const rateSummary = `${(1 + (ratePercent ?? 0) / 100).toFixed(2)}×`;

  const roleLevel = brush.kind === "role" ? brush.level : lastRoleRef.current;
  const roleLabel =
    GRAMMAR_ROLES.find((role) => role.level === roleLevel)?.label ??
    GRAMMAR_ROLES[0]!.label;
  const pauseDuration =
    brush.kind === "pause" ? brush.durationMs : lastPauseRef.current;
  const tokens = tokenize(text);

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
      summary: uploads.length > 0 ? String(uploads.length) : undefined,
      icon: <AudioOutlined />,
      content: (
        <UploadPanel
          readOnly={readOnly}
          upload={upload}
          onUploadChange={(next: Partial<UploadDraft>) =>
            setUpload((current) => ({ ...current, ...next }))
          }
          uploads={uploads}
          onAddUploads={addUploads}
          onRemoveUpload={removeUpload}
          onPlayUpload={playUpload}
          playingUploadId={playingUploadId}
        />
      )
    }
  ];

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
        text={text}
        marks={marks}
        brush={brush}
        draft={draft}
        readOnly={readOnly}
        onWordClick={handleWordClick}
        onGapClick={handleGapClick}
        onLetterClick={handleLetterClick}
        onLiaisonClick={handleLiaisonClick}
        onClearAll={clearAll}
        inputLabel={contextLabel}
        inputDataAttributes={inputDataAttributes}
        inputPlaceholder={placeholder}
        onTextChange={changeText}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
        tools={tools}
        openTool={openTool}
        onOpenToolChange={openToolAndArm}
      />
    </section>
  );
}
