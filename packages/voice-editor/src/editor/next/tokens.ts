import type {
  RichTextAnnotation,
  RichTextEmphasisLevel,
  RichTextV2
} from "@tsz/types";
import type { TextLinkV3 } from "@tsz/types";
import { liaisonAnchorSpans } from "../../core/liaison";
import { normalizeGrammarLevel } from "./roles";

/** 一个词在码点序列中的位置，左闭右开。 */
export interface Token {
  index: number;
  start: number;
  end: number;
  text: string;
}

/**
 * 标注状态按「词 / 字母 / 词缝」的序号存放，而不是绝对码点偏移：界面操作的就是
 * 这三种靶子，改文本时也能按词决定每条标注的去留。序列化时才换算成 wire 偏移。
 *
 * 词缝 i 指第 i 个词与第 i+1 个词之间。
 */
export interface MarkState {
  /** 语法结构单元：一段连续的码点区间（可以只是一个词里的几个字母）归入某一分类。 */
  roles: RoleUnit[];
  /** 连读连线；每条连接两个字母锚点，可跨任意距离。 */
  liaisons: LiaisonLink[];
  /** 词缝序号 → 停顿毫秒。 */
  pauses: Record<number, number>;
  /**
   * 本编辑器不建模、但必须原样带回去的注解（音标、彩色高亮）。
   * 界面按原型砍掉了这两类入口，但历史数据里可能有——不透传就会在
   * 「载入 → 保存」时被静默丢弃，而丢标注比标错更难被发现。
   */
  passthrough: RichTextAnnotation[];
}

/**
 * 语法结构单元：绝对码点区间 [start, end) 归入某一分类，与 wire 的 emphasis 同形。
 *
 * 粒度是**字母**而不是词：管理员要把 "working" 的 "ing" 单独标成语法词、
 * "work" 标成核心词，所以区间可以落在一个词内部，也可以拖过几个词。
 * 不像连读那样按「词序号 + 词内偏移」存，是因为区间本就允许跨词、含空格，
 * 改文本时按编辑窗口平移/裁切比按词判定更贴合。
 */
export interface RoleUnit {
  start: number;
  end: number;
  level: string;
}

/**
 * 连读锚点：第 token 个词里的一段**连续**字母（词内偏移，按码点计）。
 * 存词内偏移而非绝对偏移，改文本时才能按词决定去留。
 */
export interface LiaisonAnchor {
  token: number;
  /** 升序且连续；单字母锚点就是长度 1。 */
  offsets: number[];
}

/** 一条连读：起点锚点 → 终点锚点，终点必须落在起点右侧的另一个词里。 */
export interface LiaisonLink {
  start: LiaisonAnchor;
  end: LiaisonAnchor;
}

/** 正在拼、尚未成线的一条连读。 */
export interface LiaisonDraft {
  start?: LiaisonAnchor;
  end?: LiaisonAnchor;
}

/** 一次撤销/重做的完整快照：文本与标注必须成对回退。 */
export interface EditorSnapshot {
  text: string;
  marks: MarkState;
  textLinks?: TextLinkV3[];
}

export const EMPTY_MARKS: MarkState = {
  roles: [],
  liaisons: [],
  pauses: {},
  passthrough: []
};

/** 覆盖码点 position 的单元；不属于任何单元则为空。 */
export function unitAt(
  units: RoleUnit[],
  position: number
): RoleUnit | undefined {
  return units.find((unit) => position >= unit.start && position < unit.end);
}

/** 从单元列表里挖掉 [start, end)：整个落在区间里的消失，跨过边界的被裁短或一分为二。 */
function cutRange(units: RoleUnit[], start: number, end: number): RoleUnit[] {
  const result: RoleUnit[] = [];
  for (const unit of units) {
    if (unit.end <= start || unit.start >= end) {
      result.push(unit);
      continue;
    }
    if (unit.start < start) result.push({ ...unit, end: start });
    if (unit.end > end) result.push({ ...unit, start: end });
  }
  return result;
}

