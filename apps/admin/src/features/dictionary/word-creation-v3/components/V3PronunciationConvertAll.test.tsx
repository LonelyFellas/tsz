import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Dialect, WordPronunciationV3 } from "@tsz/types";
import { App } from "@tsz/ui/admin/overlays";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { ContentEditPermissions } from "../../contentEditPermissions";
import { V3PronunciationConvertAll } from "./V3PronunciationConvertAll";

const initial: WordPronunciationV3 = {
  id: "reading",
  style: "normal",
  dict_phonetic: "bɪb",
  actual_pron: "old",
  actual_pron_rich: {
    version: 2,
    text: "old",
    annotations: [{ type: "liaison", start: 0, end: 2 }]
  },
  synthesis: {
    alphabet: "ups",
    ipa: "",
    ups: "",
    uk: { source: "upload", ipa: "manual IPA", ups: "manual UPS" },
    us: { source: "none", ipa: "another IPA", ups: "another UPS" }
  }
};
const onChange = vi.fn();
function Harness({
  value = initial,
  spelling = "bib",
  dialect = "common",
  edit = true,
  onMissingSpelling
}: {
  value?: WordPronunciationV3;
  spelling?: string;
  dialect?: Dialect;
  edit?: boolean;
  onMissingSpelling?: () => void;
}) {
  const [current, setCurrent] = useState(value);
  return (
    <App>
      <ContentEditPermissions value={{ edit, associate: true }}>
        <V3PronunciationConvertAll
          pronunciation={current}
          spelling={spelling}
          dialect={dialect}
          onMissingSpelling={onMissingSpelling}
          onChange={(patch) => {
            onChange(patch);
            setCurrent((previous) => ({ ...previous, ...patch }));
          }}
        />
        <button
          onClick={() =>
            setCurrent((previous) => ({ ...previous, dict_phonetic: "kæt" }))
          }
        >
          修改来源
        </button>
        <button
          onClick={() =>
            setCurrent((previous) => ({
              ...previous,
              actual_pron: "manual",
              actual_pron_rich: { version: 2, text: "manual", annotations: [] }
            }))
          }
        >
          修改目标
        </button>
        <output data-testid="current">{JSON.stringify(current)}</output>
      </ContentEditPermissions>
    </App>
  );
}
const current = () =>
  JSON.parse(screen.getByTestId("current").textContent!) as WordPronunciationV3;
const start = () =>
  fireEvent.click(screen.getByRole("button", { name: "全部转换" }));
const apply = () =>
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "应用转换结果"
    })
  );

it("覆盖前显示所有新旧值，取消不写回，确认一次写入并整体撤销", () => {
  onChange.mockClear();
  render(<Harness />);
  start();
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText("实际发音 当前内容")).toHaveValue("old");
  expect(within(dialog).getByLabelText("英式 Azure IPA 转换结果")).toHaveValue(
    "bɪp"
  );
  expect(within(dialog).getByLabelText("美式 Azure UPS 转换结果")).toHaveValue(
    "B IH B"
  );
  expect(current()).toEqual(initial);
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
  expect(onChange).not.toHaveBeenCalled();
  start();
  apply();
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(current()).toMatchObject({
    actual_pron: "bɪb",
    actual_pron_rich: { annotations: [] },
    synthesis: {
      uk: { source: "upload", ipa: "bɪp", ups: "B IH P" },
      us: { source: "none", ipa: "bɪb", ups: "B IH B" }
    }
  });
  fireEvent.click(screen.getByRole("button", { name: "撤销全部转换" }));
  expect(current()).toEqual(initial);
});

it.each(["修改来源", "修改目标"])(
  "确认期间%s会拒绝陈旧结果，不覆盖新输入",
  async (action) => {
    onChange.mockClear();
    render(<Harness />);
    start();
    fireEvent.click(screen.getByRole("button", { name: action }));
    const edited = current();
    apply();
    expect(current()).toEqual(edited);
    expect(onChange).not.toHaveBeenCalled();
    expect(await screen.findByText(/来源、口音或目标内容已变化/)).toBeVisible();
  }
);

it("确认期间切换口音会拒绝旧结果，转换后再编辑会失去旧撤销", async () => {
  onChange.mockClear();
  const view = render(<Harness />);
  start();
  view.rerender(<Harness dialect="uk" />);
  apply();
  expect(onChange).not.toHaveBeenCalled();
  start();
  apply();
  expect(screen.getByRole("button", { name: "撤销全部转换" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "修改目标" }));
  expect(screen.queryByRole("button", { name: "撤销全部转换" })).toBeNull();
});

it("转换失败保留全部原值并标明失败口音与字段", async () => {
  onChange.mockClear();
  const value = { ...initial, dict_phonetic: "ˈbʌtən", style: "weak" as const };
  render(<Harness value={value} spelling="button" />);
  start();
  expect(await screen.findByText(/美式 Azure IPA：.*ʔ/)).toBeVisible();
  expect(current()).toEqual(value);
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("缺少字典音标或编辑权限不能转换，缺少拼写定位拼写字段", () => {
  onChange.mockClear();
  const missing = vi.fn();
  const view = render(<Harness edit={false} />);
  expect(screen.getByRole("button", { name: "全部转换" })).toBeDisabled();
  view.rerender(
    <Harness
      key="empty-dictionary"
      value={{ ...initial, dict_phonetic: " " }}
    />
  );
  expect(screen.getByRole("button", { name: "全部转换" })).toBeDisabled();
  view.rerender(
    <Harness key="missing-spelling" spelling="" onMissingSpelling={missing} />
  );
  start();
  expect(missing).toHaveBeenCalledOnce();
  expect(onChange).not.toHaveBeenCalled();
});

it("切换界面语言保留确认中的结果和草稿", () => {
  const view = render(
    <InterfaceI18nProvider locale="zh-Hans">
      <Harness />
    </InterfaceI18nProvider>
  );
  start();
  view.rerender(
    <InterfaceI18nProvider locale="en-US">
      <Harness />
    </InterfaceI18nProvider>
  );
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByRole("dialog", { name: "Convert all" })).toBeVisible();
  expect(current()).toEqual(initial);
});
