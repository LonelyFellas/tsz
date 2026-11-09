import { webWordlistExcel } from "@/i18n/messages/wordlist/excel";
import { localText, LocalWebError } from "@/i18n/catalog";

import { read, utils, write } from "xlsx";

import { MAX_IMPORT_ROWS, MAX_EXCEL_BYTES, type ExcelRow } from "./excel-rows";

// Check the ZIP directory before expanding XLSX contents. Reject ZIP64 and
// excessive expanded sizes; the worker also has a time limit and can be cancelled.
function checkXlsxSize(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = data.length - 22;
  for (; end >= Math.max(0, data.length - 65557); end--)
    if (view.getUint32(end, true) === 0x06054b50) break;
  if (end < Math.max(0, data.length - 65557))
    throw new LocalWebError(
      localText(webWordlistExcel, "webWordlistExcel:the_excel_file_is_damaged")
    );
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count > 1000)
    throw new LocalWebError(
      localText(
        webWordlistExcel,
        "webWordlistExcel:too_much_content_use_the_template_to_reorganise_the_file"
      )
    );
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (
      offset + 46 > data.length ||
      view.getUint32(offset, true) !== 0x02014b50
    )
      throw new LocalWebError(
        localText(
          webWordlistExcel,
          "webWordlistExcel:the_excel_file_is_damaged"
        )
      );
    total += view.getUint32(offset + 24, true);
    if (total > 50 * 1024 * 1024)
      throw new LocalWebError(
        localText(
          webWordlistExcel,
          "webWordlistExcel:the_expanded_file_is_too_large_split_it_before_importing"
        )
      );
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
}

export function parseExcel(buffer: ArrayBuffer, fileName: string): ExcelRow[] {
  if (!/\.(xlsx|xls)$/i.test(fileName))
    throw new LocalWebError(
      localText(webWordlistExcel, "webWordlistExcel:choose_an_xls_or_xlsx_file")
    );
  if (!buffer.byteLength || buffer.byteLength > MAX_EXCEL_BYTES)
    throw new LocalWebError(
      localText(
        webWordlistExcel,
        "webWordlistExcel:the_file_must_be_larger_than_0_and_no_more_than_10_mb"
      )
    );
  const data = new Uint8Array(buffer);
  const isZip = data[0] === 0x50 && data[1] === 0x4b;
  const isOle = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
    (byte, i) => data[i] === byte
  );
  if (/\.xlsx$/i.test(fileName) ? !isZip : !isOle)
    throw new LocalWebError(
      localText(
        webWordlistExcel,
        "webWordlistExcel:file_content_does_not_match_its_extension_save_it_as_an_excel_file"
      )
    );
  if (isZip) checkXlsxSize(data);
  let workbook;
  try {
    workbook = read(data, {
      type: "array",
      sheetRows: MAX_IMPORT_ROWS + 2,
      cellFormula: true,
      cellText: false,
      cellHTML: false,
      bookVBA: false
    });
  } catch {
    throw new LocalWebError(
      localText(
        webWordlistExcel,
        "webWordlistExcel:cannot_read_the_file_check_whether_it_is_damaged_or_encrypted"
      )
    );
  }
  if (workbook.SheetNames.length !== 1)
    throw new LocalWebError(
      localText(
        webWordlistExcel,
        "webWordlistExcel:keep_one_worksheet_and_import_again"
      )
    );
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
  if (sheet["!merges"]?.length)
    throw new LocalWebError(
      localText(
        webWordlistExcel,
        "webWordlistExcel:unmerge_cells_and_import_again"
      )
    );
  const range = utils.decode_range(sheet["!fullref"] ?? sheet["!ref"] ?? "A1");
  if (range.e.r > MAX_IMPORT_ROWS)
    throw new LocalWebError(
      localText(
        webWordlistExcel,
        "webWordlistExcel:import_at_most_10_000_rows_at_a_time_excluding_the_header"
      )
    );
  if (range.e.c > 2)
    throw new LocalWebError(
      localText(
        webWordlistExcel,
        "webWordlistExcel:only_columns_are_supported_use_the_template"
      )
    );
  for (const [column, label] of ["词条名称", "释义", "注释"].entries()) {
    const cell = sheet[utils.encode_cell({ r: 0, c: column })];
    if (
      cell?.f ||
      cell?.F ||
      cell?.t !== "s" ||
      (String(cell.v).trim() !== label &&
        !(column === 0 && String(cell.v).trim() === "词汇"))
    )
      throw new LocalWebError(
        localText(
          webWordlistExcel,
          "webWordlistExcel:the_first_row_headers_must_be_in_that_order"
        )
      );
  }
  const rows: ExcelRow[] = [];
  for (let r = 1; r <= range.e.r; r++) {
    const cells = [0, 1, 2].map((c) => sheet[utils.encode_cell({ r, c })]);
    if (
      cells.every(
        (cell) => !cell?.f && !cell?.F && (cell?.v == null || cell.v === "")
      )
    )
      continue;
    const row: ExcelRow = {
      rowNumber: r + 1,
      word: "",
      gloss: "",
      note: "",
      invalidFields: {}
    };
    for (const [c, field] of (["word", "gloss", "note"] as const).entries()) {
      const cell = cells[c];
      row[field] = cell?.v == null ? "" : String(cell.v);
      if (cell?.f || cell?.F || (cell?.v !== undefined && cell?.t !== "s"))
        row.invalidFields[field] = localText(
          webWordlistExcel,
          "webWordlistExcel:use_text_formulas_numbers_and_dates_are_not_allowed"
        );
    }
    rows.push(row);
  }
  if (!rows.length)
    throw new LocalWebError(
      localText(webWordlistExcel, "webWordlistExcel:no_entries_to_import")
    );
  return rows;
}

export function createExcelTemplate(): ArrayBuffer {
  const workbook = utils.book_new();
  const sheet = utils.aoa_to_sheet([["词条名称", "释义", "注释"]]);
  sheet["!cols"] = [{ wch: 30 }, { wch: 40 }, { wch: 50 }];
  utils.book_append_sheet(workbook, sheet, "词表");
  return write(workbook, { type: "array", bookType: "xlsx" });
}
