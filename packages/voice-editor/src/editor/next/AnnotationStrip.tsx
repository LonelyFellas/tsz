import type { MouseEvent as ReactMouseEvent } from "react";
import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { liaisonPath, liaisonStrokeWidth } from "./liaisonPath";
import {
  GRAMMAR_ROLES,
  brushTarget,
  formatPauseLabel,
  type Brush
} from "./roles";
import {
  graphemes,
  tokenize,
  type LiaisonAnchor,
  type LiaisonDraft,
  type MarkState
} from "./tokens";

const ROLE_LABELS = new Map(
  GRAMMAR_ROLES.map((role) => [role.level, role.label])
);

const letterKey = (token: number, offset: number) => `${token}:${offset}`;

/** 这个字母属于草稿的哪一端；都不属则为空。 */
function draftRole(
  draft: LiaisonDraft,
  token: number,
  offset: number
): "start" | "end" | undefined {
  if (draft.start?.token === token && draft.start.offsets.includes(offset)) {
    return "start";
  }
  if (draft.end?.token === token && draft.end.offsets.includes(offset)) {
    return "end";
  }
  return undefined;
}

export interface AnnotationStripProps {
  text: string;
  marks: MarkState;
  brush: Brush;
  /** 正在拼的这条连读，两端各自可含多个连续字母。 */
  draft: LiaisonDraft;
  readOnly?: boolean;
  /** 文本框的无障碍名；同一页面上多个编辑器靠它区分。 */
  inputLabel: string;
  /** 宿主用于错误定位的 data-* 属性；必须落在可聚焦的输入框上。 */
  inputDataAttributes?: Record<string, string>;
  inputPlaceholder?: string;
  onTextChange: (value: string) => void;
  onWordClick: (tokenIndex: number) => void;
  onGapClick: (gapIndex: number) => void;
  onLetterClick: (anchor: LiaisonAnchor) => void;
  onLiaisonClick: (index: number) => void;
}

interface ArcGeometry {
  /** 跨行的连读会拆成两截，故 key 与 index 分开：两截指向同一条连读。 */
  key: string;
  index: number;
  d: string;
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
  text,
  marks,
  brush,
  draft,
  readOnly,
  inputLabel,
  inputDataAttributes,
  inputPlaceholder,
  onTextChange,
  onWordClick,
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
  const letterRefs = useRef(new Map<string, HTMLElement>());
  const [arcs, setArcs] = useState<ArcGeometry[]>([]);

  const registerLetter = useCallback(
    (key: string) => (node: HTMLElement | null) => {
      if (node) letterRefs.current.set(key, node);
      else letterRefs.current.delete(key);
    },
    []
  );

  /** 量出每条连读两端字母的位置，换算成容器坐标系里的弧线路径。 */
  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const base = container.getBoundingClientRect();
    const fontSize = Number.parseFloat(getComputedStyle(container).fontSize);

    // 多字母锚点的落点取整段选区的中心，与参考实现一致。
    const geometryOf = (anchor: LiaisonAnchor) => {
      const offsets = [...anchor.offsets].sort((a, b) => a - b);
      const first = letterRefs.current.get(
        letterKey(anchor.token, offsets[0]!)
      );
      const last = letterRefs.current.get(
        letterKey(anchor.token, offsets[offsets.length - 1]!)
      );
      if (!first || !last) return undefined;
      const head = first.getBoundingClientRect();
      const tail = last.getBoundingClientRect();
      return {
        x: (head.left + tail.right) / 2 - base.left,
        tipY: Math.min(head.top, tail.top) - base.top
      };
    };

    const style = getComputedStyle(container);
    const innerLeft = Number.parseFloat(style.paddingLeft);
    const innerRight = base.width - Number.parseFloat(style.paddingRight);

