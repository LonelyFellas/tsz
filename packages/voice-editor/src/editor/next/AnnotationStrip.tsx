import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { Popover } from "antd";
import { associationWords } from "../../core/text-links";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  LiaisonArcLayer,
  useLiaisonArcs,
  type LiaisonLinkElements
} from "../../marks";
import { brushTarget, formatPauseLabel, type Brush } from "./roles";
import {
  graphemes,
  tokenize,
  unitAt,
  type LiaisonAnchor,
  type LiaisonDraft,
  type MarkState
} from "./tokens";

/** 一个字母（字素簇）占的绝对码点区间。 */
interface CodeSpan {
  start: number;
  end: number;
}

/** 这个字母属于草稿的哪一端；都不属则为空。 */
function draftRole(
  draft: LiaisonDraft,
  start: number
): "start" | "end" | undefined {
  /*
   * 按字母起点落没落进锚点判，而不是要求整个字素簇被覆盖：选区入口造出来的是
   * 单码点锚点，而组合字符、ZWJ 序列的字母元素跨两个以上码点，按覆盖判会漏掉
   * 这类字母的端点色——数据里选中了，屏幕上却没上色。
   */
  const covered = (anchor?: LiaisonAnchor) =>
    anchor !== undefined && start >= anchor.start && start < anchor.end;
  if (covered(draft.start)) return "start";
  if (covered(draft.end)) return "end";
  return undefined;
}

export interface AnnotationStripProps {
  onTextSelection?: (range?: { start: number; end: number }) => void;
  associationContent?: ReactNode;
  associationAnchor?: number;
  selectedLinkRanges?: CodeSpan[];
  linkedRanges?: CodeSpan[];
  onWordRange?: (range: CodeSpan) => void;
  text: string;
  marks: MarkState;
  brush: Brush;
  /** 正在拼的这条连读，两端各自可含多个连续字母。 */
  draft: LiaisonDraft;
  readOnly?: boolean;
  textReadOnly?: boolean;
  /** 文本框的无障碍名；同一页面上多个编辑器靠它区分。 */
  inputLabel: string;
  /** 宿主用于错误定位的 data-* 属性；必须落在可聚焦的输入框上。 */
  inputDataAttributes?: Record<string, string>;
  inputPlaceholder?: string;
  onTextChange: (value: string) => void;
  /** 语法结构落笔：绝对码点区间 [start, end)；单击一个字母是 click，拖过一段是 drag。 */
  onRoleRange: (start: number, end: number, mode: "click" | "drag") => void;
  /** 语法结构画笔上一次单击上色的字母，标出来让人知道下一次同词单击会与它接上。 */
  roleAnchorStart?: number;
  onGapClick: (gapIndex: number) => void;
  onLetterClick: (anchor: LiaisonAnchor) => void;
  onLiaisonClick: (index: number) => void;
}

/**
 * 画布：文字和标注共用同一块地方，看到哪儿就在哪儿改。
 *
 * 两层严格同域叠放——
 * - 下层 `.tsz-ve-strip` 渲染同一份文本，负责显色、连读弧、停顿记号和命中区；
 * - 上层是一个**文字透明**的原生 textarea，负责打字、光标、选区、IME、粘贴。
 *
 * 这样分工是因为：打字这件事原生控件做得又对又全（光标、输入法、撤销、
 * 双向文本都不用自己实现），而逐词上色、跨词画弧是它做不到的。让 textarea 只留
 * 光标和选区、把字交给下层画，两边就各做各最擅长的。
 *
 * 代价是**两层的排版必须逐像素一致**：字体、字号、行高、字距、内边距、换行规则
 * 都得对齐，下层的词也不能带内边距——inline 元素的横向内边距会累计成偏移，
 * 一个词偏 4px，一行下来就错开半个字。
 *
 * 鼠标归谁由当前画笔决定：空手时归 textarea（放光标），拿起笔时归标注层。
 */