/** 相邻或重叠的同分类单元并成一个，输出按位置排好序。 */
function coalesce(units: RoleUnit[]): RoleUnit[] {
  const sorted = [...units].sort((a, b) => a.start - b.start);
  const result: RoleUnit[] = [];
  for (const unit of sorted) {
    const previous = result[result.length - 1];
    if (
      previous &&
      previous.level === unit.level &&
      unit.start <= previous.end
    ) {
      previous.end = Math.max(previous.end, unit.end);
    } else {
      result.push({ ...unit });
    }
  }
  return result;
}

/**
 * 用某个分类刷一段区间。
 *
 * - 区间里已经**全部**是这个分类 → 视为取消：这几个字母退出单元（单元可能因此
 *   一分为二），这样逐个点字母既能上色也能撤色；`toggle: false` 关掉这条，
 *   用于「两次单击把中间接上」——补齐中间时不能把已上色的两端反过来抹掉；
 * - 否则区间内不管原来是什么，统一改成这个分类，再与两侧同分类的单元接成一段——
 *   一个字母一个字母地点过去，落盘就是一条连续的 emphasis。
 */
export function applyRoleRange(
  text: string,
  units: RoleUnit[],
  unit: RoleUnit,
  options: { toggle?: boolean } = {}
): RoleUnit[] {
  if (unit.end <= unit.start) return units;
  const cleared = cutRange(units, unit.start, unit.end);
  let next: RoleUnit[];
  if (options.toggle !== false) {
    let covered = 0;
    for (const existing of units) {
      if (existing.level !== unit.level) continue;
      const overlap =
        Math.min(existing.end, unit.end) - Math.max(existing.start, unit.start);
      if (overlap > 0) covered += overlap;
    }
    next = covered >= unit.end - unit.start ? cleared : [...cleared, unit];
  } else {
    next = [...cleared, unit];
  }
  // 逐字母撤色会在残段两头留下空格；只剩空格的单元看不见也点不掉，却照样落盘。
  const points = Array.from(text);
  return coalesce(next).flatMap((item) => {
    const trimmed = trimUnit(points, item);
    return trimmed ? [trimmed] : [];
  });
}

/**
 * 把 [start, end) 按换行拆成几段（不含换行符本身）：wire 不接受跨段落的标注，
 * 拖过换行的一段语法结构按行各自上色，而不是整段进不了 wire。
 */
export function splitRangeAtParagraphs(
  text: string,
  start: number,
  end: number
): Array<{ start: number; end: number }> {
  const points = Array.from(text);
  const pieces: Array<{ start: number; end: number }> = [];
  let from = start;
  for (let index = start; index <= end; index += 1) {
    const point = points[index];
    if (index === end || point === "\n" || point === "\r") {
      if (index > from) pieces.push({ start: from, end: index });
      from = index + 1;
    }
  }
  return pieces;
}

export function makeAnchor(token: number, offset: number): LiaisonAnchor {
  return { token, offsets: [offset] };
}

/** 锚点覆盖的绝对码点区间（右开）；越界或空锚点返回 undefined。 */
export function anchorRange(
  tokens: Token[],
  anchor: LiaisonAnchor
): { start: number; end: number } | undefined {
  const token = tokens[anchor.token];
  if (!token || anchor.offsets.length === 0) return undefined;
  const first = Math.min(...anchor.offsets);
  const last = Math.max(...anchor.offsets);
  const start = token.start + first;
  const end = token.start + last + 1;
  return end <= token.end ? { start, end } : undefined;
}

/** 绝对码点位置 → 单字母锚点；落在空白上返回 undefined。 */
export function offsetToAnchor(
  tokens: Token[],
  position: number
): LiaisonAnchor | undefined {
  const token = tokens.find(
    (candidate) => position >= candidate.start && position < candidate.end
  );
  return token ? makeAnchor(token.index, position - token.start) : undefined;
}

