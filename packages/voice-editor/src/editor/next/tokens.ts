import type {
  RichTextAnnotation,
  RichTextEmphasisLevel,
  RichTextV2
} from "@tsz/types";
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
  /** 词序号 → 语法结构分类。 */
  roles: Record<number, string>;
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
}

export const EMPTY_MARKS: MarkState = {
  roles: {},
  liaisons: [],
  pauses: {},
  passthrough: []
};

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

/** 连读必须跨词且终点在右：同一个词内部连线没有意义。 */
export function isValidLiaison(link: LiaisonLink): boolean {
  return (
    isValidAnchor(link.start) &&
    isValidAnchor(link.end) &&
    link.end.token > link.start.token
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

  for (const token of tokens) {
    const level = marks.roles[token.index];
    if (!level) continue;
    annotations.push({
      type: "emphasis",
      start: token.start,
      end: token.end,
      // 三分类直接落盘（后端枚举已放开）；存量 "strong" 读回时按核心词理解。
      level: level as RichTextEmphasisLevel
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
  const roles: Record<number, string> = {};
  const liaisons: LiaisonLink[] = [];
  const pauses: Record<number, number> = {};
  const passthrough: RichTextAnnotation[] = [];

  for (const annotation of value.annotations) {
    if (annotation.type === "phoneme" || annotation.type === "highlight") {
      passthrough.push(annotation);
      continue;
    }
    if (annotation.type === "emphasis") {
      for (const token of tokens) {
        const overlaps =
          annotation.start < token.end && annotation.end > token.start;
        if (overlaps) {
          roles[token.index] =
            normalizeGrammarLevel(annotation.level) ?? "core";
        }
      }
    } else if (annotation.type === "liaison") {
      /*
       * 两端各自的宽度由 start_len / end_len 还原；缺省按 1 个码点，
       * 这样三分类落地之前存的老数据仍读得回来。
       */
      const startLen = Math.max(1, annotation.start_len ?? 1);
      const endLen = Math.max(1, annotation.end_len ?? 1);
      const start = widenAnchor(
        tokens,
        offsetToAnchor(tokens, annotation.start),
        annotation.start,
        startLen
      );
      const end = widenAnchor(
        tokens,
        offsetToAnchor(tokens, annotation.end - endLen),
        annotation.end - endLen,
        endLen
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

  const roles: Record<number, string> = {};
  for (const [rawIndex, level] of Object.entries(marks.roles)) {
    const index = Number(rawIndex);
    if (survives(index)) roles[index] = level;
  }

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

  /** 旧坐标里改动段的右开边界，以及本次编辑带来的长度变化。 */
  const changedEnd = before.length - suffix;
  const delta = after.length - before.length;

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
