export const MAX_IMPORT_ROWS = 10000;
export const MAX_EXCEL_BYTES = 10 * 1024 * 1024;
export type ImportField = "word" | "gloss" | "note";
export type ExcelRow = {
  rowNumber: number;
  word: string;
  gloss: string;
  note: string;
  invalidFields: Partial<Record<ImportField, string>>;
};
export const importFieldLabels = { word: "词汇", gloss: "释义", note: "注释" };

export function validateExcelRow(row: ExcelRow) {
  const errors = { ...row.invalidFields };
  if (!row.word.trim()) errors.word = "词汇不能为空";
  else if ([...row.word].length > 200) errors.word = "词汇不能超过 200 字";
  else if (
    [...row.word].some(
      (char) =>
        char.codePointAt(0)! < 32 ||
        (char.codePointAt(0)! >= 127 && char.codePointAt(0)! <= 159)
    )
  )
    errors.word = "词汇不能包含控制字符";
  if ([...row.gloss].length > 200) errors.gloss = "释义不能超过 200 字";
  if ([...row.note].length > 1000) errors.note = "注释不能超过 1000 字";
  return errors;
}