/**
 * 把单字母锚点按 wire 上记的宽度展开成多字母锚点。
 *
 * 只在这些码点确实同属一个词时展开：宽度越过词边界说明数据与当前正文对不上，
 * 这时退回单字母，宁可画短一点也不要画到别的词身上。
 */
function widenAnchor(
  tokens: Token[],
  anchor: LiaisonAnchor | undefined,
  from: number,
  length: number
): LiaisonAnchor | undefined {
  if (!anchor || length <= 1) return anchor;
  const token = tokens[anchor.token];
  if (!token || from + length > token.end) return anchor;
  return {
    token: anchor.token,
    offsets: Array.from({ length }, (_, index) => from - token.start + index)
  };
}

/** 锚点选中的字母，用于「起点 / 终点」那行回显。 */
export function anchorLetters(tokens: Token[], anchor: LiaisonAnchor): string {
  const token = tokens[anchor.token];
  if (!token) return "";
  const letters = Array.from(token.text);
  return [...anchor.offsets]
    .sort((a, b) => a - b)
    .map((offset) => letters[offset] ?? "")
    .join("");
}

/** 锚点自身是否成立：非空、且词内连续。 */
export function isValidAnchor(anchor: LiaisonAnchor): boolean {
  if (anchor.offsets.length === 0) return false;
  const sorted = [...anchor.offsets].sort((a, b) => a - b);
  return sorted.every(
    (offset, index) => index === 0 || offset === sorted[index - 1]! + 1
  );
}

/**
 * 这条连读是否跨过了段落换行。
 *
 * wire 层不接受跨换行的标注（normalize 报 cross_paragraph）。而这在编辑里很容易
 * 撞上：在已连读的两个词中间敲一个回车就成立了。不在这里拦掉的话，本地模型会
 * 折算不出合法 wire，改动从此静默停止回写——用户看着自己的新文本，表单里存的
 * 却还是出错前那份。
 */
export function crossesParagraph(
  text: string,
  tokens: Token[],
  link: LiaisonLink
): boolean {
  const start = anchorRange(tokens, link.start);
  const end = anchorRange(tokens, link.end);
  if (!start || !end) return false;
  return Array.from(text)
    .slice(start.start, end.end)
    .some((point) => point === "\n" || point === "\r");
}

/** 连读支持词内字母，按正文中从左到右的端点顺序保存。 */
export function isValidLiaison(link: LiaisonLink): boolean {
  return (
    isValidAnchor(link.start) &&
    isValidAnchor(link.end) &&
    (link.end.token > link.start.token ||
      (link.end.token === link.start.token &&
        Math.min(...link.end.offsets) >= Math.min(...link.start.offsets) &&
        Math.max(...link.end.offsets) >= Math.max(...link.start.offsets)))
  );
}

/**
 * 把一个字母并入锚点：紧邻则扩展，否则重开一个单字母锚点。
 * 再点已选中的字母则收回到该字母，给一个「点错了就地重来」的出口。
 */
export function extendAnchor(
  anchor: LiaisonAnchor,
  offset: number
): LiaisonAnchor {
  const sorted = [...anchor.offsets].sort((a, b) => a - b);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (offset === first - 1) return { ...anchor, offsets: [offset, ...sorted] };
  if (offset === last + 1) return { ...anchor, offsets: [...sorted, offset] };
  return { ...anchor, offsets: [offset] };
}

/**
 * 把一段文字切成**字素簇**，并给出每簇起始的码点偏移。
 *
 * 模型层一律按码点算（与 wire 对齐），但渲染不能按码点拆：把 👨‍👩‍👧 这类 ZWJ
 * 序列、或 e + U+0301 这类组合字符拆进不同的 <span>，浏览器就合不成一个字形——
 * 下层会多显示出几个字符，从该词起整行与上层 textarea 逐字错位。
 *
 * 注意：多码点簇只用首个码点当锚点，所以这种字符上的连读锚点扩展（相邻判定）
 * 会退化成单簇选择。这类字符在英文例句里极少，先按可用性优先处理对齐。
 */
