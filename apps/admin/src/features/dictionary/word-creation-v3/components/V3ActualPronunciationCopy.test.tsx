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

it("预览转换结果，应用后清除旧标注，撤销恢复完整富文本", () => {
  const onChange = vi.fn();
  const props = {
    pronunciation,
    spelling: "family",
    dialect: "us" as Dialect,
    onChange
  };
  const view = render(<V3ActualPronunciationCopy {...props} />);
  fireEvent.click(screen.getByLabelText("从字典音标填入实际发音"));
  expect(screen.getByText("ˈfæməlɪ")).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText(/^应\s*用$/));
  expect(onChange).toHaveBeenLastCalledWith({
    actual_pron: "ˈfæməlɪ",
    actual_pron_rich: { version: 2, text: "ˈfæməlɪ", annotations: [] }
  });
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
});

it.each([
  { pronunciation: { ...pronunciation, style: "weak" as const } },
  { pronunciation: { ...pronunciation, dict_phonetic: "kæt" } },
  { dialect: "uk" as const },
  { spelling: "families" }
])("转换确认期间上下文变化阻止应用旧结果：%j", (changed) => {
  const onChange = vi.fn();
  const props = {
    pronunciation,
    spelling: "family",
    dialect: "us" as Dialect,
    onChange
  };
  const view = render(<V3ActualPronunciationCopy {...props} />);
  fireEvent.click(screen.getByLabelText("从字典音标填入实际发音"));
  view.rerender(<V3ActualPronunciationCopy {...props} {...changed} />);
  fireEvent.click(screen.getByText(/^应\s*用$/));
  expect(onChange).not.toHaveBeenCalled();
  expect(
    screen.getByText(/来源、口音、读法或目标内容已变化/)
  ).toBeInTheDocument();
});

it("没有词汇依据的弱读显示提示，用户取消后不改写", () => {
  const onChange = vi.fn();
  render(
    <V3ActualPronunciationCopy
      pronunciation={{
        ...pronunciation,
        dict_phonetic: "ˈwɪntər",
        style: "weak",
        actual_pron: "",
        actual_pron_rich: undefined
      }}
      spelling="winter"
      dialect="us"
      onChange={onChange}
    />
  );
  fireEvent.click(screen.getByLabelText("从字典音标填入实际发音"));
  expect(
    screen.getByText(/请核对强弱读、喉塞音及鼻音闪音/)
  ).toBeInTheDocument();
  fireEvent.click(screen.getByText(/^取\s*消$/));
  expect(onChange).not.toHaveBeenCalled();
});
