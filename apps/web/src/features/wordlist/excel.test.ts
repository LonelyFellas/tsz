import { createInterfaceI18n } from "@tsz/shared/i18n";
import { webWordlistExcel } from "@/i18n/messages/wordlist/excel";
import { describe, expect, it } from "vitest";
import { LocalWebError, webText } from "@/i18n/catalog";
import { read, utils, write } from "xlsx";
import { createExcelTemplate, parseExcel } from "./excel";
import { validateExcelRow } from "./excel-rows";

function workbook(rows: unknown[][], type: "xlsx" | "biff8" = "xlsx") {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet(rows), "词表");
  return write(book, { type: "array", bookType: type }) as ArrayBuffer;
}
const text = webText(
  createInterfaceI18n("zh-Hans", webWordlistExcel.resources),
  webWordlistExcel
);
const header = ["词条名称", "释义", "注释"];
describe.each(["xlsx", "biff8"] as const)("%s Excel 导入", (format) => {
  const name = format === "biff8" ? "词表.xls" : "词表.xlsx";
  it("保留物理行号、中文注释、短语和顺序，跳过完全空行", () => {
    const rows = parseExcel(
      workbook(
        [
          header,
          ["apple", "苹果", "作者的注"],
          [],
          ["give up", "放弃", "第二条"]
        ],
        format
      ),
      name
    );
    expect(
      rows.map((row) => [row.rowNumber, row.word, row.gloss, row.note])
    ).toEqual([
      [2, "apple", "苹果", "作者的注"],
      [4, "give up", "放弃", "第二条"]
    ]);
    expect(validateExcelRow(rows[0]!)).toEqual({});
  });
  it("继续接受旧模板的词汇表头", () => {
    const rows = parseExcel(
      workbook(
        [
          ["词汇", "释义", "注释"],
          ["apple", "苹果", "旧模板"]
        ],
        format
      ),
      name
    );
    expect(rows.map((row) => [row.word, row.gloss, row.note])).toEqual([
      ["apple", "苹果", "旧模板"]
    ]);
  });
  it("保留错误行并指出字段，不能把数字或公式当作词条名称", () => {
    const rows = parseExcel(
      workbook(
        [header, [123, "数字"], ["", "只有释义"], [{ t: "n", f: "1+1", v: 2 }]],
        format
      ),
      name
    );
    expect(rows).toHaveLength(3);
    expect(text(validateExcelRow(rows[0]!).word)).toContain("文本");
    expect(text(validateExcelRow(rows[1]!).word)).toContain("不能为空");
    expect(text(validateExcelRow(rows[2]!).word)).toContain("公式");
  });
  it("拒绝超限物理行、额外列及错误表头", () => {
    expect(() =>
      parseExcel(
        workbook(
          [header, ...Array.from({ length: 10001 }, () => ["apple"])],
          format
        ),
        name
      )
    ).toThrow(
      "webWordlistExcel:import_at_most_10_000_rows_at_a_time_excluding_the_header"
    );
    expect(() =>
      parseExcel(
        workbook([header, ["apple", "", "", "额外数据"]], format),
        name
      )
    ).toThrow("webWordlistExcel:only_columns_are_supported_use_the_template");
    expect(() =>
      parseExcel(workbook([["单词", "释义", "注释"], ["apple"]], format), name)
    ).toThrow(LocalWebError);
  });
});
it("模板使用词条名称表头，填入内容后可以导入", () => {
  const book = read(createExcelTemplate(), { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]!]!;
  expect(utils.sheet_to_json(sheet, { header: 1 })).toEqual([header]);
  utils.sheet_add_aoa(sheet, [["give up", "放弃", "新模板"]], { origin: "A2" });
  const rows = parseExcel(
    write(book, { type: "array", bookType: "xlsx" }),
    "模板.xlsx"
  );
  expect(rows.map((row) => [row.word, row.gloss, row.note])).toEqual([
    ["give up", "放弃", "新模板"]
  ]);
});
it("模板可读取；拒绝空模板、伪装格式、过大、合并和多工作表", () => {
  expect(() => parseExcel(createExcelTemplate(), "模板.xlsx")).toThrow(
    "webWordlistExcel:no_entries_to_import"
  );
  expect(() =>
    parseExcel(new TextEncoder().encode("apple,苹果").buffer, "伪装.xlsx")
  ).toThrow(
    "webWordlistExcel:file_content_does_not_match_its_extension_save_it_as_an_excel_file"
  );
  expect(() =>
    parseExcel(new ArrayBuffer(10 * 1024 * 1024 + 1), "过大.xlsx")
  ).toThrow(
    "webWordlistExcel:the_file_must_be_larger_than_0_and_no_more_than_10_mb"
  );
  const book = utils.book_new();
  const sheet = utils.aoa_to_sheet([header, ["apple"]]);
  sheet["!merges"] = [utils.decode_range("A2:B2")];
  utils.book_append_sheet(book, sheet, "词表");
  expect(() =>
    parseExcel(write(book, { type: "array", bookType: "xlsx" }), "合并.xlsx")
  ).toThrow("webWordlistExcel:unmerge_cells_and_import_again");
  utils.book_append_sheet(book, utils.aoa_to_sheet([header]), "另一个表");
  expect(() =>
    parseExcel(write(book, { type: "array", bookType: "xlsx" }), "多表.xlsx")
  ).toThrow("webWordlistExcel:keep_one_worksheet_and_import_again");
});
it("按 Unicode 字符检查字段上限及控制字符", () => {
  const row = {
    rowNumber: 2,
    word: "a".repeat(201),
    gloss: "义".repeat(201),
    note: "注".repeat(1001),
    invalidFields: {}
  };
  expect(Object.keys(validateExcelRow(row))).toEqual(["word", "gloss", "note"]);
  expect(text(validateExcelRow({ ...row, word: "apple\n" }).word)).toContain(
    "控制字符"
  );
});
