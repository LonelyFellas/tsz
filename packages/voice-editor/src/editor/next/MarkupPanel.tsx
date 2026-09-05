import { ClearOutlined, RedoOutlined, UndoOutlined } from "@ant-design/icons";
import { Button, Popover, Tooltip } from "antd";
import type { ReactNode } from "react";
import { AnnotationStrip } from "./AnnotationStrip";
import type { Brush } from "./roles";
import type { LiaisonAnchor, LiaisonDraft, MarkState } from "./tokens";

/**
 * 工具栏上的一个下拉工具：按钮显示名字与当前值，点开是它自己的面板。
 *
 * 六个工具（语法结构 / 连读 / 停顿 / 音色 / 语速 / 音频）走同一套形态，
 * 工具栏因此是恒定宽度的一排——之前「用到哪个就地展开哪个」会在切笔时
 * 改变整条工具栏的宽度，标注带跟着重排，连读弧的测量也会撞上动画中途。
 */
export interface DropdownTool {
  key: string;
  label: string;
  /** 按钮上的当前值（当前时长、已启用音色数…），让工具栏顺带成为状态条。 */
  summary?: string;
  icon?: ReactNode;
  /** 没有面板的工具（如「文本」）不传，渲染成一枚普通开关按钮。 */
  content?: ReactNode;
  /** 触发按钮的附加类名，用于语法结构那枚按钮取当前分类的颜色。 */
  className?: string;
  /**
   * 可及名。语法结构那枚按钮上写的是当前分类（「核心词」），单看说不出它是
   * 干什么的，所以可及名另给一份完整的。
   */
  ariaLabel?: string;
  /**
   * 浮层开在按钮下方还是上方。默认下方；连读必须用 "topLeft"，因为选锚点
   * 要在下面的文字上点字母，开在下方会把标注带盖住。
   */
  placement?: "bottomLeft" | "topLeft";
  /**
   * 是否处于「使用中」。三支笔传的是「这支笔当前 armed」而非「浮层开着」——
   * 选完分类浮层就收起，若拿开合当状态，落笔时工具栏反而不指示用的是哪支笔。
   * 不传则退化为「浮层开着」，用于音色/语速/音频这三个非画笔工具。
   */
  active?: boolean;
  /** 这枚工具之前插一条竖分隔线。 */
  dividerBefore?: boolean;
  /**
   * 浮层不随外部点击关闭，只由再次点按钮来开关。连读要用：选锚点得点标注带上
   * 的字母，那属于「外部点击」，默认行为会把面板关掉，选完就够不着「添加」。
   */
  stayOpen?: boolean;
}

