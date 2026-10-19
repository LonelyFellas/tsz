import type { VoiceRichTextFieldProps } from "../types";
import { RichTextReadOnly } from "./RichTextReadOnly";

export function VoiceRichTextField({
  value,
  contextLabel,
  dialectLabel,
  readOnly,
  onEdit
}: VoiceRichTextFieldProps) {
  return (
    <div className="tsz-ve-field" data-testid="voice-rich-text-field">
      <div className="tsz-ve-field-heading">
        <div className="tsz-ve-field-labels">
          {contextLabel && <strong>{contextLabel}</strong>}
          {dialectLabel && (
            <span className="tsz-ve-field-dialect">{dialectLabel}</span>
          )}
        </div>
        {!readOnly && onEdit && (
          <button className="tsz-ve-field-edit" type="button" onClick={onEdit}>
            语音编辑
          </button>
        )}
      </div>
      <div className="tsz-ve-field-content">
        <RichTextReadOnly value={value} />
      </div>
    </div>
  );
}