export function graphemes(
  text: string
): Array<{ text: string; offset: number }> {
  const fallback = () =>
    Array.from(text).map((point, offset) => ({ text: point, offset }));
  const segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: string }
      ) => { segment: (input: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (!segmenter) return fallback();
  const result: Array<{ text: string; offset: number }> = [];
  let offset = 0;
  for (const { segment } of new segmenter(undefined, {
    granularity: "grapheme"
  }).segment(text)) {
    result.push({ text: segment, offset });
    offset += Array.from(segment).length;
  }
  return result;
}

/** 按空白切词，返回每个词的码点区间。空白本身不成词。 */
export function tokenize(text: string): Token[] {
  const points = Array.from(text);
  const tokens: Token[] = [];
  let start = -1;
  for (let index = 0; index <= points.length; index += 1) {
    const isSpace = index === points.length || /\s/u.test(points[index]!);
    if (isSpace) {
      if (start >= 0) {
        tokens.push({
          index: tokens.length,
          start,
          end: index,
          text: points.slice(start, index).join("")
        });
        start = -1;
      }
    } else if (start < 0) {
      start = index;
    }
  }
  return tokens;
}

/**
 * 连读落到 wire 是一段区间（起点锚点首字母 → 终点锚点末字母，右开），外加两端
 * 各自的宽度——后端已为此加了 start_len / end_len，多字母锚点因此能完整往返。
 */
function liaisonRange(
  tokens: Token[],
  link: LiaisonLink
):
  | { start: number; end: number; start_len: number; end_len: number }
  | undefined {
  const start = anchorRange(tokens, link.start);
  const end = anchorRange(tokens, link.end);
  if (!start || !end || end.end <= start.start) return undefined;
  return {
    start: start.start,
    end: end.end,
    start_len: start.end - start.start,
    end_len: end.end - end.start
  };
}

/** 停顿插在左词末尾之后。 */
function pausePosition(tokens: Token[], gap: number): number | undefined {
  const left = tokens[gap];
  return left && tokens[gap + 1] ? left.end : undefined;
}

/** 词/词缝上的标注 → wire 注解。 */
export function marksToAnnotations(
  text: string,
  marks: MarkState
): RichTextAnnotation[] {
  const tokens = tokenize(text);
  const annotations: RichTextAnnotation[] = [];

  const length = Array.from(text).length;
  for (const unit of marks.roles) {
    const start = Math.max(0, unit.start);
    const end = Math.min(length, unit.end);
    if (end <= start) continue;
    annotations.push({
      type: "emphasis",
      start,
      end,
      // 三分类直接落盘（后端枚举已放开）；存量 "strong" 读回时按核心词理解。
      level: unit.level as RichTextEmphasisLevel
    });
  }

  for (const link of marks.liaisons) {
    const range = liaisonRange(tokens, link);
    if (!range) continue;
    annotations.push({ type: "liaison", ...range });
  }

  for (const [rawGap, durationMs] of Object.entries(marks.pauses)) {
    const at = pausePosition(tokens, Number(rawGap));
    if (at === undefined) continue;
    annotations.push({ type: "pause", at, duration_ms: durationMs });
  }

  annotations.push(...marks.passthrough);

  return annotations;
}

/**
 * wire 注解 → 词/词缝上的标注。
 *
 * 只认得回本编辑器写得出的形状：emphasis 落在某个词的区间上、liaison 跨过某条
 * 词缝、pause 落在某条词缝附近。认不出的（例如跨多词的手工区间）按最接近的词/
 * 词缝归位，宁可归错也不静默丢弃——丢标注比归错更难被发现。
 */
export function annotationsToMarks(value: RichTextV2): MarkState {
  const tokens = tokenize(value.text);
  let roles: RoleUnit[] = [];
  const liaisons: LiaisonLink[] = [];
  const pauses: Record<number, number> = {};
  const passthrough: RichTextAnnotation[] = [];

  for (const annotation of value.annotations) {
    if (annotation.type === "phoneme" || annotation.type === "highlight") {
      passthrough.push(annotation);
      continue;
    }
    if (annotation.type === "emphasis") {
      /*
       * 与 wire 同形进来，分类归一到三分类之一。normalize 只合并同分类的重叠，
       * 手工 / 导入数据里不同分类的重叠 emphasis 能合法通过——这里按「后者覆盖
       * 前者」收成互不重叠的单元，否则屏幕显示哪条、落笔算哪条会对不上。
       */
      if (annotation.end > annotation.start) {
        const unit = {
          start: annotation.start,
          end: annotation.end,
          level: normalizeGrammarLevel(annotation.level) ?? "core"
        };
        roles = coalesce([...cutRange(roles, unit.start, unit.end), unit]);
      }
    } else if (annotation.type === "liaison") {
      /*
       * 两端各自的宽度由 start_len / end_len 还原；缺省按 1 个码点，
       * 这样三分类落地之前存的老数据仍读得回来。
       */
      const spans = liaisonAnchorSpans(annotation);
      const start = widenAnchor(
        tokens,
        offsetToAnchor(tokens, spans.start.start),
        spans.start.start,
        spans.start.end - spans.start.start
      );
      const end = widenAnchor(
        tokens,
        offsetToAnchor(tokens, spans.end.start),
        spans.end.start,
        spans.end.end - spans.end.start
      );
      if (start && end && isValidLiaison({ start, end })) {
        liaisons.push({ start, end });
      }
    } else if (annotation.type === "pause") {
      const gap = tokens.findIndex(
        (token, index) =>
          tokens[index + 1] !== undefined && annotation.at <= token.end
      );
      const resolved = gap >= 0 ? gap : tokens.length - 2;
      if (resolved >= 0) pauses[resolved] = annotation.duration_ms;
    }
  }

  return { roles, liaisons, pauses, passthrough };
}

/**
 * 改文本后重挂标注：只保留「同一序号上的词一字未变」的标注。
 * 词被改写/删除就丢掉它的标注——与其把标签留在一个已经不是那个词的位置上，
 * 不如让它消失，让人重标。
 */
export function remapMarks(
  previousText: string,
  nextText: string,
  marks: MarkState
): MarkState {
  const before = tokenize(previousText);
  const after = tokenize(nextText);
  const survives = (index: number) =>
    before[index] !== undefined && before[index]!.text === after[index]?.text;

  const roles = remapRoleUnits(previousText, nextText, marks.roles);

  // 词缝两侧的词都还在原位，这条缝上的停顿才有意义。
  const gapSurvives = (gap: number) => survives(gap) && survives(gap + 1);

  const pauses: Record<number, number> = {};
  for (const [rawGap, durationMs] of Object.entries(marks.pauses)) {
    const gap = Number(rawGap);
    if (gapSurvives(gap)) pauses[gap] = durationMs;
  }

  // 连读两端所在的词都没被改写，且字母还在词长之内，这条连线才留得住。
  const anchorSurvives = (anchor: LiaisonAnchor) => {
    if (!survives(anchor.token)) return false;
    const length = Array.from(after[anchor.token]!.text).length;
    return anchor.offsets.every((offset) => offset < length);
  };

  return {
    roles,
    liaisons: marks.liaisons.filter(
      (link) =>
        anchorSurvives(link.start) &&
        anchorSurvives(link.end) &&
        // 两词之间新插入了换行：这条连读在 wire 上已经非法，留着会卡住回写。
        !crossesParagraph(nextText, after, link)
    ),
    pauses,
    passthrough: remapPassthrough(previousText, nextText, marks.passthrough)
  };
}

/** 一次编辑真正动过的那一段（旧坐标），由公共前缀 + 公共后缀圈出来。 */
function editWindow(
  previousText: string,
  nextText: string
): { prefix: number; changedEnd: number; delta: number } {
  const before = Array.from(previousText);
  const after = Array.from(nextText);

  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    prefix,
    changedEnd: before.length - suffix,
    delta: after.length - before.length
  };
}

