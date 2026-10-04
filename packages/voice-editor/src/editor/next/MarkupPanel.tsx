import { ClearOutlined, RedoOutlined, UndoOutlined } from "@ant-design/icons";
import { Button, Popover, Tooltip } from "antd";
import type { ReactNode } from "react";
import { AnnotationStrip, type AnnotationStripProps } from "./AnnotationStrip";
import type { Brush } from "./roles";
import type { LiaisonAnchor, LiaisonDraft, MarkState } from "./tokens";

export interface DropdownTool {
  key: string;
  label: string;
  summary?: string;
  icon?: ReactNode;
  content?: ReactNode;
  className?: string;
  ariaLabel?: string;
  placement?: "bottomLeft" | "topLeft";
  active?: boolean;
  disabled?: boolean;
  stayOpen?: boolean;
}

export interface MarkupPanelProps extends Pick<
  AnnotationStripProps,
  | "associationContent"
  | "associationAnchor"
  | "selectedLinkRanges"
  | "linkedRanges"
  | "onWordRange"
  | "textReadOnly"
  | "onTextSelection"
  | "onCaretChange"
  | "onInspectPause"
  | "selectedPauseGap"
> {
  text: string;
  marks: MarkState;
  brush: Brush;
  draft: LiaisonDraft;
  readOnly?: boolean;
  onRoleRange: (start: number, end: number, mode: "click" | "drag") => void;
  roleAnchorStart?: number;
  onGapClick: (gapIndex: number) => void;
  onLetterClick: (anchor: LiaisonAnchor) => void;
  onLiaisonClick: (index: number) => void;
  onClearAll: () => void;
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
  actions?: ReactNode;
  onOpenToolChange: (key?: string) => void;
}

export function MarkupPanel({
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
  onRoleRange,
  onTextSelection,
  onCaretChange,
  onInspectPause,
  selectedPauseGap,
  roleAnchorStart,
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
  actions,
  onOpenToolChange
}: MarkupPanelProps) {
  const topTools = tools.filter(
    (tool) => tool.key === "roles" || tool.key === "liaison"
  );
  const bottomTools = tools.filter(
    (tool) => tool.key === "pause" || tool.key === "voices"
  );
  const secondaryTools = tools.filter(
    (tool) => !topTools.includes(tool) && !bottomTools.includes(tool)
  );
  const marked =
    marks.roles.length +
    marks.liaisons.length +
    Object.keys(marks.pauses).length;
  const trigger = (tool: DropdownTool, inline: boolean) => (
    <Button
      size="small"
      className={`tsz-ve-tool-toggle ${tool.icon ? "tsz-ve-icon-tool" : ""} ${tool.className ?? ""}`}
      aria-label={tool.ariaLabel ?? tool.label}
      aria-pressed={tool.active ?? openTool === tool.key}
      aria-expanded={tool.content ? inline || openTool === tool.key : undefined}
      disabled={readOnly || tool.disabled}
      onMouseDown={inline ? (event) => event.preventDefault() : undefined}
      onClick={() =>
        onOpenToolChange(
          openTool === tool.key && !inline ? undefined : tool.key
        )
      }
    >
      {tool.icon}
      <span className="tsz-ve-tool-label">{tool.label}</span>
      {tool.summary !== undefined && (
        <span className="tsz-ve-tool-summary">{tool.summary}</span>
      )}
    </Button>
  );
  return (
    <div className="tsz-ve-markup">
      <div className="tsz-ve-top-tools" role="toolbar" aria-label="标注工具栏">
        <div className="tsz-ve-toolbar-actions">
          <Tooltip title="撤销">
            <Button
              size="small"
              type="text"
              className="tsz-ve-icon-button"
              aria-label="上一步"
              disabled={readOnly || !canUndo}
              onClick={onUndo}
              icon={<UndoOutlined />}
            />
          </Tooltip>
          <Tooltip title="重做">
            <Button
              size="small"
              type="text"
              className="tsz-ve-icon-button"
              aria-label="下一步"
              disabled={readOnly || !canRedo}
              onClick={onRedo}
              icon={<RedoOutlined />}
            />
          </Tooltip>
          <Tooltip title="清空标注">
            <Button
              size="small"
              type="text"
              className="tsz-ve-icon-button"
              aria-label="清空标注"
              disabled={readOnly || marked === 0}
              onClick={onClearAll}
              icon={<ClearOutlined />}
            />
          </Tooltip>
        </div>
        {topTools.map((tool) => (
          <div key={tool.key} className="tsz-ve-tool-row" data-tool={tool.key}>
            {trigger(tool, true)}
            <span className="tsz-ve-toolbar-divider" aria-hidden />
            <div className="tsz-ve-tool-content">{tool.content}</div>
          </div>
        ))}
        {topTools.length === 0 && (
          <div className="tsz-ve-top-hint">
            直接编辑正文；光标停在词间可插入停顿
          </div>
        )}
      </div>
      <div className="tsz-ve-editing-area">
        <AnnotationStrip
          associationContent={associationContent}
          associationAnchor={associationAnchor}
          selectedLinkRanges={selectedLinkRanges}
          linkedRanges={linkedRanges}
          onWordRange={onWordRange}
          inputLabel={inputLabel}
          inputDataAttributes={inputDataAttributes}
          inputPlaceholder={inputPlaceholder}
          onTextChange={onTextChange}
          text={text}
          marks={marks}
          brush={brush}
          draft={draft}
          readOnly={readOnly}
          textReadOnly={textReadOnly}
          onRoleRange={onRoleRange}
          onTextSelection={onTextSelection}
          onCaretChange={onCaretChange}
          onInspectPause={onInspectPause}
          pausePlacement={openTool === "pause" && brush.kind === "none"}
          selectedPauseGap={selectedPauseGap}
          roleAnchorStart={roleAnchorStart}
          onGapClick={onGapClick}
          onLetterClick={onLetterClick}
          onLiaisonClick={onLiaisonClick}
        />
      </div>
      {bottomTools.length > 0 && (
        <div className="tsz-ve-bottom-tools">
          {bottomTools.map((tool) => (
            <div
              key={tool.key}
              className="tsz-ve-tool-row"
              data-tool={tool.key}
            >
              {trigger(tool, true)}
              <span className="tsz-ve-toolbar-divider" aria-hidden />
              <div className="tsz-ve-tool-content">{tool.content}</div>
            </div>
          ))}
        </div>
      )}
      {(secondaryTools.length > 0 || actions) && (
        <div className="tsz-ve-footer">
          {secondaryTools.length > 0 && (
            <div className="tsz-ve-secondary-tools">
              {secondaryTools.map((tool) =>
                tool.content ? (
                  <Popover
                    key={tool.key}
                    open={openTool === tool.key}
                    onOpenChange={
                      tool.stayOpen
                        ? undefined
                        : (next) =>
                            onOpenToolChange(next ? tool.key : undefined)
                    }
                    trigger={tool.stayOpen ? [] : "click"}
                    placement={tool.placement ?? "topLeft"}
                    overlayClassName="tsz-ve-pop-overlay"
                    content={tool.content}
                  >
                    {trigger(tool, false)}
                  </Popover>
                ) : (
                  <span key={tool.key}>{trigger(tool, false)}</span>
                )
              )}
            </div>
          )}
          {actions && <div className="tsz-ve-editor-actions">{actions}</div>}
        </div>
      )}
    </div>
  );
}
