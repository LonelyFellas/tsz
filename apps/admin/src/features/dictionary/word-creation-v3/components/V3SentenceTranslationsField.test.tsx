import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import type { WordSentenceWritableV3 } from "@tsz/types";
import { V3SentenceTranslationsField } from "./V3SentenceTranslationsField";

// 下拉项以「档名 + 含义」呈现，定位按档名开头匹配，含义单独断言。
const TIER_HINTS: Record<string, string> = {
  初阶: "逐字直译; Word-for-Word",
  中阶: "语句通顺; Balanced Fluency",
  高阶: "深层重构; Adapted Creation"
};

const initial: WordSentenceWritableV3 = {
  id: "sentence",
  level: "A1",
  en_text: {
    mode: "unified",
    common: {
      id: "en",
      origin: "manual",
      value: { version: 2, text: "Mother helps me.", annotations: [] }
    }
  },
  zh_text_id: "zh",
  zh_text: { version: 2, text: "旧译文", annotations: [] },
  zh_translations: [
    {
      id: "zh",
      band: "adapted_creation",
      content: { version: 2, text: "旧译文", annotations: [] }
    }
  ],
  links: []
};

it("每档可添加多条，改档、编辑、删除以 ID 隔离", async () => {
  const observe = vi.fn();
  function Host() {
    const [sentence, setSentence] = useState(initial);
    return (
      <ConfigProvider theme={{ token: { motion: false } }}>
        <V3SentenceTranslationsField
          sentence={sentence}
          index={0}
          onChange={(rows) => {
            observe(rows);
            setSentence((current) => ({ ...current, zh_translations: rows }));
          }}
        />
      </ConfigProvider>
    );
  }
  render(<Host />);
  expect(
    screen.getByRole("button", { name: "删除例句 1 译文 1" })
  ).toBeDisabled();
  for (const label of ["高阶", "中阶", "中阶", "初阶", "初阶"]) {
    fireEvent.click(screen.getByRole("button", { name: "添加例句 1 译文" }));
    const item = await screen.findByRole("menuitem", {
      name: new RegExp(`^${label}`)
    });
    expect(item).toHaveTextContent(TIER_HINTS[label]!);
    fireEvent.click(item);
  }
  const before = observe.mock.lastCall![0];
  expect(before.map((row: { band: string }) => row.band)).toEqual([
    "adapted_creation",
    "adapted_creation",
    "balanced_fluency",
    "balanced_fluency",
    "word_for_word",
    "word_for_word"
  ]);
  expect(new Set(before.map((row: { id: string }) => row.id)).size).toBe(6);
  const groups = screen.getAllByRole("group", { name: /译文组$/ });
  expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
    "例句 1 初阶译文组",
    "例句 1 中阶译文组",
    "例句 1 高阶译文组"
  ]);
  expect(
    groups.map((group) => within(group).getAllByRole("textbox").length)
  ).toEqual([2, 2, 2]);
  fireEvent.change(screen.getByLabelText("例句 1 译文 2 中文"), {
    target: { value: "第二条高阶译文" }
  });
  fireEvent.click(screen.getByRole("button", { name: "例句 1 译文 2 风格" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /^初阶/ }));
  const changed = observe.mock.lastCall![0];
  expect(
    within(
      screen.getByRole("group", { name: "例句 1 初阶译文组" })
    ).getAllByRole("textbox")
  ).toHaveLength(3);
  expect(changed[1]).toMatchObject({
    id: before[1].id,
    band: "word_for_word",
    content: { text: "第二条高阶译文" }
  });
  expect(changed.filter((_: unknown, i: number) => i !== 1)).toEqual(
    before.filter((_: unknown, i: number) => i !== 1)
  );
  fireEvent.click(screen.getByRole("button", { name: "删除例句 1 译文 2" }));
  expect(observe.mock.lastCall![0]).toEqual(
    before.filter((_: unknown, i: number) => i !== 1)
  );
});

it("保存期间关闭增删、改档及正文编辑", () => {
  render(
    <V3SentenceTranslationsField
      sentence={initial}
      index={0}
      disabled
      onChange={vi.fn()}
    />
  );
  expect(screen.getByLabelText("例句 1 中文")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "例句 1 译文 1 风格" })
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "添加例句 1 译文" })
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "删除例句 1 译文 1" })
  ).toBeDisabled();
});