/** 去掉区间两端的空白码点：裁切后留下的半截单元不该带着一个空格。 */
function trimUnit(text: string[], unit: RoleUnit): RoleUnit | undefined {
  let { start, end } = unit;
  while (start < end && /\s/u.test(text[start] ?? "")) start += 1;
  while (end > start && /\s/u.test(text[end - 1] ?? "")) end -= 1;
  return end > start ? { ...unit, start, end } : undefined;
}

/**
 * 语法结构单元随文本改动平移：改动段之前的原样保留，之后的整体平移；
 * 压在改动段上的单元只丢被改到的那一段，两侧剩下的部分各自留成一段——
 * 改一个错字不该把整个短语的标记抹掉。
 *
 * 改动段落在词内时先撑到整词：把 centre 改成 middle，按字符比对只有末尾的 e
 * 没动，可那已经是另一个词了，留着一个孤零零上了色的 e 只会让人困惑；
 * 在词中间插一个字母同理，那个词的颜色整体作废，让人重标。
 */
function remapRoleUnits(
  previousText: string,
  nextText: string,
  units: RoleUnit[]
): RoleUnit[] {
  if (previousText === nextText) return units;
  const { prefix, changedEnd, delta } = editWindow(previousText, nextText);
  const before = Array.from(previousText);
  const after = Array.from(nextText);
  const isWordChar = (index: number) =>
    index >= 0 && index < before.length && !/\s/u.test(before[index]!);

  let cutStart = prefix;
  if (isWordChar(cutStart - 1) && isWordChar(cutStart)) {
    while (isWordChar(cutStart - 1)) cutStart -= 1;
  }
  let cutEnd = changedEnd;
  if (isWordChar(cutEnd - 1) && isWordChar(cutEnd)) {
    while (isWordChar(cutEnd)) cutEnd += 1;
  }

  const kept: RoleUnit[] = [];
  for (const unit of units) {
    if (unit.end <= cutStart) {
      kept.push(unit);
      continue;
    }
    if (unit.start >= cutEnd) {
      kept.push({ ...unit, start: unit.start + delta, end: unit.end + delta });
      continue;
    }
    const left =
      unit.start < cutStart
        ? trimUnit(after, { ...unit, end: cutStart })
        : undefined;
    const right =
      unit.end > cutEnd
        ? trimUnit(after, {
            ...unit,
            start: cutEnd + delta,
            end: unit.end + delta
          })
        : undefined;
    if (left) kept.push(left);
    if (right) kept.push(right);
  }
  return kept;
}

