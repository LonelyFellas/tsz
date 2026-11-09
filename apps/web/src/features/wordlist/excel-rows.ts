import { webWordlistExcel } from "@/i18n/messages/wordlist/excel";
import { localText, type LocalText } from "@/i18n/catalog";
export const MAX_IMPORT_ROWS = 10000;
export const MAX_EXCEL_BYTES = 10 * 1024 * 1024;
export type ImportField = "word" | "gloss" | "note";
export type ExcelRow = {
  rowNumber: number;
  word: string;
  gloss: string;
  note: string;
  invalidFields: Partial<Record<ImportField, LocalText>>;
};
export function validateExcelRow(row: ExcelRow) {
  const errors = { ...row.invalidFields };
  if (!row.word.trim())
    errors.word = localText(
      webWordlistExcel,
      "webWordlistExcel:entry_name_is_required"
    );
  else if ([...row.word].length > 200)
    errors.word = localText(
      webWordlistExcel,
      "webWordlistExcel:entry_names_must_not_exceed_200_characters"
    );
  else if (
    [...row.word].some(
      (char) =>
        char.codePointAt(0)! < 32 ||
        (char.codePointAt(0)! >= 127 && char.codePointAt(0)! <= 159)
    )
  )
    errors.word = localText(
      webWordlistExcel,
      "webWordlistExcel:entry_names_cannot_contain_control_characters"
    );
  if ([...row.gloss].length > 200)
    errors.gloss = localText(
      webWordlistExcel,
      "webWordlistExcel:definitions_must_not_exceed_200_characters"
    );
  if ([...row.note].length > 1000)
    errors.note = localText(
      webWordlistExcel,
      "webWordlistExcel:notes_must_not_exceed_1_000_characters_2"
    );
  return errors;
}