export interface MarkupPanelProps {
  text: string;
  marks: MarkState;
  brush: Brush;
  draft: LiaisonDraft;
  readOnly?: boolean;
  onWordClick: (tokenIndex: number) => void;
  onGapClick: (gapIndex: number) => void;
  onLetterClick: (anchor: LiaisonAnchor) => void;
  onLiaisonClick: (index: number) => void;
  onClearAll: () => void;
  /** 文本框的无障碍名。 */
  inputLabel: string;
  inputDataAttributes?: Record<string, string>;
  inputPlaceholder?: string;
  onTextChange: (value: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  tools: DropdownTool[];
  openTool?: string;
  onOpenToolChange: (key?: string) => void;
}

/**
 * 标注区：语法结构、连读、停顿共用一块画布。
 *
 * 三类标注作用于不同靶子（词 / 字母 / 词缝），由当前画笔决定这一刻哪一类可点，
 * 另外两类不给悬停反馈——既留在一屏内顺手切换，又不会点了没反应。
 */
export function MarkupPanel({
  text,
  marks,
  brush,
  draft,
  readOnly,
  onWordClick,
  onGapClick,
  onLetterClick,
  onLiaisonClick,
  onClearAll,
  inputLabel,
  inputDataAttributes,
  inputPlaceholder,
  onTextChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  tools,
  openTool,
  onOpenToolChange
}: MarkupPanelProps) {
  const marked =
    Object.keys(marks.roles).length +
    marks.liaisons.length +
    Object.keys(marks.pauses).length;

  return (
    <div className="tsz-ve-markup">
      {/*
       * 工具栏贴在编辑区顶部、与之连成一体（工具栏无下边框、标注带无上边框），
       * 与富文本编辑器的头部同构：一条横排、按功能分组、组间用竖线隔开。
       */}
      <div className="tsz-ve-toolbar" role="toolbar" aria-label="标注工具栏">
        {tools.map((tool) => (
          <span key={tool.key} className="tsz-ve-toolbar-slot">
            {tool.dividerBefore && (
              <span className="tsz-ve-toolbar-divider" aria-hidden />
            )}
            {tool.content === undefined ? (
              <Button
                size="small"
                className={`tsz-ve-tool-toggle ${tool.className ?? ""}`}
                aria-label={tool.ariaLabel ?? tool.label}
                aria-pressed={tool.active ?? false}
                disabled={readOnly}
                onClick={() => onOpenToolChange(tool.key)}
              >
                {tool.icon}
                {tool.label}
              </Button>
            ) : (
              <Popover
                open={openTool === tool.key}
                onOpenChange={
                  tool.stayOpen
                    ? undefined
                    : (next) => onOpenToolChange(next ? tool.key : undefined)
                }
                trigger={tool.stayOpen ? [] : "click"}
                placement={tool.placement ?? "bottomLeft"}
                overlayClassName="tsz-ve-pop-overlay"
                content={tool.content}
              >
                <Button
                  size="small"
                  className={`tsz-ve-tool-toggle ${tool.className ?? ""}`}
                  aria-label={tool.ariaLabel ?? tool.label}
                  aria-pressed={tool.active ?? openTool === tool.key}
                  aria-expanded={openTool === tool.key}
                  disabled={readOnly}
                  onClick={
                    tool.stayOpen
                      ? () =>
                          onOpenToolChange(
                            openTool === tool.key ? undefined : tool.key
                          )
                      : undefined
                  }
                >
                  {tool.icon}
                  {tool.label}
                  {tool.summary !== undefined && (
                    <span className="tsz-ve-tool-summary">{tool.summary}</span>
                  )}
                </Button>
              </Popover>
            )}
          </span>
        ))}

        <span className="tsz-ve-toolbar-divider" aria-hidden />

        <Tooltip title="上一步">
          <Button
            size="small"
            type="text"
            className="tsz-ve-icon-button"
            aria-label="上一步"
            disabled={readOnly || !canUndo}
            onClick={onUndo}
          >
            <UndoOutlined />
          </Button>
        </Tooltip>
        <Tooltip title="下一步">
          <Button
            size="small"
            type="text"
            className="tsz-ve-icon-button"
            aria-label="下一步"
            disabled={readOnly || !canRedo}
            onClick={onRedo}
          >
            <RedoOutlined />
          </Button>
        </Tooltip>
        <Tooltip title="清空标注">
          <Button
            size="small"
            type="text"
            className="tsz-ve-icon-button"
            aria-label="清空标注"
            disabled={readOnly || marked === 0}
            onClick={onClearAll}
          >
            <ClearOutlined />
          </Button>
        </Tooltip>
      </div>

      <AnnotationStrip
        inputLabel={inputLabel}
        inputDataAttributes={inputDataAttributes}
        inputPlaceholder={inputPlaceholder}
        onTextChange={onTextChange}
        text={text}
        marks={marks}
        brush={brush}
        draft={draft}
        readOnly={readOnly}
        onWordClick={onWordClick}
        onGapClick={onGapClick}
        onLetterClick={onLetterClick}
        onLiaisonClick={onLiaisonClick}
      />
    </div>
  );
}