/**
 * 透传注解（音标 / 高亮）带的是绝对码点偏移，改文本后要跟着挪。
 *
 * 用「公共前缀 + 公共后缀」圈出这次编辑真正动过的那一段：动过的段之前的注解原样
 * 保留，之后的整体平移，只有压在改动段上的才丢——那种确实已经不指向原来的音了。
 *
 * 早先这里写的是「文本一变就整批丢弃」，而 remapMarks 只在改文本时才被调用，
 * 于是那个条件恒真：随便敲一个字符，整条例句的音标和高亮就被清空且毫无提示。
 * 这跟 MarkState.passthrough 立的规矩（丢标注比标错更难发现）正好相反。
 */
function remapPassthrough(
  previousText: string,
  nextText: string,
  annotations: RichTextAnnotation[]
): RichTextAnnotation[] {
  if (previousText === nextText) return annotations;
  const { prefix, changedEnd, delta } = editWindow(previousText, nextText);

  const kept: RichTextAnnotation[] = [];
  for (const annotation of annotations) {
    if (annotation.type === "pause") continue;
    if (annotation.end <= prefix) {
      kept.push(annotation);
    } else if (annotation.start >= changedEnd) {
      kept.push({
        ...annotation,
        start: annotation.start + delta,
        end: annotation.end + delta
      });
    }
    // 压在改动段上：那段文字已经不是原来的了，留着就是一条指错地方的标注。
  }
  return kept;
}
