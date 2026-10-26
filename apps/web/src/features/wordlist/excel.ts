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
    throw new Error("Excel 文件已损坏");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count > 1000) throw new Error("文件内容过多，请使用模板重新整理");
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (
      offset + 46 > data.length ||
      view.getUint32(offset, true) !== 0x02014b50
    )
      throw new Error("Excel 文件已损坏");
    total += view.getUint32(offset + 24, true);
    if (total > 50 * 1024 * 1024)
      throw new Error("文件展开后过大，请拆分后导入");
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
}

export function parseExcel(buffer: ArrayBuffer, fileName: string): ExcelRow[] {
  if (!/\.(xlsx|xls)$/i.test(fileName))
    throw new Error("请选择 .xls 或 .xlsx 文件");
  if (!buffer.byteLength || buffer.byteLength > MAX_EXCEL_BYTES)
    throw new Error("文件须大于 0 且不超过 10 MB");
  const data = new Uint8Array(buffer);
  const isZip = data[0] === 0x50 && data[1] === 0x4b;
  const isOle = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
    (byte, i) => data[i] === byte
  );
  if (/\.xlsx$/i.test(fileName) ? !isZip : !isOle)
    throw new Error("文件内容与扩展名不符，请另存为 Excel 文件");
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
    throw new Error("无法读取文件，请检查是否损坏或加密");
  }
  if (workbook.SheetNames.length !== 1)
    throw new Error("请保留一个工作表后重新导入");
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
  if (sheet["!merges"]?.length) throw new Error("请取消合并单元格后重新导入");
  const range = utils.decode_range(sheet["!fullref"] ?? sheet["!ref"] ?? "A1");
  if (range.e.r > MAX_IMPORT_ROWS)
    throw new Error("每次最多导入 10000 行（不含表头）");
  if (range.e.c > 2)
    throw new Error("仅支持「词条名称 / 释义 / 注释」三列，请使用模板");
  for (const [column, label] of ["词条名称", "释义", "注释"].entries()) {
    const cell = sheet[utils.encode_cell({ r: 0, c: column })];
    if (
      cell?.f ||
      cell?.F ||
      cell?.t !== "s" ||
      (String(cell.v).trim() !== label &&
        !(column === 0 && String(cell.v).trim() === "词汇"))
    )
      throw new Error(`第 1 行表头须依次为「词条名称 / 释义 / 注释」`);
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
        row.invalidFields[field] = "请改为文本，不能使用公式、数字或日期";
    }
    rows.push(row);
  }
  if (!rows.length) throw new Error("文件没有可导入的词条");
  return rows;
}

export function createExcelTemplate(): ArrayBuffer {
  const workbook = utils.book_new();
  const sheet = utils.aoa_to_sheet([["词条名称", "释义", "注释"]]);
  sheet["!cols"] = [{ wch: 30 }, { wch: 40 }, { wch: 50 }];
  utils.book_append_sheet(workbook, sheet, "词表");
  return write(workbook, { type: "array", bookType: "xlsx" });
}
