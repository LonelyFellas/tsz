import { useVoiceEditorTranslation } from "../i18n";
import { EraserIcon, Redo2Icon, Undo2Icon } from "lucide-react";
import { Button } from "@tsz/ui/admin/display";
import { Tooltip } from "@tsz/ui/admin/overlays";
import { useId, useState, type ReactNode } from "react";
import { AnnotationStrip, type AnnotationStripProps } from "./AnnotationStrip";
import type { VoiceEditorProps } from "../../types";
import type { Brush } from "./roles";
import type { LiaisonAnchor, LiaisonDraft, MarkState } from "./tokens";
import { SelectionPanel } from "./SelectionPanel";
import { ShortcutHint } from "./ShortcutHint";

const FORMAT_SHORTCUTS: Record<string, string> = {
  bold: "B",
  italic: "I",
  underline: "U"
};

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
  disabledReason?: string;
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
  mode: VoiceEditorProps["mode"];

  selectionText?: string;
  text: string;
  marks: MarkState;
  brush: Brush;
  draft: LiaisonDraft;
  readOnly?: boolean;
  contentReadOnly?: boolean;
  onRoleRange: (start: number, end: number, mode: "click" | "drag") => void;
  roleAnchorStart?: number;
  onGapClick: (gapIndex: number) => void;
  onLetterClick: (anchor: LiaisonAnchor) => void;
  onLiaisonClick: (index: number) => void;
  onClearAll: () => void;
  inputLabel: string;
  inputDataAttributes?: Record<string, string>;
  inputPlaceholder?: string;
  onTextChange: AnnotationStripProps["onTextChange"];
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
  mode,

  selectionText,
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
  contentReadOnly,
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
  const { t } = useVoiceEditorTranslation();
  const grammarMode = mode === "grammar";
  const associationMode = mode === "association";
  const composedMode = grammarMode || associationMode;
  const selectionMode =
    grammarMode ||
    associationMode ||
    mode === "spelling" ||
    mode === "spelling-settings" ||
    mode === "actual-pron" ||
    mode === "phoneme-settings" ||
    mode === "voice-trial";
  const selectionToolsLabel = grammarMode
    ? t("grammar_structures_and_liaison_marks")
    : associationMode
      ? t("text_formatting_and_liaison_marks")
      : mode === "spelling"
        ? t("italics_and_liaison_marks")
        : mode === "voice-trial"
          ? t("phonemes_linked_readings_or_special_readings")
          : t("liaison_marks");
  const [voicesExpanded, setVoicesExpanded] = useState(true);
  const voicesPanelId = useId();
  const headerTools = selectionMode
    ? tools.filter(
        (tool) =>
          tool.key === "text" ||
          tool.key === "bold" ||
          tool.key === "italic" ||
          tool.key === "underline" ||
          tool.key === "phoneme" ||
          (mode === "voice-trial" && tool.key === "pause") ||
          tool.key === "reading" ||
          tool.key === "reading-link" ||
          tool.key.startsWith("association-")
      )
    : [];
  const formatOrder =
    mode === "voice-trial"
      ? ["phoneme", "reading-link", "reading", "pause"]
      : [
          "text",
          "bold",
          "italic",
          "underline",
          "reading",
          "reading-link",
          "association-word",
          "association-phrase"
        ];
  headerTools.sort(
    (left, right) =>
      formatOrder.indexOf(left.key) - formatOrder.indexOf(right.key)
  );
  const topTools = tools.filter(
    (tool) => tool.key === "roles" || tool.key === "liaison"
  );
  const bottomTools = tools.filter(
    (tool) =>
      (tool.key === "pause" && mode !== "voice-trial") || tool.key === "voices"
  );
  const uploadTool = selectionMode
    ? tools.find((tool) => tool.key === "uploads")
    : undefined;
  const secondaryTools = tools.filter(
    (tool) =>
      tool.key !== "erase" &&
      tool !== uploadTool &&
      !headerTools.includes(tool) &&
      !topTools.includes(tool) &&
      !bottomTools.includes(tool)
  );
  const eraseTool = tools.find((tool) => tool.key === "erase");
  const marked =
    marks.roles.length +
    marks.liaisons.length +
    marks.passthrough.filter(
      (annotation) =>
        annotation.type === "italic" ||
        annotation.type === "bold" ||
        annotation.type === "underline" ||
        (mode === "voice-trial" &&
          ["phoneme", "say_as", "sub"].includes(annotation.type))
    ).length +
    Object.keys(marks.pauses).length +
    (mode === "voice-trial" ? (linkedRanges?.length ?? 0) : 0);
  const trigger = (tool: DropdownTool, inline: boolean) => {
    const isVoices = inline && tool.key === "voices";
    const button = (
      <Button
        size="small"
        className={`tsz-ve-tool-toggle ${tool.icon ? "tsz-ve-icon-tool" : ""} ${tool.className ?? ""}`}
        aria-label={tool.ariaLabel ?? tool.label}
        aria-pressed={
          isVoices ? undefined : (tool.active ?? openTool === tool.key)
        }
        aria-expanded={
          isVoices
            ? voicesExpanded
            : tool.content
              ? inline || openTool === tool.key
              : undefined
        }
        aria-controls={isVoices ? voicesPanelId : undefined}
        disabled={readOnly || tool.disabled}
        onMouseDown={
          inline ||
          tool.key === "italic" ||
          tool.key === "bold" ||
          tool.key === "underline"
            ? (event) => event.preventDefault()
            : undefined
        }
        onClick={() => {
          if (isVoices) {
            setVoicesExpanded((expanded) => !expanded);
            return;
          }
          onOpenToolChange(
            openTool === tool.key && !inline ? undefined : tool.key
          );
        }}
      >
        {tool.icon}
        <span className="tsz-ve-tool-label">{tool.label}</span>
        {tool.summary !== undefined && (
          <span className="tsz-ve-tool-summary">{tool.summary}</span>
        )}
      </Button>
    );
    const shortcut = FORMAT_SHORTCUTS[tool.key];
    const hint =
      tool.disabledReason ??
      (shortcut ? <ShortcutHint shortcut={shortcut} /> : undefined);
    return hint ? <Tooltip title={hint}>{button}</Tooltip> : button;
  };
  const renderTool = (tool: DropdownTool) =>
    tool.content ? (
      <SelectionPanel
        key={tool.key}
        open={openTool === tool.key}
        onDismiss={
          tool.stayOpen ? undefined : () => onOpenToolChange(undefined)
        }
        placement={
          tool.placement === "bottomLeft" ? "bottom-start" : "top-start"
        }
        content={tool.content}
      >
        {trigger(tool, false)}
      </SelectionPanel>
    ) : (
      <span key={tool.key}>{trigger(tool, false)}</span>
    );
  return (
    <div className="tsz-ve-markup">
      <div
        className={`tsz-ve-top-tools${selectionMode ? " is-selection" : ""}`}

        role="toolbar"
        aria-label={t("annotation_toolbar")}
      >
        {headerTools.length > 0 && (
          <div className="tsz-ve-primary-tools">
            {headerTools.map(renderTool)}
          </div>
        )}
        <div className="tsz-ve-toolbar-actions">
          <Tooltip
            title={
              <>
                <span>{t("undo")}</span>
                <ShortcutHint shortcut="Z" />
              </>
            }
          >
            <Button
              size="small"
              type="text"
              className="tsz-ve-icon-button"
              aria-label={t("previous_step")}
              disabled={readOnly || !canUndo}
              onClick={onUndo}
              icon={<Undo2Icon />}
            />
          </Tooltip>
          <Tooltip title={t("redo")}>
            <Button
              size="small"
              type="text"
              className="tsz-ve-icon-button"
              aria-label={t("next_step")}
              disabled={readOnly || !canRedo}
              onClick={onRedo}
              icon={<Redo2Icon />}
            />
          </Tooltip>
          <Tooltip title={t("clear_annotations")}>
            <Button
              size="small"
              type="text"
              className="tsz-ve-icon-button"
              aria-label={t("clear_annotations")}
              disabled={readOnly || marked === 0}
              onClick={onClearAll}
              icon={<EraserIcon />}
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
        {eraseTool && (
          <div className="tsz-ve-erase-action">
            <Tooltip
              title={
                composedMode || mode === "spelling"
                  ? t(
                      "enable_to_remove_existing_liaison_marks_or_pauses_by_clicking_them_click_ag"
                    )
                  : t(
                      "enable_to_remove_existing_liaison_marks_by_clicking_them_click_again_to_exi"
                    )
              }
            >
              {trigger(eraseTool, false)}
            </Tooltip>
          </div>
        )}
        {selectionMode &&
          mode !== "spelling-settings" &&
          (mode !== "voice-trial" ||
            tools.some((tool) => !tool.disabledReason)) && (
            <div className="tsz-ve-selection-status" role="status">
              {contentReadOnly ? (
                t(
                  "text_is_read_only_select_words_or_phrases_to_edit_their_links"
                )
              ) : brush.kind === "erase" ? (
                composedMode || mode === "spelling" ? (
                  t(
                    "clear_mode_click_existing_liaison_marks_or_pauses_to_remove_them"
                  )
                ) : (
                  t("clear_mode_click_existing_liaison_marks_to_remove_them")
                )
              ) : mode === "voice-trial" ? (
                selectionText ? (
                  <>
                    {t("selected_2")} <strong>{selectionText}</strong>
                  </>
                ) : (
                  t("select_text_to_set_its_reading")
                )
              ) : selectionText ? (
                <>
                  {t("selected_3")} <strong>{selectionText}</strong>
                  {t("selection_tools_suffix", { tools: selectionToolsLabel })}
                </>
              ) : (
                t("select_text_to_configure", { p0: selectionToolsLabel })
              )}
            </div>
          )}
        {topTools.length === 0 &&
          !contentReadOnly &&
          mode !== "spelling-settings" &&
          mode !== "voice-trial" && (
            <div className="tsz-ve-top-hint">
              {mode === "phoneme-settings"
                ? t(
                    "select_gaps_in_the_form_spelling_to_add_pauses_edit_phoneme_text_in_the_ext"
                  )
                : t(
                    "edit_text_directly_place_the_cursor_between_words_to_insert_a_pause"
                  )}
            </div>
          )}
      </div>
      <div className="tsz-ve-editing-area">
        <AnnotationStrip
          showSpeechMarks={mode === "voice-trial"}
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
        {actions && <div className="tsz-ve-editor-actions">{actions}</div>}
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
              {tool.key === "voices" && uploadTool && renderTool(uploadTool)}
              <div
                className="tsz-ve-tool-content"
                id={tool.key === "voices" ? voicesPanelId : undefined}
                hidden={tool.key === "voices" && !voicesExpanded}
              >
                {tool.content}
              </div>
            </div>
          ))}
        </div>
      )}
      {secondaryTools.length > 0 && (
        <div className="tsz-ve-footer">
          {secondaryTools.length > 0 && (
            <div className="tsz-ve-secondary-tools">
              {secondaryTools.map(renderTool)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