export function AnnotationStrip({
  associationContent,
  associationAnchor,
  selectedLinkRanges,
  linkedRanges,
  onWordRange,
  text,
  marks,
  brush,
  draft,
  readOnly,
  textReadOnly,
  inputLabel,
  inputDataAttributes,
  inputPlaceholder,
  onTextChange,
  onRoleRange,
  onTextSelection,
  roleAnchorStart,
  onGapClick,
  onLetterClick,
  onLiaisonClick
}: AnnotationStripProps) {
  const tokens = tokenize(text);
  const target = readOnly ? "none" : brushTarget(brush);
  const painting = target !== "none";
  /*
   * 停顿标签按「相邻两条交替上下」排布：500ms 这类标签比词缝间距还宽，同一行
   * 会直接叠字。按词缝奇偶交替不行——隔一个词缝的两条仍可能同排，故按停顿自身
   * 的先后次序交替。
   */
  const pausedGaps = Object.keys(marks.pauses)
    .map(Number)
    .sort((left, right) => left - right);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const letterRefs = useRef(new Map<number, HTMLElement>());

  const registerLetter = useCallback(
    (key: number) => (node: HTMLElement | null) => {
      if (node) letterRefs.current.set(key, node);
      else letterRefs.current.delete(key);
    },
    []
  );

  /*
   * 每条连读两端的字母元素，按 marks.liaisons 的序号对位（缺元素的留空位，
   * 弧线序号才能继续指回原来那条连读，点弧线删除靠它）。
   *
   * target 与 text 也要进依赖：换文本、切画笔都会改字母的渲染方式与横向位置，
   * 而容器宽度不变、ResizeObserver 不会触发，弧线不重算就会错位。
   */
  const collectLinks = useCallback((): Array<
    LiaisonLinkElements | undefined
  > => {
    const elementsOf = (anchor: LiaisonAnchor) => {
      const letters: HTMLElement[] = [];
      for (let point = anchor.start; point < anchor.end; point += 1) {
        const letter = letterRefs.current.get(point);
        if (letter) letters.push(letter);
      }
      const first = letters[0];
      const last = letters[letters.length - 1];
      if (!first || !last) return undefined;
      return {
        first,
        last,
        text: Array.from(text).slice(anchor.start, anchor.end).join("")
      };
    };
    return marks.liaisons.map((link) => {
      const start = elementsOf(link.start);
      const end = elementsOf(link.end);
      return start && end ? { start, end } : undefined;
    });
  }, [marks.liaisons, target, text]);

  const { arcs, strokeWidth } = useLiaisonArcs(containerRef, collectLinks);

  /*
   * 语法结构按字母圈选：按下一个字母、拖过一段字母、松手落笔；只按一下就是
   * 那一个字母。anchor 是按下的字母、focus 是最后经过的字母，都记绝对码点区间。
   * 松手在 document 上收：拖到标注带外面松开也照常落笔，不留下悬着的圈选。
   */
  const [selecting, setSelecting] = useState<
    { anchor: CodeSpan; focus: CodeSpan } | undefined
  >();
  const selectedRange = useMemo<CodeSpan | undefined>(
    () =>
      selecting
        ? {
            start: Math.min(selecting.anchor.start, selecting.focus.start),
            end: Math.max(selecting.anchor.end, selecting.focus.end)
          }
        : undefined,
    [selecting]
  );

  // 圈选一变就重挂一次 mouseup 监听，闭包里永远是当前这段，不必另存 ref。
  useEffect(() => {
    if (!selecting || !selectedRange) return;
    const mode =
      selecting.anchor.start === selecting.focus.start ? "click" : "drag";
    const finish = () => {
      setSelecting(undefined);
      onRoleRange(selectedRange.start, selectedRange.end, mode);
    };
    document.addEventListener("mouseup", finish);
    return () => document.removeEventListener("mouseup", finish);
  }, [selecting, selectedRange, onRoleRange]);

  const covers = (range: CodeSpan | undefined, start: number, end: number) =>
    range !== undefined && range.start <= start && range.end >= end;

  /*
   * 落笔用 mousedown + preventDefault，不用 click：click 之前浏览器已经把光标
   * 挪到点击处、还可能起一段选区，等到 click 再拦就晚了。
   */
  const paint = (run: () => void) => (event: ReactMouseEvent) => {
    // 只认主键：右键要留给原生菜单，而且它的 mouseup 常常送不到页面，会留下悬着的圈选。
    if (!painting || event.button !== 0) return;
    event.preventDefault();
    run();
  };

  return (
    <div className="tsz-ve-canvas" data-target={target} data-brush={brush.kind}>
      {/*
       * 标注层对读屏隐藏：正文由下面那个 textarea 提供，两边都念的话同一句话会被
       * 读两遍，连读模式下还会逐字母念「xxx 的第 1 个字母 p」。
       * 注意 textarea 是它的兄弟而不是子节点，所以宿主按 data-v3-* 定位仍然有效。
       *
       * 词 / 词缝 / 字母只认鼠标（span 上不设 tabIndex、也不挂 onClick）：admin 是
       * 内部后台，按项目约定不做无障碍适配，不为此把几十个 span 塞进 tab 序。
       * 这些 role / aria-label 保留，是给测试用的定位锚点。
       */}
      <div
        className="tsz-ve-strip"
        ref={containerRef}
        data-target={target}
        aria-hidden
      >
        <LiaisonArcLayer
          arcs={arcs}
          strokeWidth={strokeWidth}
          onArcMouseDown={
            // 只有连读画笔才能点弧线删除：语法结构画笔也落在字母上，弧线的命中带
            // 压在字母上方，不限画笔的话给弧线端点附近的字母上色会把连读点掉。
            brush.kind === "liaison"
              ? (index, event) => paint(() => onLiaisonClick(index))(event)
              : undefined
          }
        />

        {/*
         * 词与词之间渲染的是**真正的空格字符**，不是一个占位方块：下层要和
         * textarea 逐字对齐，少一个空格整行就错开一个字宽。
         */}
        {leadingSpace(text, tokens)}
        {tokens.map((token, position) => {
          const hasNext = position < tokens.length - 1;
          const nextToken = tokens[position + 1];
          const pause = marks.pauses[position];
          // 按字素簇渲染，不按码点：否则组合字符与 emoji 会被拆开、整行错位。
          const letters = graphemes(token.text);
          const linkWords = associationWords(token.text).map((word) => ({
            ...word,
            start: token.start + word.start,
            end: token.start + word.end
          }));
          // 拖选跨过词缝时，那段空白也描进预览里，看得出是连着的一段。
          const gapClass =
            nextToken && covers(selectedRange, token.end, nextToken.start)
              ? " is-selecting"
              : "";

          return (
            <Fragment key={token.index}>
              {/*
               * 词只是字母的容器：语法结构与连读都落在字母上，前者按码点区间上色
               * （可以只标一个词里的几个字母），后者把字母当锚点。
               */}
              <Popover
                content={associationContent}
                open={
                  brush.kind === "association" &&
                  associationAnchor !== undefined &&
                  associationAnchor >= token.start &&
                  associationAnchor < token.end &&
                  Boolean(associationContent)
                }
                trigger={[]}
                placement="bottomLeft"
              >
                <span
                  className={`tsz-ve-token is-letters${linkedRanges?.some((range) => covers(range, token.start, token.end)) ? " is-linked" : ""}${selectedLinkRanges?.some((range) => covers(range, token.start, token.end)) ? " is-link-selected" : ""}`}
                  role={target === "word" ? "button" : undefined}
                  aria-label={
                    target === "word"
                      ? `关联 ${token.text}（${token.index + 1}）`
                      : undefined
                  }
                  onMouseDown={(event) => {
                    if (target !== "word" || event.button !== 0) return;
                    event.preventDefault();
                    const point = (
                      event.target as HTMLElement
                    ).closest<HTMLElement>("[data-codepoint]")?.dataset
                      .codepoint;
                    const word =
                      point === undefined
                        ? linkWords[0]
                        : linkWords.find(
                            (item) =>
                              item.start <= Number(point) &&
                              Number(point) < item.end
                          );
                    if (word) onWordRange?.(word);
                  }}
                >
                  {letters.map(({ text: letter, offset }) => {
                    const start = token.start + offset;
                    const end = start + Array.from(letter).length;
                    const unit = unitAt(marks.roles, start);
                    const roleClass = unit ? ` is-${unit.level}` : "";
                    // 注意与 unit 的 level（语法分类）区分：这里是连读草稿的端别。
                    const anchorRole = draftRole(draft, start);
                    const selectedClass = covers(selectedRange, start, end)
                      ? " is-selecting"
                      : "";
                    const anchorClass =
                      roleAnchorStart === start ? " is-role-anchor" : "";
                    return (
                      <span
                        key={offset}
                        ref={registerLetter(start)}
                        className={`tsz-ve-letter${roleClass}${anchorRole ? ` is-anchor-${anchorRole}` : ""}${selectedClass}${anchorClass}${linkedRanges?.some((range) => covers(range, start, end)) ? " is-linked" : ""}${selectedLinkRanges?.some((range) => covers(range, start, end)) ? " is-link-selected" : ""}`}
                        role="button"
                        aria-label={`${token.text} 的第 ${offset + 1} 个字母 ${letter}`}
                        aria-pressed={Boolean(anchorRole)}
                        aria-disabled={target !== "letter"}
                        data-codepoint={start}
                        data-level={unit?.level}
                        data-letter={letter}
                        onMouseDown={paint(() => {
                          if (brush.kind === "liaison") {
                            onLetterClick({ start, end });
                          } else if (brush.kind === "role") {
                            const span = { start, end };
                            setSelecting({ anchor: span, focus: span });
                          }
                        })}
                        onMouseEnter={(event) => {
                          // 主键没按着就说明上次的 mouseup 丢了（如右键菜单吞掉），圈选作废。
                          if (!(event.buttons & 1)) {
                            setSelecting(undefined);
                            return;
                          }
                          setSelecting(
                            (current) =>
                              current && {
                                anchor: current.anchor,
                                focus: { start, end }
                              }
                          );
                        }}
                      >
                        <span className="tsz-ve-letter-text">{letter}</span>
                      </span>
                    );
                  })}
                </span>
              </Popover>

              {hasNext && (
                <span
                  className={`tsz-ve-gap${pause === undefined ? "" : " has-pause"}${gapClass}`}
                  role="button"
                  aria-label={gapLabel(position, pause)}
                  aria-pressed={pause !== undefined}
                  aria-disabled={target !== "gap"}
                  onMouseDown={paint(() => {
                    if (target === "gap") onGapClick(position);
                  })}
                >
                  {/*
                   * 停顿记号绝对定位在词缝下方，不占行内宽度：一旦占宽，词就被
                   * 推开，两层的对齐、词距和跨过此处的连读弧全都会跟着错。
                   */}
                  {pause !== undefined && (
                    <span
                      className="tsz-ve-gap-pause"
                      data-row={pausedGaps.indexOf(position) % 2}
                      aria-hidden
                    >
                      <span className="tsz-ve-gap-pause-bar" />
                      <span className="tsz-ve-gap-pause-value">
                        {formatPauseLabel(pause)}
                      </span>
                    </span>
                  )}
                  {textBetween(text, token.end, tokens[position + 1]!.start)}
                </span>
              )}
            </Fragment>
          );
        })}
        {/* 末尾的空白也要渲染出来，否则光标停在行尾时两层会差一个字宽。 */}
        {trailingSpace(text, tokens)}
      </div>

      <textarea
        {...inputDataAttributes}
        className="tsz-ve-canvas-input"
        aria-label={inputLabel}
        value={text}
        readOnly={readOnly || textReadOnly}
        spellCheck={false}
        placeholder={
          inputPlaceholder ?? "在这里直接输入英文，然后用上面的工具在字上标注"
        }
        onSelect={(event) => {
          const input = event.currentTarget;
          const start = Array.from(text.slice(0, input.selectionStart)).length;
          const end = Array.from(text.slice(0, input.selectionEnd)).length;
          onTextSelection?.(end > start ? { start, end } : undefined);
        }}
        onChange={(event) => onTextChange(event.target.value)}
      />
    </div>
  );
}

/** 首个词之前的空白，不渲染的话整行会左移一个字宽。 */
function leadingSpace(
  text: string,
  tokens: ReturnType<typeof tokenize>
): string {
  const first = tokens[0];
  return first ? Array.from(text).slice(0, first.start).join("") : text;
}

/** 两个词之间的原始空白，原样渲染以保证两层逐字对齐。 */
function textBetween(text: string, from: number, to: number): string {
  return Array.from(text).slice(from, to).join("");
}

function trailingSpace(
  text: string,
  tokens: ReturnType<typeof tokenize>
): string {
  const points = Array.from(text);
  const last = tokens[tokens.length - 1];
  // 没有词时整串已由 leadingSpace 渲染，这里不能重复一遍。
  if (!last) return "";
  return points.slice(last.end).join("");
}

function gapLabel(gap: number, pause: number | undefined): string {
  const suffix = pause === undefined ? "" : `：停顿 ${formatPauseLabel(pause)}`;
  return `第 ${gap + 1} 处词缝${suffix}`;
}