    const next: ArcGeometry[] = [];
    marks.liaisons.forEach((link, index) => {
      const left = geometryOf(link.start);
      const right = geometryOf(link.end);
      if (!left || !right) return;

      if (left.tipY === right.tipY && right.x > left.x) {
        next.push({
          key: `${index}`,
          index,
          d: liaisonPath(left, right, fontSize)
        });
        return;
      }

      /*
       * 两端落在不同行：像乐谱里跨行的连音线那样断成两截，各自延到行边缘。
       * 换行纯粹是排版结果（同样两个词换个宽度就同行了），标注本身合法，
       * 不能因为画不出一条完整弧就整条不画——那会留下「统计里有、屏幕上没有」
       * 的隐形状态，既看不见也点不掉。
       */
      next.push({
        key: `${index}-head`,
        index,
        d: liaisonPath(left, { x: innerRight, tipY: left.tipY }, fontSize)
      });
      next.push({
        key: `${index}-tail`,
        index,
        d: liaisonPath({ x: innerLeft, tipY: right.tipY }, right, fontSize)
      });
    });
    setArcs(next);
  }, [marks.liaisons]);

  useLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    // 换行、容器宽度变化都会挪动字母，弧线必须跟着重算。
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
    // target 也要进依赖：切画笔会改词的渲染方式，字母随之横向位移，
    // 而容器宽度不变、ResizeObserver 不会触发，弧线不重算就会错位。
  }, [measure, target, text]);

  const strokeWidth = liaisonStrokeWidth(
    containerRef.current
      ? Number.parseFloat(getComputedStyle(containerRef.current).fontSize)
      : 20
  );

  /*
   * 落笔用 mousedown + preventDefault，不用 click：click 之前浏览器已经把光标
   * 挪到点击处、还可能起一段选区，等到 click 再拦就晚了。
   */
  const paint = (run: () => void) => (event: ReactMouseEvent) => {
    if (!painting) return;
    event.preventDefault();
    run();
  };

  return (
    <div className="tsz-ve-canvas" data-target={target}>
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
        <svg className="tsz-ve-arc-layer" aria-hidden focusable="false">
          {arcs.map((arc) => (
            <g key={arc.key}>
              {target === "letter" && (
                <path
                  className="tsz-ve-arc-hit"
                  d={arc.d}
                  strokeWidth={Math.max(strokeWidth * 3, 12)}
                  onMouseDown={paint(() => onLiaisonClick(arc.index))}
                />
              )}
              <path
                className="tsz-ve-arc"
                d={arc.d}
                strokeWidth={strokeWidth}
              />
            </g>
          ))}
        </svg>

        {/*
         * 词与词之间渲染的是**真正的空格字符**，不是一个占位方块：下层要和
         * textarea 逐字对齐，少一个空格整行就错开一个字宽。
         */}
        {leadingSpace(text, tokens)}
        {tokens.map((token, position) => {
          const role = marks.roles[token.index];
          const roleLabel = role ? ROLE_LABELS.get(role) : undefined;
          const hasNext = position < tokens.length - 1;
          const pause = marks.pauses[position];
          // 按字素簇渲染，不按码点：否则组合字符与 emoji 会被拆开、整行错位。
          const letters = graphemes(token.text);
          const roleClass = role ? ` is-${role}` : "";

          return (
            <Fragment key={token.index}>
              {target === "letter" ? (
                // 连读模式：每个字母各自可点，词本身退为容器。
                <span className={`tsz-ve-token is-letters${roleClass}`}>
                  {letters.map(({ text: letter, offset }) => {
                    // 注意与外层的 role（词的语法分类）区分：这里是草稿的端别。
                    const anchorRole = draftRole(draft, token.index, offset);
                    return (
                      <span
                        key={offset}
                        ref={registerLetter(letterKey(token.index, offset))}
                        className={`tsz-ve-letter${anchorRole ? ` is-anchor-${anchorRole}` : ""}`}
                        role="button"
                        aria-label={`${token.text} 的第 ${offset + 1} 个字母 ${letter}`}
                        aria-pressed={Boolean(anchorRole)}
                        onMouseDown={paint(() =>
                          onLetterClick({
                            token: token.index,
                            offsets: [offset]
                          })
                        )}
                      >
                        {letter}
                      </span>
                    );
                  })}
                </span>
              ) : (
                <span
                  className={`tsz-ve-token${roleClass}`}
                  role="button"
                  aria-label={
                    roleLabel ? `${token.text}（${roleLabel}）` : token.text
                  }
                  aria-pressed={Boolean(role)}
                  aria-disabled={target !== "word"}
                  onMouseDown={paint(() => {
                    if (target === "word") onWordClick(token.index);
                  })}
                >
                  {letters.map(({ text: letter, offset }) => (
                    <span
                      key={offset}
                      ref={registerLetter(letterKey(token.index, offset))}
                    >
                      {letter}
                    </span>
                  ))}
                </span>
              )}

              {hasNext && (
                <span
                  className={`tsz-ve-gap${pause === undefined ? "" : " has-pause"}`}
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
        readOnly={readOnly}
        spellCheck={false}
        placeholder={
          inputPlaceholder ?? "在这里直接输入英文，然后用上面的工具在字上标注"
        }
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
