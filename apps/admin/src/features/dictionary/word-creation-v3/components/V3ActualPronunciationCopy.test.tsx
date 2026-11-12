import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { App } from "@tsz/ui/admin/overlays";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Dialect, WordPronunciationV3 } from "@tsz/types";
import { V3ActualPronunciationCopy } from "./V3ActualPronunciationCopy";

const pronunciation: WordPronunciationV3 = {
  id: "pron",
  style: "normal",
  dict_phonetic: "ˈfæmɪli",
  actual_pron: "old",
  actual_pron_rich: {
    version: 2,
    text: "old",
    annotations: [{ type: "bold", start: 0, end: 3 }]
  }
};
const renderCopy = (props: Parameters<typeof V3ActualPronunciationCopy>[0]) =>
  render(<V3ActualPronunciationCopy {...props} />, { wrapper: App });

it("一键转换清除旧标注，不弹确认框，撤销恢复完整富文本", async () => {
  const onChange = vi.fn();
  const props = {
    pronunciation,
    spelling: "family",
    dialect: "us" as Dialect,
    onChange
  };
  const view = renderCopy(props);
  fireEvent.click(screen.getByLabelText("从字典音标填入实际发音"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(onChange).toHaveBeenCalledExactlyOnceWith({
    actual_pron: "ˈfæməlɪ",
    actual_pron_rich: { version: 2, text: "ˈfæməlɪ", annotations: [] }
  });
  expect(screen.queryByText(/原标注已清除/)).toBeNull();
  view.rerender(
    <V3ActualPronunciationCopy
      {...props}
      pronunciation={{ ...pronunciation, ...onChange.mock.calls[0]![0] }}
    />
  );
  fireEvent.click(screen.getByLabelText("撤销实际发音填入"));
  expect(onChange).toHaveBeenLastCalledWith({
    actual_pron: "old",
    actual_pron_rich: pronunciation.actual_pron_rich
  });
  expect(screen.queryByLabelText("撤销实际发音填入")).not.toBeInTheDocument();
});

it("每次点击按当前来源、口音与读法转换，撤销只恢复上一次内容", () => {
  const onChange = vi.fn();
  const props = {
    pronunciation,
    spelling: "family",
    dialect: "us" as Dialect,
    onChange
  };
  const view = renderCopy(props);
  fireEvent.click(screen.getByLabelText("从字典音标填入实际发音"));
  const converted = { ...pronunciation, ...onChange.mock.calls[0]![0] };
  view.rerender(
    <V3ActualPronunciationCopy
      {...props}
      spelling="bib"
      dialect="uk"
      pronunciation={{ ...converted, dict_phonetic: "bɪb", style: "strong" }}
    />
  );
  fireEvent.click(screen.getByLabelText("从字典音标填入实际发音"));
  expect(onChange).toHaveBeenLastCalledWith({
    actual_pron: "bɪp",
    actual_pron_rich: { version: 2, text: "bɪp", annotations: [] }
  });
  view.rerender(
    <V3ActualPronunciationCopy
      {...props}
      pronunciation={{ ...converted, ...onChange.mock.calls[1]![0] }}
    />
  );
  fireEvent.click(screen.getByLabelText("撤销实际发音填入"));
  expect(onChange).toHaveBeenLastCalledWith({
    actual_pron: converted.actual_pron,
    actual_pron_rich: converted.actual_pron_rich
  });
});

it("没有词汇依据的弱读直接规范音标，不弹出泛化核对提示", () => {
  const onChange = vi.fn();
  renderCopy({
    pronunciation: {
      ...pronunciation,
      dict_phonetic: "ˈwɪntər",
      style: "weak",
      actual_pron: "",
      actual_pron_rich: undefined
    },
    spelling: "winter",
    dialect: "us",
    onChange
  });
  fireEvent.click(screen.getByLabelText("从字典音标填入实际发音"));
  expect(onChange).toHaveBeenCalledExactlyOnceWith({
    actual_pron: "ˈwɪntər",
    actual_pron_rich: { version: 2, text: "ˈwɪntər", annotations: [] }
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByText(/核对读法/)).toBeNull();
});

it("无效音标不改写实际发音或标注", async () => {
  const onChange = vi.fn();
  renderCopy({
    pronunciation: { ...pronunciation, dict_phonetic: "???" },
    spelling: "family",
    dialect: "us",
    onChange
  });
  fireEvent.click(screen.getByLabelText("从字典音标填入实际发音"));
  expect(onChange).not.toHaveBeenCalled();
  expect(await screen.findByText(/未支持的音标/)).toBeInTheDocument();
});

it("字典音标为空时不能转换", () => {
  const onChange = vi.fn();
  renderCopy({
    pronunciation: { ...pronunciation, dict_phonetic: "  " },
    spelling: "family",
    dialect: "us",
    onChange
  });
  expect(screen.getByLabelText("从字典音标填入实际发音")).toBeDisabled();
});

it.each([
  { actual_pron: "edited" },
  {
    actual_pron_rich: {
      version: 2 as const,
      text: "ˈfæməlɪ",
      annotations: [{ type: "bold" as const, start: 0, end: 1 }]
    }
  }
])("后续编辑实际发音或标注后不再提供旧快照撤销：%j", (edited) => {
  const onChange = vi.fn();
  const props = {
    pronunciation,
    spelling: "family",
    dialect: "us" as Dialect,
    onChange
  };
  const view = renderCopy(props);
  fireEvent.click(screen.getByLabelText("从字典音标填入实际发音"));
  view.rerender(
    <V3ActualPronunciationCopy
      {...props}
      pronunciation={{
        ...pronunciation,
        ...onChange.mock.calls[0]![0],
        ...edited
      }}
    />
  );
  expect(screen.queryByLabelText("撤销实际发音填入")).not.toBeInTheDocument();
});

it("英文界面显示本地转换校验，拒绝输入时不改原发音", async () => {
  const onChange = vi.fn();
  render(
    <InterfaceI18nProvider locale="en-US">
      <App>
        <V3ActualPronunciationCopy
          pronunciation={{ ...pronunciation, dict_phonetic: "x\u0000" }}
          spelling="family"
          dialect="uk"
          onChange={onChange}
        />
      </App>
    </InterfaceI18nProvider>
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Fill actual pronunciation from dictionary transcription"
    })
  );
  expect(
    await screen.findByText(
      "Dictionary transcriptions cannot contain control characters"
    )
  ).toBeVisible();
  expect(onChange).not.toHaveBeenCalled();
});
