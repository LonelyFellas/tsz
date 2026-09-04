import type { VoiceOption } from "../../types";

/**
 * 语法结构三分类。一段文字只能属于其中一类：点非当前类=替换，点当前类=取消。
 *
 * TODO(契约): wire 的 emphasis.level 仍锁死 "strong"（见 openapi
 * RichTextEmphasisLevel），三分类目前只存在于编辑态，保存时统一按既有 emphasis
 * 落盘。待后端放开该枚举后，再把 level 接到 mapping 两端。
 */
export const GRAMMAR_ROLES: ReadonlyArray<{ level: string; label: string }> = [
  { level: "function", label: "功能词" },
  { level: "core", label: "核心词" },
  { level: "grammar", label: "语法词" }
];

/** 历史数据里的 emphasis 等级，视作「核心词」。 */
export const LEGACY_GRAMMAR_LEVEL = "strong";

/**
 * 当前画笔。选中一支笔后直接点靶子落笔，免去「先拖选、再去远处点按钮」的往返。
 *
 * 三种笔各有各的靶子，互不干扰：
 * - role   → 点词，标语法结构分类
 * - liaison→ 点字母，连出一条连读弧（两端可跨任意距离）
 * - pause  → 点词缝，插入停顿
 */
export type Brush =
  | { kind: "none" }
  | { kind: "role"; level: string }
  | { kind: "liaison" }
  | { kind: "pause"; durationMs: number };

/** 连读的哪一端；两端各自可含多个连续字母。 */
export type LiaisonEnd = "start" | "end";

/**
 * 默认不落笔。文字和标注共用同一块画布：没拿起笔时鼠标归文本（放光标、选中），
 * 拿起笔后鼠标才归标注。少了这个「空手」状态，光标就永远放不下去。
 */
export const DEFAULT_BRUSH: Brush = { kind: "none" };

/** 当前画笔作用在哪种靶子上；none 表示这一刻鼠标归文本编辑。 */
export function brushTarget(brush: Brush): "word" | "letter" | "gap" | "none" {
  if (brush.kind === "role") return "word";
  if (brush.kind === "liaison") return "letter";
  if (brush.kind === "pause") return "gap";
  return "none";
}

/** 把任意来源的 level 归一到三分类之一，历史 "strong" 落到核心词。 */
export function normalizeGrammarLevel(raw: unknown): string | undefined {
  const level = String(raw ?? "");
  if (!level) return undefined;
  return level === LEGACY_GRAMMAR_LEVEL ? "core" : level;
}

/** 连读两端的显示名；端别由点击位置自动判定，这里只用于回显。 */
export const LIAISON_ANCHORS: ReadonlyArray<{
  anchor: LiaisonEnd;
  label: string;
}> = [
  { anchor: "start", label: "起点" },
  { anchor: "end", label: "终点" }
];

/** 语速按倍数呈现，底层仍是 SSML 的相对百分比：1.25× ↔ rate="+25%"。 */
export const RATE_PRESETS: ReadonlyArray<{
  multiplier: number;
  percent: number;
}> = [
  { multiplier: 1.25, percent: 25 },
  { multiplier: 1, percent: 0 },
  { multiplier: 0.75, percent: -25 },
  { multiplier: 0.5, percent: -50 }
];

/** 自定义语速允许的倍数区间；超出一律拒绝，避免送出离谱的 prosody rate。 */
export const RATE_MULTIPLIER_MIN = 0.5;
export const RATE_MULTIPLIER_MAX = 2;

/** 停顿预设（毫秒）。上下限直接用 core 的 MIN/MAX_PAUSE_MS。 */
export const PAUSE_PRESETS: readonly number[] = [500, 1000, 2000, 5000];

/** 语种分组：wire 的 locale ↔ 界面上的 BrE / AmE 徽标。 */
export const VOICE_LOCALES: ReadonlyArray<{ locale: string; badge: string }> = [
  { locale: "en-GB", badge: "BrE" },
  { locale: "en-US", badge: "AmE" }
];

export const VOICE_GENDERS: ReadonlyArray<{ gender: string; label: string }> = [
  { gender: "female", label: "女声 ♀" },
  { gender: "male", label: "男声 ♂" }
];

/**
 * 停顿时长展示：不足 1 秒用 ms，1 秒及以上用 s 且不补小数零。
 * 这个标签会重复出现在文字下方，宽度直接决定相邻两个会不会撞上——
 * 「1s」只有「1.0 秒」的三分之一宽。
 */
export function formatPauseLabel(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = durationMs / 1000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
}

/**
 * 音色标签形如「Sonia · 英式女声」；音色网格已按语种+性别分组，
 * 只显示人名部分，避免每行重复「英式女声」。
 */
export function voiceShortName(voice: VoiceOption): string {
  return voice.label.split("·")[0]?.trim() || voice.label;
}
