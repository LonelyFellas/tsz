import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { ExcelImport } from "./ExcelImport";
vi.mock("../excel-client", () => ({
  readExcelFile: vi.fn(),
  downloadExcelTemplate: vi.fn()
}));
vi.mock("@/lib/request", () => ({
  api: { wordList: { matchImport: vi.fn(), suggestions: vi.fn() } }
}));
import { api } from "@/lib/request";
import { readExcelFile } from "../excel-client";
const apple = {
  entry_id: "apple",
  publication_id: "pub-apple",
  label: "apple",
  glosses: ["苹果"]
};
const banana = { ...apple, entry_id: "banana", label: "banana" };
const row = (rowNumber: number, word = "apple") => ({
  rowNumber,
  word,
  gloss: "原文件释义",
  note: `注释 ${rowNumber}`,
  invalidFields: {}
});
beforeEach(() => {
  vi.clearAllMocks();
});
async function upload() {
  fireEvent.change(screen.getByLabelText("选择 Excel 文件"), {
    target: { files: [new File(["data"], "我的词表.xlsx")] }
  });
  await screen.findByText("共 2 行，2 行待处理");
}
it("唯一命中自动选中，近似候选须人工选择，确认追加保留文件顺序与注释", async () => {
  vi.mocked(readExcelFile).mockResolvedValue([row(2), row(4, "banan")]);
  vi.mocked(api.wordList.matchImport).mockResolvedValue({
    items: [
      { status: "matched", candidates: [apple] },
      { status: "unmatched", candidates: [] }
    ]
  });
  vi.mocked(api.wordList.suggestions).mockResolvedValue({ items: [banana] });
  const append = vi.fn();
  renderWithProviders(
    <ExcelImport
      existingIds={new Set()}
      remaining={10000}
      onAppend={append}
      onCancel={vi.fn()}
    />
  );
  await upload();
  fireEvent.click(screen.getByRole("button", { name: "匹配词汇" }));
  await screen.findByText(/已选定：apple/);
  expect(screen.getByRole("button", { name: "确认追加到词表" })).toBeDisabled();
  const section = within(screen.getByRole("region", { name: "文件第 4 行" }));
  fireEvent.click(section.getByRole("button", { name: "查找候选" }));
  const candidate = await section.findByRole("button", { name: /banana/ });
  expect(screen.getByRole("button", { name: "确认追加到词表" })).toBeDisabled();
  fireEvent.click(candidate);
  fireEvent.click(screen.getByRole("button", { name: "确认追加到词表" }));
  expect(append).toHaveBeenCalledWith([
    { candidate: apple, authorNote: "注释 2" },
    { candidate: banana, authorNote: "注释 4" }
  ]);
});
it("重复按词条 ID 检查，指出文件位置和已有词条，不自动丢弃", async () => {
  vi.mocked(readExcelFile).mockResolvedValue([row(2), row(4, "apples")]);
  vi.mocked(api.wordList.matchImport).mockResolvedValue({
    items: [
      { status: "matched", candidates: [apple] },
      { status: "matched", candidates: [apple] }
    ]
  });
  renderWithProviders(
    <ExcelImport
      existingIds={new Set(["apple"])}
      remaining={1}
      onAppend={vi.fn()}
      onCancel={vi.fn()}
    />
  );
  await upload();
  fireEvent.click(screen.getByRole("button", { name: "匹配词汇" }));
  await screen.findByText(/与文件第 2 行重复/);
  expect(screen.getAllByText(/与编辑器已有词条重复/)).toHaveLength(2);
  expect(screen.getByRole("button", { name: "确认追加到词表" })).toBeDisabled();
  expect(screen.getByText(/追加后超过 10000/)).toBeInTheDocument();
});
it("校验错误可在预览修正；改词后撤销旧匹配；多精确候选不能自动选择", async () => {
  vi.mocked(readExcelFile).mockResolvedValue([
    { ...row(2), word: "123", invalidFields: { word: "请改为文本" } },
    row(4, "shared")
  ]);
  vi.mocked(api.wordList.matchImport).mockResolvedValue({
    items: [
      { status: "matched", candidates: [apple] },
      { status: "ambiguous", candidates: [apple, banana] }
    ]
  });
  renderWithProviders(
    <ExcelImport
      existingIds={new Set()}
      remaining={10000}
      onAppend={vi.fn()}
      onCancel={vi.fn()}
    />
  );
  await upload();
  expect(screen.getByRole("button", { name: "匹配词汇" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("第 2 行词汇"), {
    target: { value: "apple" }
  });
  fireEvent.click(screen.getByRole("button", { name: "匹配词汇" }));
  await screen.findByText("请人工选择词条；也可修改词汇后重新匹配。");
  expect(screen.getByRole("button", { name: "确认追加到词表" })).toBeDisabled();
  fireEvent.click(
    within(screen.getByRole("region", { name: "文件第 4 行" })).getByRole(
      "button",
      { name: /banana/ }
    )
  );
  expect(screen.getByRole("button", { name: "确认追加到词表" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("第 2 行词汇"), {
    target: { value: "other" }
  });
  expect(screen.getByRole("button", { name: "确认追加到词表" })).toBeDisabled();
});
it("取消中止在途请求，晚到结果不能追加或覆盖原编辑器", async () => {
  vi.mocked(readExcelFile).mockResolvedValue([row(2), row(4)]);
  let resolve!: (value: { items: [] }) => void;
  vi.mocked(api.wordList.matchImport).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const append = vi.fn(),
    cancel = vi.fn();
  const view = renderWithProviders(
    <ExcelImport
      existingIds={new Set()}
      remaining={10000}
      onAppend={append}
      onCancel={cancel}
    />
  );
  await upload();
  fireEvent.click(screen.getByRole("button", { name: "匹配词汇" }));
  await waitFor(() => expect(api.wordList.matchImport).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "取消导入" }));
  expect(cancel).toHaveBeenCalledOnce();
  view.unmount();
  expect(
    vi.mocked(api.wordList.matchImport).mock.calls[0]![1]!.signal!.aborted
  ).toBe(true);
  resolve({ items: [] });
  expect(append).not.toHaveBeenCalled();
});

it("按 100 行分批，失败重试只请求未完成批次且保留已匹配行", async () => {
  vi.mocked(readExcelFile).mockResolvedValue(
    Array.from({ length: 101 }, (_, index) => row(index + 2, `word${index}`))
  );
  vi.mocked(api.wordList.matchImport)
    .mockImplementationOnce(async ({ words }) => ({
      items: words.map((word) => ({
        status: "matched",
        candidates: [{ ...apple, entry_id: word, label: word }]
      }))
    }))
    .mockRejectedValueOnce(new Error("网络中断"))
    .mockResolvedValueOnce({
      items: [
        {
          status: "matched",
          candidates: [{ ...apple, entry_id: "word100", label: "word100" }]
        }
      ]
    });
  const append = vi.fn();
  renderWithProviders(
    <ExcelImport
      existingIds={new Set()}
      remaining={10000}
      onAppend={append}
      onCancel={vi.fn()}
    />
  );
  fireEvent.change(screen.getByLabelText("选择 Excel 文件"), {
    target: { files: [new File(["data"], "大词表.xlsx")] }
  });
  fireEvent.click(await screen.findByRole("button", { name: "匹配词汇" }));
  await screen.findByRole("alert");
  expect(
    vi
      .mocked(api.wordList.matchImport)
      .mock.calls.map(([input]) => input.words.length)
  ).toEqual([100, 1]);
  fireEvent.click(screen.getByRole("button", { name: "匹配词汇" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "确认追加到词表" })).toBeEnabled()
  );
  expect(vi.mocked(api.wordList.matchImport).mock.calls[2]![0].words).toEqual([
    "word100"
  ]);
  fireEvent.click(screen.getByRole("button", { name: "确认追加到词表" }));
  expect(append.mock.calls[0]![0]).toHaveLength(101);
  expect(append.mock.calls[0]![0][0].candidate.entry_id).toBe("word0");
});

it("未匹配行可明确改为自定义，释义必填，追加保留词面和注释", async () => {
  vi.mocked(readExcelFile).mockResolvedValue([
    row(2, "custom phrase"),
    { ...row(3, "another phrase"), gloss: "" }
  ]);
  vi.mocked(api.wordList.matchImport).mockResolvedValue({
    items: [
      { status: "unmatched", candidates: [] },
      { status: "unmatched", candidates: [] }
    ]
  });
  const append = vi.fn();
  renderWithProviders(
    <ExcelImport
      existingIds={new Set()}
      remaining={10000}
      onAppend={append}
      onCancel={vi.fn()}
    />
  );
  await upload();
  fireEvent.click(screen.getByRole("button", { name: "匹配词汇" }));
  await screen.findAllByRole("button", { name: "创建自定义词汇" });
  for (const button of screen.getAllByRole("button", {
    name: "创建自定义词汇"
  }))
    fireEvent.click(button);
  expect(screen.getByRole("button", { name: "确认追加到词表" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("第 3 行释义"), {
    target: { value: "补充释义" }
  });
  fireEvent.click(screen.getByRole("button", { name: "确认追加到词表" }));
  expect(append).toHaveBeenCalledWith([
    {
      customWord: { word: "custom phrase", definition: "原文件释义" },
      authorNote: "注释 2"
    },
    {
      customWord: { word: "another phrase", definition: "补充释义" },
      authorNote: "注释 3"
    }
  ]);
});
